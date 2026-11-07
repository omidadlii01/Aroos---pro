import { Inject, Injectable } from '@nestjs/common';

import {
  BOUTIQUE_STATUSES,
  maskMobile,
  type AdminAuditView,
  type AdminBoutiqueView,
  type AdminOverview,
  type BoutiqueStatus,
  type BoutiqueRejectInput,
} from '@bridalos/contracts';

import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlClient, SqlRunner } from '../database/sql.js';

type AdminBoutiqueRow = {
  id: string;
  slug: string;
  name: string;
  city_slug: string;
  status: BoutiqueStatus;
  owner_name: string | null;
  owner_phone: string;
  submitted_at: Date | string | null;
  reviewed_at: Date | string | null;
  review_reason: string | null;
  created_at: Date | string;
  dress_count: string | number;
  published_dress_count: string | number;
};

function toView(row: AdminBoutiqueRow): AdminBoutiqueView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    citySlug: row.city_slug,
    status: row.status,
    ownerName: row.owner_name,
    ownerPhoneMasked: maskMobile(row.owner_phone),
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewReason: row.review_reason,
    dressCount: Number(row.dress_count),
    publishedDressCount: Number(row.published_dress_count),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * سرویس بررسی پلتفرم.
 *
 * قواعد: فقط مزون `pending_review` قابل تأیید/رد است؛ هر تصمیم با بازبین، زمان و
 * (در رد) دلیل ثبت می‌شود؛ رد مانع اصلاح و ارسال دوباره توسط مالک نیست.
 * شماره مالک همیشه ماسک‌شده برمی‌گردد (الزام حداقل‌سازی داده).
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listBoutiques(params: {
    status?: BoutiqueStatus;
    page: number;
    pageSize: number;
  }): Promise<{ items: AdminBoutiqueView[]; total: number; page: number; pageSize: number }> {
    const status = params.status ?? null;
    const offset = (params.page - 1) * params.pageSize;

    const rows = await this.runner.query<AdminBoutiqueRow>(
      `SELECT b.id, b.slug, b.name, b.city_slug, b.status, b.submitted_at, b.reviewed_at,
              b.review_reason, b.created_at,
              u.display_name AS owner_name, u.phone AS owner_phone,
              (SELECT count(*) FROM dresses d WHERE d.boutique_id = b.id AND d.status <> 'archived') AS dress_count,
              (SELECT count(*) FROM dresses d WHERE d.boutique_id = b.id AND d.status = 'published'
                 AND d.status <> 'archived') AS published_dress_count
         FROM boutiques b
         JOIN users u ON u.id = b.owner_user_id
        WHERE ($1::text IS NULL OR b.status = $1)
        ORDER BY
          CASE WHEN b.status = 'pending_review' THEN 0 ELSE 1 END,
          COALESCE(b.submitted_at, b.created_at) DESC
        LIMIT $2 OFFSET $3`,
      [status, params.pageSize, offset],
    );

    const totals = await this.runner.query<{ total: string | number }>(
      'SELECT count(*) AS total FROM boutiques WHERE ($1::text IS NULL OR status = $1)',
      [status],
    );

    return {
      items: rows.map(toView),
      total: Number(totals[0]?.total ?? 0),
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async approve(adminUserId: string, boutiqueId: string): Promise<AdminBoutiqueView> {
    const updated = await this.runner.transaction(async (tx: SqlClient) => {
      const rows = await tx.query<{ id: string; name: string }>(
        `UPDATE boutiques
            SET status = 'approved',
                reviewed_at = now(),
                reviewed_by_user_id = $2,
                review_reason = NULL,
                updated_at = now()
          WHERE id = $1 AND status = 'pending_review'
          RETURNING id, name`,
        [boutiqueId, adminUserId],
      );
      const row = rows[0];
      if (!row) {
        const exists = await tx.query<{ status: BoutiqueStatus }>(
          'SELECT status FROM boutiques WHERE id = $1',
          [boutiqueId],
        );
        if (!exists[0]) throw AppError.notFound('مزون یافت نشد.');
        throw AppError.conflict('فقط مزون «در انتظار بررسی» قابل تأیید است.');
      }
      return row;
    });

    await this.audit.record({
      actorUserId: adminUserId,
      tenantId: boutiqueId,
      action: 'boutique.approved',
      entityType: 'boutique',
      entityId: boutiqueId,
      metadata: { name: updated.name },
    });

    return this.getBoutiqueOrFail(boutiqueId);
  }

  async reject(
    adminUserId: string,
    boutiqueId: string,
    input: BoutiqueRejectInput,
  ): Promise<AdminBoutiqueView> {
    const updated = await this.runner.transaction(async (tx: SqlClient) => {
      const rows = await tx.query<{ id: string; name: string }>(
        `UPDATE boutiques
            SET status = 'rejected',
                reviewed_at = now(),
                reviewed_by_user_id = $2,
                review_reason = $3,
                updated_at = now()
          WHERE id = $1 AND status = 'pending_review'
          RETURNING id, name`,
        [boutiqueId, adminUserId, input.reason],
      );
      const row = rows[0];
      if (!row) {
        const exists = await tx.query<{ status: BoutiqueStatus }>(
          'SELECT status FROM boutiques WHERE id = $1',
          [boutiqueId],
        );
        if (!exists[0]) throw AppError.notFound('مزون یافت نشد.');
        throw AppError.conflict('فقط مزون «در انتظار بررسی» قابل رد است.');
      }
      return row;
    });

    await this.audit.record({
      actorUserId: adminUserId,
      tenantId: boutiqueId,
      action: 'boutique.rejected',
      entityType: 'boutique',
      entityId: boutiqueId,
      metadata: { name: updated.name, reason: input.reason },
    });

    return this.getBoutiqueOrFail(boutiqueId);
  }

  async overview(): Promise<AdminOverview> {
    const boutiqueRows = await this.runner.query<{ status: BoutiqueStatus; count: string | number }>(
      'SELECT status, count(*) AS count FROM boutiques GROUP BY status',
    );
    const boutiques = Object.fromEntries(BOUTIQUE_STATUSES.map((status) => [status, 0])) as Record<
      BoutiqueStatus,
      number
    >;
    for (const row of boutiqueRows) boutiques[row.status] = Number(row.count);

    const dressRows = await this.runner.query<{ status: string; count: string | number }>(
      'SELECT status, count(*) AS count FROM dresses GROUP BY status',
    );
    const dresses: Record<string, number> = {};
    for (const row of dressRows) dresses[row.status] = Number(row.count);

    const users = await this.runner.query<{ count: string | number }>('SELECT count(*) AS count FROM users');

    return {
      boutiques,
      dresses,
      pendingBoutiques: boutiques.pending_review,
      users: Number(users[0]?.count ?? 0),
      publishedDresses: dresses.published ?? 0,
    };
  }

  async auditLog(limit: number): Promise<AdminAuditView[]> {
    const rows = await this.runner.query<{
      id: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      created_at: Date | string;
    }>(
      `SELECT id, action, entity_type, entity_id, created_at
         FROM audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  private async getBoutiqueOrFail(boutiqueId: string): Promise<AdminBoutiqueView> {
    const rows = await this.runner.query<AdminBoutiqueRow>(
      `SELECT b.id, b.slug, b.name, b.city_slug, b.status, b.submitted_at, b.reviewed_at,
              b.review_reason, b.created_at,
              u.display_name AS owner_name, u.phone AS owner_phone,
              (SELECT count(*) FROM dresses d WHERE d.boutique_id = b.id AND d.status <> 'archived') AS dress_count,
              (SELECT count(*) FROM dresses d WHERE d.boutique_id = b.id AND d.status = 'published'
                 AND d.status <> 'archived') AS published_dress_count
         FROM boutiques b
         JOIN users u ON u.id = b.owner_user_id
        WHERE b.id = $1`,
      [boutiqueId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('مزون یافت نشد.');
    return toView(row);
  }
}
