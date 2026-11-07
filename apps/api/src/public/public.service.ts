import { Inject, Injectable } from '@nestjs/common';

import { type DressCategory, type PublicCatalogQuery, tomanToRial } from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { MediaService, type MediaView } from '../media/media.service.js';

type PublicDressRow = {
  id: string;
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
  published_at: Date | string | null;
  updated_at: Date | string;
  boutique_id: string;
  boutique_name: string;
  boutique_slug: string;
  city_slug: string;
};

export type PublicDressView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: DressCategory;
  attributes: Record<string, string | null>;
  priceMinRial: number | null;
  priceMaxRial: number | null;
  sampleAvailable: boolean;
  orderable: boolean;
  publishedAt: string | null;
  boutique: { id: string; name: string; slug: string; citySlug: string };
  media: MediaView[];
};

function num(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toView(row: PublicDressRow, media: MediaView[]): PublicDressView {
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
    priceMinRial: num(row.price_min_rial),
    priceMaxRial: num(row.price_max_rial),
    sampleAvailable: row.sample_available,
    orderable: row.orderable,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    boutique: {
      id: row.boutique_id,
      name: row.boutique_name,
      slug: row.boutique_slug,
      citySlug: row.city_slug,
    },
    media,
  };
}

/**
 * کاتالوگ عمومی. فقط لباس‌های `published` مزون‌های `approved` نمایش داده می‌شوند؛
 * هیچ driver یا mock داده‌ای اینجا وجود ندارد.
 */
@Injectable()
export class PublicService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  async listDresses(
    query: PublicCatalogQuery,
  ): Promise<{ items: PublicDressView[]; total: number; page: number; pageSize: number }> {
    const priceMaxRial = query.priceMaxToman === undefined ? null : tomanToRial(query.priceMaxToman);
    const like = query.q ? `%${query.q}%` : null;
    const offset = (query.page - 1) * query.pageSize;

    const where = `
      WHERE d.status = 'published'
        AND b.status = 'approved'
        AND ($1::text IS NULL OR b.city_slug = $1)
        AND ($2::text IS NULL OR d.category = $2)
        AND ($3::bigint IS NULL OR coalesce(d.price_min_rial, d.price_max_rial, 0) <= $3)
        AND ($4::text IS NULL OR d.name ILIKE $4 OR d.description ILIKE $4 OR b.name ILIKE $4)`;

    const params = [query.city ?? null, query.category ?? null, priceMaxRial, like];

    const rows = await this.runner.query<PublicDressRow>(
      `SELECT d.id, d.code, d.name, d.description, d.category, d.silhouette, d.neckline, d.sleeve,
              d.skirt, d.fabric, d.embellishment, d.color, d.price_min_rial, d.price_max_rial,
              d.sample_available, d.orderable, d.published_at, d.updated_at,
              b.id AS boutique_id, b.name AS boutique_name, b.slug AS boutique_slug, b.city_slug
         FROM dresses d
         JOIN boutiques b ON b.id = d.boutique_id
         ${where}
        ORDER BY d.published_at DESC NULLS LAST, d.updated_at DESC
        LIMIT $5 OFFSET $6`,
      [...params, query.pageSize, offset],
    );

    const totals = await this.runner.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM dresses d
         JOIN boutiques b ON b.id = d.boutique_id
         ${where}`,
      params,
    );

    const mediaMap = await this.media.primaryMediaFor(rows.map((row) => row.id));
    const casted = rows.map((row) => {
      const primary = mediaMap.get(row.id);
      return toView(row, primary ? [primary] : []);
    });

    return {
      items: casted,
      total: totals[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getDress(dressId: string): Promise<PublicDressView> {
    const rows = await this.runner.query<PublicDressRow>(
      `SELECT d.id, d.code, d.name, d.description, d.category, d.silhouette, d.neckline, d.sleeve,
              d.skirt, d.fabric, d.embellishment, d.color, d.price_min_rial, d.price_max_rial,
              d.sample_available, d.orderable, d.published_at, d.updated_at,
              b.id AS boutique_id, b.name AS boutique_name, b.slug AS boutique_slug, b.city_slug
         FROM dresses d
         JOIN boutiques b ON b.id = d.boutique_id
        WHERE d.id = $1 AND d.status = 'published' AND b.status = 'approved'`,
      [dressId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('لباس یافت نشد.');
    const mediaMap = await this.media.primaryMediaFor([row.id]);
    const primary = mediaMap.get(row.id);
    return toView(row, primary ? [primary] : []);
  }

  async getBoutique(slug: string): Promise<{
    boutique: { id: string; name: string; slug: string; citySlug: string; description: string | null };
    dresses: PublicDressView[];
  }> {
    const rows = await this.runner.query<{
      id: string;
      name: string;
      slug: string;
      city_slug: string;
      description: string | null;
    }>(
      `SELECT id, name, slug, city_slug, description
         FROM boutiques WHERE slug = $1 AND status = 'approved'`,
      [slug],
    );
    const boutique = rows[0];
    if (!boutique) throw AppError.notFound('مزون یافت نشد.');

    const dresses = await this.runner.query<PublicDressRow>(
      `SELECT d.id, d.code, d.name, d.description, d.category, d.silhouette, d.neckline, d.sleeve,
              d.skirt, d.fabric, d.embellishment, d.color, d.price_min_rial, d.price_max_rial,
              d.sample_available, d.orderable, d.published_at, d.updated_at,
              b.id AS boutique_id, b.name AS boutique_name, b.slug AS boutique_slug, b.city_slug
         FROM dresses d
         JOIN boutiques b ON b.id = d.boutique_id
        WHERE b.slug = $1 AND d.status = 'published' AND b.status = 'approved'
        ORDER BY d.published_at DESC NULLS LAST
        LIMIT 24`,
      [slug],
    );
    const mediaMap = await this.media.primaryMediaFor(dresses.map((row) => row.id));

    return {
      boutique: {
        id: boutique.id,
        name: boutique.name,
        slug: boutique.slug,
        citySlug: boutique.city_slug,
        description: boutique.description,
      },
      dresses: dresses.map((row) => {
        const primary = mediaMap.get(row.id);
        return toView(row, primary ? [primary] : []);
      }),
    };
  }

  /** فهرست شهرهایی که واقعاً مزون تأییدشده دارند (برای فیلتر صادقانه UI). */
  async listCities(): Promise<Array<{ citySlug: string; boutiqueCount: number }>> {
    const rows = await this.runner.query<{ city_slug: string; boutique_count: number }>(
      `SELECT city_slug, COUNT(*)::int AS boutique_count
         FROM boutiques WHERE status = 'approved'
        GROUP BY city_slug ORDER BY boutique_count DESC, city_slug ASC`,
    );
    return rows.map((row) => ({ citySlug: row.city_slug, boutiqueCount: row.boutique_count }));
  }
}
