import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  PHOTO_CONSENT_VERSION,
  PHOTO_RETENTION_DAYS,
  type BridePhotoView,
} from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { ImageService } from '../media/image.service.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/local-storage.js';
import { MediaSigner } from '../media/media-signer.js';

type PhotoRow = {
  id: string;
  storage_key: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  consent_version: string;
  consent_given_at: Date | string;
  retention_until: Date | string;
  created_at: Date | string;
};

function toView(row: PhotoRow, signer: MediaSigner): BridePhotoView {
  const signed = signer.createSignedPath(row.id, { basePath: `/api/v1/photos/${row.id}/file` });
  return {
    id: row.id,
    url: signed.path,
    expiresAt: signed.expiresAt,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    consentVersion: row.consent_version,
    consentGivenAt: new Date(row.consent_given_at).toISOString(),
    retentionUntil: new Date(row.retention_until).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * عکس شخصی عروس.
 *
 * اصول: ذخیره‌سازی خصوصی، رضایت نسخه‌دار اجباری، دسترسی فقط مالک یا URL امضاشده
 * کوتاه‌عمر، تاریخ حذف خودکار در هر رکورد، و حذف کامل (رکورد + فایل) به‌درخواست کاربر.
 * هیچ endpoint عمومی به این داده دسترسی ندارد.
 */
@Injectable()
export class PhotosService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(ImageService) private readonly images: ImageService,
    @Inject(MediaSigner) private readonly signer: MediaSigner,
  ) {}

  async upload(params: {
    userId: string;
    buffer: Buffer;
    declaredType: string;
    consentGiven: boolean;
    consentVersion: string | undefined;
  }): Promise<BridePhotoView> {
    if (!params.consentGiven) {
      throw AppError.validation(
        undefined,
        'بارگذاری عکس بدون رضایت صریح ممکن نیست؛ ابتدا متن رضایت‌نامه را تأیید کنید.',
      );
    }
    if (params.consentVersion !== PHOTO_CONSENT_VERSION) {
      throw AppError.validation(
        undefined,
        `نسخه رضایت‌نامه معتبر نیست؛ صفحه را بازخوانی کنید (نسخه جاری: ${PHOTO_CONSENT_VERSION}).`,
      );
    }

    const processed = await this.images.process({
      buffer: params.buffer,
      declaredType: params.declaredType,
    });

    const photoId = randomUUID();
    const storageKey = `brides/${params.userId}/photos/${photoId}.jpg`;
    await this.storage.put(storageKey, processed.buffer);

    try {
      const rows = await this.runner.query<PhotoRow>(
        `INSERT INTO bride_photos
           (id, user_id, storage_key, content_type, byte_size, width, height,
            checksum_sha256, consent_version, consent_given_at, retention_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now() + ($10 || ' days')::interval)
         RETURNING id, storage_key, content_type, byte_size, width, height,
                   consent_version, consent_given_at, retention_until, created_at`,
        [
          photoId,
          params.userId,
          storageKey,
          processed.contentType,
          processed.buffer.length,
          processed.width,
          processed.height,
          processed.checksumSha256,
          params.consentVersion,
          String(PHOTO_RETENTION_DAYS),
        ],
      );
      const row = rows[0];
      if (!row) throw AppError.internal('ثبت عکس ناموفق بود.');
      return toView(row, this.signer);
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async listMine(userId: string): Promise<BridePhotoView[]> {
    const rows = await this.runner.query<PhotoRow>(
      `SELECT id, storage_key, content_type, byte_size, width, height,
              consent_version, consent_given_at, retention_until, created_at
         FROM bride_photos
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((row) => toView(row, this.signer));
  }

  /** حذف کامل: فایل فیزیکی و رکورد (حذف سخت، بدون باقی‌ماندن نسخه قابل دسترس). */
  async deleteOwn(userId: string, photoId: string): Promise<void> {
    const rows = await this.runner.query<{ storage_key: string }>(
      `DELETE FROM bride_photos
        WHERE id = $1 AND user_id = $2
        RETURNING storage_key`,
      [photoId, userId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('عکس یافت نشد.');
    await this.storage.remove(row.storage_key);
  }

  /** خواندن فایل با توکن امضاشده؛ توکن منقضی/جعلی → ۴۰۳. */
  async readSigned(
    photoId: string,
    expires: string,
    token: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.signer.verify(photoId, expires, token)) {
      throw AppError.forbidden('لینک تصویر منقضی یا نامعتبر است.');
    }
    const rows = await this.runner.query<{ storage_key: string; content_type: string }>(
      'SELECT storage_key, content_type FROM bride_photos WHERE id = $1 AND deleted_at IS NULL',
      [photoId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('عکس یافت نشد.');

    try {
      return { buffer: await this.storage.read(row.storage_key), contentType: row.content_type };
    } catch {
      throw AppError.notFound('فایل تصویر در دسترس نیست.');
    }
  }
}
