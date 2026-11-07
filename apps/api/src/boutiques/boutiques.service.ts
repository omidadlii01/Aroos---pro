import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { BoutiqueCreateInput, BoutiqueStatus, Role } from '@bridalos/contracts';

import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlClient, SqlRunner } from '../database/sql.js';

export type BoutiqueView = {
  id: string;
  slug: string;
  name: string;
  citySlug: string;
  description: string | null;
  publicPhone: string | null;
  status: BoutiqueStatus;
  createdAt: string;
  myRole: Role | null;
};

type BoutiqueRow = {
  id: string;
  slug: string;
  name: string;
  city_slug: string;
  description: string | null;
  public_phone: string | null;
  status: BoutiqueStatus;
  created_at: Date | string;
  owner_user_id: string;
  my_role?: Role | null;
};

function toView(row: BoutiqueRow): BoutiqueView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    citySlug: row.city_slug,
    description: row.description,
    publicPhone: row.public_phone,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    myRole: row.my_role ?? null,
  };
}

/** پیش‌نویس نشانی پیش‌فرض؛ کاربر می‌تواند بعداً نشانی لاتین دلخواه ثبت کند. */
function generateSlug(): string {
  return `bz-${randomBytes(5).toString('hex')}`;
}

@Injectable()
export class BoutiquesService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * ایجاد مزون + عضویت مالک در یک تراکنش.
   * هر کاربری می‌تواند مزون ثبت کند؛ وضعیت اولیه همیشه `draft` است و
   * انتشار/تأیید فقط از مسیر بررسی پلتفرم انجام می‌شود.
   */
  async create(userId: string, input: BoutiqueCreateInput): Promise<BoutiqueView> {
    const slug = input.slug ?? generateSlug();

    const created = await this.runner.transaction(async (tx: SqlClient) => {
      const existing = await tx.query<{ id: string }>('SELECT id FROM boutiques WHERE slug = $1', [slug]);
      if (existing.length > 0) {
        throw AppError.conflict('این نشانی قبلاً ثبت شده است؛ نشانی دیگری انتخاب کنید.');
      }

      const rows = await tx.query<BoutiqueRow>(
        `INSERT INTO boutiques (slug, name, city_slug, description, public_phone, owner_user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft')
         RETURNING id, slug, name, city_slug, description, public_phone, status, created_at, owner_user_id`,
        [slug, input.name, input.citySlug, input.description ?? null, input.publicPhone ?? null, userId],
      );
      const boutique = rows[0];
      if (!boutique) throw AppError.internal('ثبت مزون ناموفق بود');

      await tx.query(
        `INSERT INTO memberships (user_id, boutique_id, role)
         VALUES ($1, $2, 'boutique_owner')`,
        [userId, boutique.id],
      );

      return { ...boutique, my_role: 'boutique_owner' as Role };
    });

    await this.audit.record({
      actorUserId: userId,
      tenantId: created.id,
      action: 'boutique.created',
      entityType: 'boutique',
      entityId: created.id,
      metadata: { slug, citySlug: input.citySlug },
    });

    return toView(created);
  }

  /** مزون‌هایی که کاربر در آن‌ها عضو است (همیشه با شناسه کاربر محدود می‌شود). */
  async listMine(userId: string): Promise<BoutiqueView[]> {
    const rows = await this.runner.query<BoutiqueRow>(
      `SELECT b.id, b.slug, b.name, b.city_slug, b.description, b.public_phone, b.status,
              b.created_at, b.owner_user_id, m.role AS my_role
         FROM memberships m
         JOIN boutiques b ON b.id = m.boutique_id
        WHERE m.user_id = $1 AND m.revoked_at IS NULL
        ORDER BY b.created_at DESC`,
      [userId],
    );
    return rows.map(toView);
  }

  /**
   * خواندن یک مزون.
   * مجاز: عضو مزون، یا مزون تأییدشده (کاتالوگ عمومی). سایر حالت‌ها ۴۰۴
   * (نه ۴۰۳) تا وجود مزون‌های دیگر لو نرود.
   */
  async getForUser(userId: string, boutiqueId: string): Promise<BoutiqueView> {
    const rows = await this.runner.query<BoutiqueRow>(
      `SELECT b.id, b.slug, b.name, b.city_slug, b.description, b.public_phone, b.status,
              b.created_at, b.owner_user_id, m.role AS my_role
         FROM boutiques b
         LEFT JOIN memberships m
           ON m.boutique_id = b.id AND m.user_id = $1 AND m.revoked_at IS NULL
        WHERE b.id = $2`,
      [userId, boutiqueId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('مزون یافت نشد.');
    if (!row.my_role && row.status !== 'approved') {
      throw AppError.notFound('مزون یافت نشد.');
    }
    return toView(row);
  }

  async updateOwned(
    userId: string,
    boutiqueId: string,
    input: Partial<Pick<BoutiqueCreateInput, 'name' | 'description' | 'publicPhone' | 'citySlug'>>,
  ): Promise<BoutiqueView> {
    const rows = await this.runner.query<BoutiqueRow>(
      `UPDATE boutiques
          SET name = COALESCE($3, name),
              description = COALESCE($4, description),
              public_phone = COALESCE($5, public_phone),
              city_slug = COALESCE($6, city_slug),
              updated_at = now()
        WHERE id = $1 AND owner_user_id = $2
        RETURNING id, slug, name, city_slug, description, public_phone, status, created_at, owner_user_id`,
      [
        boutiqueId,
        userId,
        input.name ?? null,
        input.description ?? null,
        input.publicPhone ?? null,
        input.citySlug ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('مزون یافت نشد.');
    await this.audit.record({
      actorUserId: userId,
      tenantId: boutiqueId,
      action: 'boutique.updated',
      entityType: 'boutique',
      entityId: boutiqueId,
      metadata: { fields: Object.keys(input) },
    });
    return toView({ ...row, my_role: 'boutique_owner' });
  }

  /** ارسال برای بررسی: draft → pending_review */
  async submitForReview(userId: string, boutiqueId: string): Promise<BoutiqueView> {
    const rows = await this.runner.query<BoutiqueRow>(
      `UPDATE boutiques
          SET status = 'pending_review', submitted_at = now(), updated_at = now()
        WHERE id = $1 AND owner_user_id = $2 AND status = 'draft'
        RETURNING id, slug, name, city_slug, description, public_phone, status, created_at, owner_user_id`,
      [boutiqueId, userId],
    );
    const row = rows[0];
    if (!row) {
      const exists = await this.runner.query<{ status: BoutiqueStatus }>(
        'SELECT status FROM boutiques WHERE id = $1 AND owner_user_id = $2',
        [boutiqueId, userId],
      );
      if (exists[0]) {
        throw AppError.conflict('فقط مزون پیش‌نویس را می‌توان برای بررسی ارسال کرد.');
      }
      throw AppError.notFound('مزون یافت نشد.');
    }
    await this.audit.record({
      actorUserId: userId,
      tenantId: boutiqueId,
      action: 'boutique.submitted_for_review',
      entityType: 'boutique',
      entityId: boutiqueId,
    });
    return toView({ ...row, my_role: 'boutique_owner' });
  }
}
