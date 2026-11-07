import { Inject, Injectable } from '@nestjs/common';

import type { TryOnCreateInput, TryOnStatus, TryOnView } from '@bridalos/contracts';

import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/local-storage.js';
import { MediaSigner } from '../media/media-signer.js';
import { TRYON_PROVIDER, type TryOnProvider } from './providers/tryon-provider.js';

type TryOnRow = {
  id: string;
  photo_id: string | null;
  dress_id: string;
  status: TryOnStatus;
  status_reason: string | null;
  provider: string;
  is_dev_output: boolean;
  result_storage_key: string | null;
  result_content_type: string | null;
  created_at: Date | string;
};

/**
 * درخواست امتحان مجازی.
 *
 * سه حالت صادقانه:
 *  - هیچ provider پیکربندی نشده → `blocked` با دلیل، بدون هیچ خروجی.
 *  - provider آزمایشی (`dev-watermark`) → درخواست در صف، worker خروجی
 *    واترمارک‌دار می‌سازد که با `isDevOutput: true` و برچسب اجباری برمی‌گردد.
 *  - provider تجاری واقعی → در فازهای بعد؛ ساختار همین است.
 *
 * خروجی AI هرگز به‌عنوان تضمین تناسب یا سفارش قطعی ارائه نمی‌شود.
 */
@Injectable()
export class TryOnService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(MediaSigner) private readonly signer: MediaSigner,
    @Inject(TRYON_PROVIDER) private readonly provider: TryOnProvider | null,
  ) {}

  private get aiConfigured(): boolean {
    return this.provider !== null;
  }

  private blockedReason(): string {
    return 'سرویس هوش مصنوعی پیکربندی نشده است؛ هیچ تصویری ساخته نشد. برای فعال‌سازی، کلید provider و تأیید مالک لازم است.';
  }

  async create(userId: string, input: TryOnCreateInput): Promise<TryOnView> {
    const photos = await this.runner.query<{ id: string }>(
      'SELECT id FROM bride_photos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [input.photoId, userId],
    );
    if (photos.length === 0) throw AppError.notFound('عکس انتخاب‌شده یافت نشد.');

    const dresses = await this.runner.query<{ id: string }>(
      `SELECT d.id
         FROM dresses d
         JOIN boutiques b ON b.id = d.boutique_id
        WHERE d.id = $1 AND d.status = 'published' AND b.status = 'approved'`,
      [input.dressId],
    );
    if (dresses.length === 0) {
      throw AppError.notFound('این لباس برای امتحان مجازی در دسترس نیست.');
    }

    const queued = this.aiConfigured;
    const rows = await this.runner.query<TryOnRow>(
      `INSERT INTO tryon_requests (user_id, photo_id, dress_id, status, status_reason, provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, photo_id, dress_id, status, status_reason, provider, is_dev_output,
                 result_storage_key, result_content_type, created_at`,
      [
        userId,
        input.photoId,
        input.dressId,
        queued ? 'queued' : 'blocked',
        queued ? null : this.blockedReason(),
        this.config.ai.tryonProvider,
      ],
    );
    const row = rows[0];
    if (!row) throw AppError.internal('ثبت درخواست امتحان مجازی ناموفق بود.');

    const view = await this.toView(row, userId);
    if (row.status === 'queued') {
      view.queuePosition = await this.queuePosition(row.id);
    }
    return view;
  }

  async listMine(userId: string): Promise<TryOnView[]> {
    const rows = await this.runner.query<TryOnRow>(
      `SELECT id, photo_id, dress_id, status, status_reason, provider, is_dev_output,
              result_storage_key, result_content_type, created_at
         FROM tryon_requests
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [userId],
    );
    const views: TryOnView[] = [];
    for (const row of rows) {
      const view = await this.toView(row, userId);
      if (row.status === 'queued') view.queuePosition = await this.queuePosition(row.id);
      views.push(view);
    }
    return views;
  }

  async getMine(userId: string, requestId: string): Promise<TryOnView> {
    const rows = await this.runner.query<TryOnRow>(
      `SELECT id, photo_id, dress_id, status, status_reason, provider, is_dev_output,
              result_storage_key, result_content_type, created_at
         FROM tryon_requests
        WHERE id = $1 AND user_id = $2`,
      [requestId, userId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('درخواست یافت نشد.');
    const view = await this.toView(row, userId);
    if (row.status === 'queued') view.queuePosition = await this.queuePosition(row.id);
    return view;
  }

  /** خواندن نتیجه با URL امضاشده؛ تا زمانی که وضعیت `succeeded` نباشد چیزی سرو نمی‌شود. */
  async readResult(
    requestId: string,
    expires: string,
    token: string,
  ): Promise<{ buffer: Buffer; contentType: string; isDevOutput: boolean }> {
    if (!this.signer.verify(requestId, expires, token)) {
      throw AppError.forbidden('لینک نتیجه منقضی یا نامعتبر است.');
    }
    const rows = await this.runner.query<{
      result_storage_key: string | null;
      result_content_type: string | null;
      is_dev_output: boolean;
      status: TryOnStatus;
    }>(
      `SELECT result_storage_key, result_content_type, is_dev_output, status
         FROM tryon_requests WHERE id = $1`,
      [requestId],
    );
    const row = rows[0];
    if (!row || row.status !== 'succeeded' || !row.result_storage_key) {
      throw AppError.notFound('نتیجه‌ای برای این درخواست موجود نیست.');
    }
    try {
      return {
        buffer: await this.storage.read(row.result_storage_key),
        contentType: row.result_content_type ?? 'image/jpeg',
        isDevOutput: row.is_dev_output,
      };
    } catch {
      throw AppError.notFound('فایل نتیجه در دسترس نیست.');
    }
  }

  private async queuePosition(requestId: string): Promise<number> {
    const rows = await this.runner.query<{ position: string | number }>(
      `SELECT count(*)::int AS position
         FROM tryon_requests
        WHERE status = 'queued'
          AND created_at <= (SELECT created_at FROM tryon_requests WHERE id = $1)`,
      [requestId],
    );
    return Number(rows[0]?.position ?? 1);
  }

  private async toView(row: TryOnRow, userId: string): Promise<TryOnView> {
    void userId;
    const view: TryOnView = {
      id: row.id,
      photoId: row.photo_id,
      dressId: row.dress_id,
      status: row.status,
      statusReason: row.status_reason,
      provider: row.provider,
      aiConfigured: this.aiConfigured,
      isDevOutput: row.is_dev_output,
      createdAt: new Date(row.created_at).toISOString(),
    };

    if (row.status === 'succeeded' && row.result_storage_key) {
      const signed = this.signer.createSignedPath(row.id, {
        basePath: `/api/v1/tryon/${row.id}/result`,
      });
      view.result = {
        url: signed.path,
        expiresAt: signed.expiresAt,
        isDevOutput: row.is_dev_output,
        labelFa: row.is_dev_output ? (row.status_reason ?? null) : null,
      };
    }
    return view;
  }
}
