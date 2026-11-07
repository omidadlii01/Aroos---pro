import { Inject, Injectable } from '@nestjs/common';

import { maskMobile, type BoutiqueMemberView, type MemberInviteInput, type Role } from '@bridalos/contracts';

import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';

type MemberRow = {
  user_id: string;
  display_name: string | null;
  phone: string;
  role: Role;
  invited_at: Date | string;
  revoked_at: Date | string | null;
};

function toView(row: MemberRow): BoutiqueMemberView {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    phoneMasked: maskMobile(row.phone),
    role: row.role,
    invitedAt: new Date(row.invited_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}

/**
 * مدیریت کارکنان مزون. تمام عملیات با `boutique_id` محدود می‌شود (tenant-scoped)
 * و مجوز سمت سرور در `TenantGuard` + `@RequireTenantRole` بررسی شده است.
 */
@Injectable()
export class MembersService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(boutiqueId: string): Promise<BoutiqueMemberView[]> {
    const rows = await this.runner.query<MemberRow>(
      `SELECT m.user_id, u.display_name, u.phone, m.role, m.invited_at, m.revoked_at
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.boutique_id = $1
        ORDER BY m.revoked_at NULLS FIRST, m.invited_at ASC`,
      [boutiqueId],
    );
    return rows.map(toView);
  }

  /**
   * دعوت کارمند با شماره موبایل. اگر کاربر وجود نداشته باشد ساخته می‌شود و
   * پس از اولین ورود، عضویت فعال او آماده است. ارسال پیامک دعوت **مسدود به‌علت
   * دسترسی** است؛ بنابراین دعوت صرفاً در سامانه ثبت می‌شود.
   */
  async invite(
    boutiqueId: string,
    actorId: string,
    input: MemberInviteInput,
  ): Promise<{ member: BoutiqueMemberView; smsSent: false; noteFa: string }> {
    const owner = await this.runner.query<{ owner_user_id: string }>(
      'SELECT owner_user_id FROM boutiques WHERE id = $1',
      [boutiqueId],
    );
    if (owner.length === 0) throw AppError.notFound('مزون یافت نشد.');

    const member = await this.runner.transaction(async (tx) => {
      const users = await tx.query<{ id: string }>(
        `INSERT INTO users (phone) VALUES ($1)
         ON CONFLICT (phone) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [input.phone],
      );
      const userId = users[0]?.id;
      if (!userId) throw AppError.internal('ساخت کاربر ناموفق بود');

      if (userId === owner[0]?.owner_user_id) {
        throw AppError.conflict('مالک مزون از قبل دسترسی کامل دارد.');
      }

      const existing = await tx.query<{ id: string; revoked_at: Date | string | null }>(
        'SELECT id, revoked_at FROM memberships WHERE user_id = $1 AND boutique_id = $2',
        [userId, boutiqueId],
      );

      if (existing.length > 0) {
        const row = existing[0]!;
        if (row.revoked_at === null) {
          throw AppError.conflict('این کاربر از قبل عضو این مزون است.');
        }
        await tx.query(
          `UPDATE memberships
              SET role = $2, revoked_at = NULL, invited_at = now(), invited_by = $3,
                  accepted_at = NULL, updated_at = now()
            WHERE id = $1`,
          [row.id, input.role, actorId],
        );
      } else {
        await tx.query(
          `INSERT INTO memberships (user_id, boutique_id, role, invited_by)
           VALUES ($1, $2, $3, $4)`,
          [userId, boutiqueId, input.role, actorId],
        );
      }

      const rows = await tx.query<MemberRow>(
        `SELECT m.user_id, u.display_name, u.phone, m.role, m.invited_at, m.revoked_at
           FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.boutique_id = $1 AND m.user_id = $2`,
        [boutiqueId, userId],
      );
      const created = rows[0];
      if (!created) throw AppError.internal('ثبت عضویت ناموفق بود');
      return created;
    });

    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'membership.invited',
      entityType: 'membership',
      entityId: member.user_id,
      metadata: { role: input.role },
    });

    return {
      member: toView(member),
      smsSent: false,
      noteFa:
        'عضویت ثبت شد، اما پیامک دعوت ارسال نشد: آداپتور پیامک واقعی پیکربندی نشده است. کاربر می‌تواند با همین شماره وارد شود.',
    };
  }

  async updateRole(
    boutiqueId: string,
    actorId: string,
    targetUserId: string,
    role: Role,
  ): Promise<BoutiqueMemberView> {
    await this.assertNotOwnerTarget(boutiqueId, targetUserId);

    const rows = await this.runner.query<MemberRow>(
      `UPDATE memberships m
          SET role = $3, updated_at = now()
         FROM users u
        WHERE m.boutique_id = $1 AND m.user_id = $2 AND u.id = m.user_id AND m.revoked_at IS NULL
        RETURNING m.user_id, u.display_name, u.phone, m.role, m.invited_at, m.revoked_at`,
      [boutiqueId, targetUserId, role],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('عضویت فعال برای این کاربر یافت نشد.');

    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'membership.role_changed',
      entityType: 'membership',
      entityId: targetUserId,
      metadata: { role },
    });
    return toView(row);
  }

  async revoke(boutiqueId: string, actorId: string, targetUserId: string): Promise<{ revoked: true }> {
    if (targetUserId === actorId) {
      throw AppError.conflict('نمی‌توانید دسترسی خودتان را لغو کنید.');
    }
    await this.assertNotOwnerTarget(boutiqueId, targetUserId);

    const rows = await this.runner.query<{ id: string }>(
      `UPDATE memberships SET revoked_at = now(), updated_at = now()
        WHERE boutique_id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [boutiqueId, targetUserId],
    );
    if (rows.length === 0) throw AppError.notFound('عضویت فعال برای این کاربر یافت نشد.');

    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'membership.revoked',
      entityType: 'membership',
      entityId: targetUserId,
    });
    return { revoked: true };
  }

  private async assertNotOwnerTarget(boutiqueId: string, targetUserId: string): Promise<void> {
    const rows = await this.runner.query<{ owner_user_id: string }>(
      'SELECT owner_user_id FROM boutiques WHERE id = $1',
      [boutiqueId],
    );
    if (rows[0]?.owner_user_id === targetUserId) {
      throw AppError.conflict('دسترسی مالک مزون از این مسیر قابل تغییر نیست.');
    }
  }
}
