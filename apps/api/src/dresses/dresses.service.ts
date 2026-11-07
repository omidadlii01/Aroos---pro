import { Inject, Injectable } from '@nestjs/common';

import {
  type DressCategory,
  type DressCreateInput,
  type DressStatus,
  type DressUpdateInput,
  makePriceRange,
  tomanToRial,
} from '@bridalos/contracts';

import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { MediaService, type MediaView } from '../media/media.service.js';

export type DressView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: DressCategory;
  attributes: {
    silhouette: string | null;
    neckline: string | null;
    sleeve: string | null;
    skirt: string | null;
    fabric: string | null;
    embellishment: string | null;
    color: string | null;
  };
  priceMinRial: number | null;
  priceMaxRial: number | null;
  sampleAvailable: boolean;
  orderable: boolean;
  status: DressStatus;
  publishedAt: string | null;
  updatedAt: string;
  media: MediaView[];
};

type DressRow = {
  id: string;
  boutique_id: string;
  code: string;
  name: string;
  description: string | null;
  category: DressCategory;
  silhouette: string | null;
  neckline: string | null;
  sleeve: string | null;
  skirt: string | null;
  fabric: string | null;
  embellishment: string | null;
  color: string | null;
  price_min_rial: string | number | null;
  price_max_rial: string | number | null;
  sample_available: boolean;
  orderable: boolean;
  status: DressStatus;
  published_at: Date | string | null;
  updated_at: Date | string;
};

const SELECT_COLUMNS = `
  id, boutique_id, code, name, description, category, silhouette, neckline, sleeve, skirt,
  fabric, embellishment, color, price_min_rial, price_max_rial, sample_available, orderable,
  status, published_at, updated_at`;

function toRialNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toView(row: DressRow, media: MediaView[]): DressView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    attributes: {
      silhouette: row.silhouette,
      neckline: row.neckline,
      sleeve: row.sleeve,
      skirt: row.skirt,
      fabric: row.fabric,
      embellishment: row.embellishment,
      color: row.color,
    },
    priceMinRial: toRialNumber(row.price_min_rial),
    priceMaxRial: toRialNumber(row.price_max_rial),
    sampleAvailable: row.sample_available,
    orderable: row.orderable,
    status: row.status,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    media,
  };
}

/** تبدیل مبلغ تومانی ورودی فرم به ریال؛ ورودی نامعتبر با خطای فارسی رد می‌شود. */
function rialOrNull(toman: number | undefined): number | null {
  if (toman === undefined) return null;
  return tomanToRial(toman);
}

