import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { ImageService } from './image.service.js';
import { MEDIA_STORAGE, type MediaStorage } from './local-storage.js';
import { MediaSigner } from './media-signer.js';

export type MediaView = {
  id: string;
  url: string;
  expiresAt: string;
  width: number | null;
  height: number | null;
};

type MediaRow = {
  id: string;
  boutique_id: string;
  dress_id: string;
  storage_key: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
};

@Injectable()
export class MediaService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(ImageService) private readonly images: ImageService,
    @Inject(MediaSigner) private readonly signer: MediaSigner,
  ) {}

  /**
   * افزودن تصویر به لباس: اعتبارسنجی حقوق انتشار، پردازش (حذف متادیتا)،
   * ذخیره خصوصی و ثبت رکورد.
   */
  async attach(params: {
    boutiqueId: string;
    dressId: string;
    buffer: Buffer;
    declaredType: string;
    rightsAttested: boolean;
  }): Promise<MediaView> {
    if (!params.rightsAttested) {
      throw AppError.validation(
        undefined,
        'پیش از بارگذاری باید تأیید کنید که حق انتشار تصویر را دارید.',
      );
    }

    const dress = await this.runner.query<{ id: string }>(
      'SELECT id FROM dresses WHERE id = $1 AND boutique_id = $2',
      [params.dressId, params.boutiqueId],
    );
    if (dress.length === 0) throw AppError.notFound('لباس یافت نشد.');

    const processed = await this.images.process({
      buffer: params.buffer,
      declaredType: params.declaredType,
    });

    const mediaId = randomUUID();
    const storageKey = `boutiques/${params.boutiqueId}/dresses/${params.dressId}/${mediaId}.jpg`;
    await this.storage.put(storageKey, processed.buffer);

    try {
      await this.runner.query(
        `INSERT INTO dress_media
           (id, boutique_id, dress_id, storage_key, content_type, byte_size, width, height, checksum_sha256, rights_attested_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [
          mediaId,
          params.boutiqueId,
          params.dressId,
          storageKey,
          processed.contentType,
          processed.buffer.length,
          processed.width,
          processed.height,
          processed.checksumSha256,
        ],
      );
    } catch (error) {
      // اگر ثبت رکورد شکست خورد، فایل یتیم نماند
      await this.storage.remove(storageKey);
      throw error;
    }

    const signed = this.signer.createSignedPath(mediaId);
    return {
      id: mediaId,
      url: signed.path,
      expiresAt: signed.expiresAt,
      width: processed.width,
      height: processed.height,
    };
  }

  /** حذف نرم رکورد + حذف فایل فیزیکی (بدون باقی‌ماندن نسخه قابل دسترس). */
  async removeForTenant(boutiqueId: string, dressId: string, mediaId: string): Promise<void> {
    const rows = await this.runner.query<{ storage_key: string }>(
      `UPDATE dress_media SET deleted_at = now()
        WHERE id = $1 AND dress_id = $2 AND boutique_id = $3 AND deleted_at IS NULL
        RETURNING storage_key`,
      [mediaId, dressId, boutiqueId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('تصویر یافت نشد.');
    await this.storage.remove(row.storage_key);
  }

  /** رسانه‌های چند لباس با یک کوئری (تصویر اصلی هر لباس). */
  async primaryMediaFor(dressIds: string[]): Promise<Map<string, MediaView>> {
    const map = new Map<string, MediaView>();
    if (dressIds.length === 0) return map;

    const rows = await this.runner.query<MediaRow & { dress_id: string }>(
      `SELECT DISTINCT ON (dress_id) id, boutique_id, dress_id, storage_key, content_type,
              byte_size, width, height
         FROM dress_media
        WHERE dress_id = ANY($1::uuid[]) AND deleted_at IS NULL
        ORDER BY dress_id, created_at ASC`,
      [dressIds],
    );

    for (const row of rows) {
      const signed = this.signer.createSignedPath(row.id);
      map.set(row.dress_id, {
        id: row.id,
        url: signed.path,
        expiresAt: signed.expiresAt,
        width: row.width,
        height: row.height,
      });
    }
    return map;
  }

  async countForDress(dressId: string): Promise<number> {
    const rows = await this.runner.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM dress_media WHERE dress_id = $1 AND deleted_at IS NULL',
      [dressId],
    );
    return rows[0]?.count ?? 0;
  }

  /** خواندن فایل با توکن امضاشده؛ توکن منقضی یا جعلی → ۴۰۳. */
  async readSigned(mediaId: string, expires: string, token: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.signer.verify(mediaId, expires, token)) {
      throw AppError.forbidden('لینک تصویر منقضی یا نامعتبر است.');
    }
    const rows = await this.runner.query<MediaRow>(
      `SELECT id, boutique_id, dress_id, storage_key, content_type, byte_size, width, height
         FROM dress_media WHERE id = $1 AND deleted_at IS NULL`,
      [mediaId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('تصویر یافت نشد.');

    try {
      const buffer = await this.storage.read(row.storage_key);
      return { buffer, contentType: row.content_type };
    } catch {
      throw AppError.notFound('فایل تصویر در دسترس نیست.');
    }
  }
}