@Injectable()
export class DressesService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listForTenant(
    boutiqueId: string,
    query: { status?: DressStatus; q?: string; page: number; pageSize: number },
  ): Promise<{ items: DressView[]; total: number; page: number; pageSize: number }> {
    const offset = (query.page - 1) * query.pageSize;
    const like = query.q ? `%${query.q}%` : null;

    const rows = await this.runner.query<DressRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM dresses
        WHERE boutique_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR name ILIKE $3 OR code ILIKE $3)
        ORDER BY updated_at DESC
        LIMIT $4 OFFSET $5`,
      [boutiqueId, query.status ?? null, like, query.pageSize, offset],
    );

    const totals = await this.runner.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM dresses
        WHERE boutique_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR name ILIKE $3 OR code ILIKE $3)`,
      [boutiqueId, query.status ?? null, like],
    );

    const mediaMap = await this.media.primaryMediaFor(rows.map((row) => row.id));
    return {
      items: rows.map((row) => {
        const primary = mediaMap.get(row.id);
        return toView(row, primary ? [primary] : []);
      }),
      total: totals[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getForTenant(boutiqueId: string, dressId: string): Promise<DressView> {
    const rows = await this.runner.query<DressRow>(
      `SELECT ${SELECT_COLUMNS} FROM dresses WHERE id = $1 AND boutique_id = $2`,
      [dressId, boutiqueId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('لباس یافت نشد.');
    const mediaMap = await this.media.primaryMediaFor([row.id]);
    const primary = mediaMap.get(row.id);
    return toView(row, primary ? [primary] : []);
  }

  async create(boutiqueId: string, actorId: string, input: DressCreateInput): Promise<DressView> {
    const minRial = rialOrNull(input.priceMinToman);
    const maxRial = rialOrNull(input.priceMaxToman);
    if (minRial !== null && maxRial !== null) makePriceRange(minRial, maxRial);

    const duplicate = await this.runner.query<{ id: string }>(
      'SELECT id FROM dresses WHERE boutique_id = $1 AND code = $2',
      [boutiqueId, input.code],
    );
    if (duplicate.length > 0) {
      throw AppError.conflict('این کد لباس قبلاً در مزون ثبت شده است.');
    }

    const rows = await this.runner.query<DressRow>(
      `INSERT INTO dresses
         (boutique_id, code, name, description, category, silhouette, neckline, sleeve, skirt,
          fabric, embellishment, color, price_min_rial, price_max_rial, sample_available, orderable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING ${SELECT_COLUMNS}`,
      [
        boutiqueId,
        input.code,
        input.name,
        input.description ?? null,
        input.category,
        input.silhouette ?? null,
        input.neckline ?? null,
        input.sleeve ?? null,
        input.skirt ?? null,
        input.fabric ?? null,
        input.embellishment ?? null,
        input.color ?? null,
        minRial,
        maxRial,
        input.sampleAvailable,
        input.orderable,
      ],
    );
    const row = rows[0];
    if (!row) throw AppError.internal('ثبت لباس ناموفق بود');

    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'dress.created',
      entityType: 'dress',
      entityId: row.id,
      metadata: { code: input.code, category: input.category },
    });
    return toView(row, []);
  }

  async update(
    boutiqueId: string,
    actorId: string,
    dressId: string,
    input: DressUpdateInput,
  ): Promise<DressView> {
    const current = await this.runner.query<DressRow>(
      `SELECT ${SELECT_COLUMNS} FROM dresses WHERE id = $1 AND boutique_id = $2`,
      [dressId, boutiqueId],
    );
    const existing = current[0];
    if (!existing) throw AppError.notFound('لباس یافت نشد.');
    if (existing.status === 'published') {
      throw AppError.conflict(
        'لباس منتشرشده قابل ویرایش نیست؛ ابتدا آن را بایگانی کنید یا نسخه جدید بسازید.',
      );
    }

    const minRial = input.priceMinToman === undefined ? undefined : rialOrNull(input.priceMinToman);
    const maxRial = input.priceMaxToman === undefined ? undefined : rialOrNull(input.priceMaxToman);
    const effectiveMin = minRial === undefined ? toRialNumber(existing.price_min_rial) : minRial;
    const effectiveMax = maxRial === undefined ? toRialNumber(existing.price_max_rial) : maxRial;
    if (effectiveMin !== null && effectiveMax !== null) makePriceRange(effectiveMin, effectiveMax);

    const rows = await this.runner.query<DressRow>(
      `UPDATE dresses SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         category = COALESCE($5, category),
         silhouette = COALESCE($6, silhouette),
         neckline = COALESCE($7, neckline),
         sleeve = COALESCE($8, sleeve),
         skirt = COALESCE($9, skirt),
         fabric = COALESCE($10, fabric),
         embellishment = COALESCE($11, embellishment),
         color = COALESCE($12, color),
         price_min_rial = COALESCE($13, price_min_rial),
         price_max_rial = COALESCE($14, price_max_rial),
         sample_available = COALESCE($15, sample_available),
         orderable = COALESCE($16, orderable),
         updated_at = now()
       WHERE id = $1 AND boutique_id = $2
       RETURNING ${SELECT_COLUMNS}`,
      [
        dressId,
        boutiqueId,
        input.name ?? null,
        input.description ?? null,
        input.category ?? null,
        input.silhouette ?? null,
        input.neckline ?? null,
        input.sleeve ?? null,
        input.skirt ?? null,
        input.fabric ?? null,
        input.embellishment ?? null,
        input.color ?? null,
        minRial ?? null,
        maxRial ?? null,
        input.sampleAvailable ?? null,
        input.orderable ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('لباس یافت نشد.');

    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'dress.updated',
      entityType: 'dress',
      entityId: dressId,
      metadata: { fields: Object.keys(input) },
    });
    const mediaMap = await this.media.primaryMediaFor([dressId]);
    const primaryMedia = mediaMap.get(dressId);
    return toView(row, primaryMedia ? [primaryMedia] : []);
  }

  /** انتشار: الزامات محتوایی سرور‌ساید بررسی می‌شوند، نه در UI. */
  async publish(boutiqueId: string, actorId: string, dressId: string): Promise<DressView> {
    const rows = await this.runner.query<DressRow>(
      `SELECT ${SELECT_COLUMNS} FROM dresses WHERE id = $1 AND boutique_id = $2`,
      [dressId, boutiqueId],
    );
    const dress = rows[0];
    if (!dress) throw AppError.notFound('لباس یافت نشد.');
    if (dress.status === 'published') throw AppError.conflict('این لباس قبلاً منتشر شده است.');
    if (dress.status === 'archived') {
      throw AppError.conflict('لباس بایگانی‌شده قابل انتشار نیست؛ ابتدا آن را بازگردانید.');
    }

    const missing: string[] = [];
    if (!dress.description || dress.description.trim().length < 20) {
      missing.push('توضیح لباس (حداقل ۲۰ نویسه)');
    }
    if (toRialNumber(dress.price_min_rial) === null && toRialNumber(dress.price_max_rial) === null) {
      missing.push('بازه قیمت');
    }
    const mediaCount = await this.media.countForDress(dressId);
    if (mediaCount === 0) missing.push('حداقل یک تصویر با تأیید حقوق انتشار');

    if (missing.length > 0) {
      throw AppError.conflict(`برای انتشار این موارد لازم است: ${missing.join('، ')}.`);
    }

    const boutique = await this.runner.query<{ status: string }>(
      'SELECT status FROM boutiques WHERE id = $1',
      [boutiqueId],
    );
    if (boutique[0]?.status !== 'approved') {
      throw AppError.conflict(
        'انتشار لباس فقط برای مزون تأییدشده ممکن است؛ وضعیت مزون شما هنوز تأیید نشده است.',
      );
    }

    const published = await this.runner.query<DressRow>(
      `UPDATE dresses SET status = 'published', published_at = now(), updated_at = now()
        WHERE id = $1 AND boutique_id = $2
        RETURNING ${SELECT_COLUMNS}`,
      [dressId, boutiqueId],
    );
    const row = published[0];
    if (!row) throw AppError.internal('انتشار لباس ناموفق بود');

    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'dress.published',
      entityType: 'dress',
      entityId: dressId,
      metadata: { mediaCount },
    });
    const mediaMap = await this.media.primaryMediaFor([dressId]);
    const primary = mediaMap.get(dressId);
    return toView(row, primary ? [primary] : []);
  }

  async archive(boutiqueId: string, actorId: string, dressId: string): Promise<DressView> {
    const rows = await this.runner.query<DressRow>(
      `UPDATE dresses SET status = 'archived', updated_at = now()
        WHERE id = $1 AND boutique_id = $2 AND status <> 'archived'
        RETURNING ${SELECT_COLUMNS}`,
      [dressId, boutiqueId],
    );
    const row = rows[0];
    if (!row) {
      const exists = await this.runner.query<{ id: string }>(
        'SELECT id FROM dresses WHERE id = $1 AND boutique_id = $2',
        [dressId, boutiqueId],
      );
      if (exists.length > 0) {
        const view = await this.getForTenant(boutiqueId, dressId);
        return view;
      }
      throw AppError.notFound('لباس یافت نشد.');
    }
    await this.audit.record({
      actorUserId: actorId,
      tenantId: boutiqueId,
      action: 'dress.archived',
      entityType: 'dress',
      entityId: dressId,
    });
    return toView(row, []);
  }
}
