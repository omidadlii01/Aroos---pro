import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/local-storage.js';
import { TRYON_PROVIDER, type TryOnProvider } from './providers/tryon-provider.js';

export type DrainResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
};

type ClaimedRow = {
  id: string;
  user_id: string;
  photo_id: string | null;
  dress_id: string;
  attempts: number;
};

/**
 * worker صف امتحان مجازی.
 *
 * طراحی: صف در جدول `tryon_requests` است و claim با
 * `FOR UPDATE SKIP LOCKED` انجام می‌شود تا چند نمونه API روی یک صف کار کنند.
 * شکست موقت تا `TRYON_MAX_ATTEMPTS` دوباره در صف می‌نشیند؛ پس از آن `failed`.
 * در تست‌ها interval خاموش است و همان تابع `drain` مستقیماً صدا زده می‌شود.
 */
@Injectable()
export class TryOnWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('TryOnWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(TRYON_PROVIDER) private readonly provider: TryOnProvider | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.ai.workerIntervalSeconds;
    if (seconds <= 0 || !this.provider) return;

    this.timer = setInterval(() => {
      void this.drain(2).catch((error: unknown) => {
        this.logger.warn(
          JSON.stringify({
            msg: 'tryon_worker_tick_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }, seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** پردازش حداکثر `limit` درخواست از صف (مسیر worker و اجرای دستی ادمین یکی است). */
  async drain(limit = 3): Promise<DrainResult> {
    const result: DrainResult = { claimed: 0, succeeded: 0, failed: 0, requeued: 0 };
    if (!this.provider || this.running) return result;

    this.running = true;
    try {
      for (let index = 0; index < limit; index += 1) {
        const claim = await this.claimNext();
        if (!claim) break;
        result.claimed += 1;

        try {
          const output = await this.render(claim);
          const storageKey = `tryon/${claim.user_id}/${claim.id}.jpg`;
          await this.storage.put(storageKey, output.buffer);
          await this.runner.query(
            `UPDATE tryon_requests
                SET status = 'succeeded',
                    result_storage_key = $2,
                    result_content_type = $3,
                    is_dev_output = $4,
                    status_reason = $5,
                    error_message = NULL,
                    completed_at = now(),
                    updated_at = now()
              WHERE id = $1`,
            [claim.id, storageKey, output.contentType, output.isDevOutput, output.labelFa],
          );
          result.succeeded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const shouldRetry = claim.attempts < this.config.ai.maxAttempts;
          await this.runner.query(
            `UPDATE tryon_requests
                SET status = $2,
                    error_message = $3,
                    status_reason = $4,
                    completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END,
                    updated_at = now()
              WHERE id = $1`,
            [
              claim.id,
              shouldRetry ? 'queued' : 'failed',
              message.slice(0, 400),
              shouldRetry
                ? 'پردازش ناموفق بود و درخواست دوباره در صف قرار گرفت.'
                : 'پردازش امتحان مجازی ناموفق بود؛ پشتیبانی پیگیری می‌کند.',
            ],
          );
          if (shouldRetry) result.requeued += 1;
          else result.failed += 1;
          this.logger.warn(
            JSON.stringify({ msg: 'tryon_render_failed', requestId: claim.id, attempt: claim.attempts }),
          );
        }
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async claimNext(): Promise<ClaimedRow | null> {
    const rows = await this.runner.query<ClaimedRow>(
      `UPDATE tryon_requests
          SET status = 'processing',
              claimed_at = now(),
              started_at = now(),
              attempts = attempts + 1,
              updated_at = now()
        WHERE id = (
          SELECT id FROM tryon_requests
           WHERE status = 'queued'
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, user_id, photo_id, dress_id, attempts`,
    );
    return rows[0] ?? null;
  }

  private async render(claim: ClaimedRow): Promise<Awaited<ReturnType<TryOnProvider['render']>>> {
    const provider = this.provider;
    if (!provider) throw new Error('provider پیکربندی نشده است');

    if (!claim.photo_id) throw new Error('عکس مرجع برای این درخواست موجود نیست');

    const photoRows = await this.runner.query<{ storage_key: string }>(
      'SELECT storage_key FROM bride_photos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [claim.photo_id, claim.user_id],
    );
    const photo = photoRows[0];
    if (!photo) throw new Error('عکس مرجع حذف شده یا در دسترس نیست');

    const dressRows = await this.runner.query<{ storage_key: string }>(
      `SELECT storage_key FROM dress_media
        WHERE dress_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 1`,
      [claim.dress_id],
    );
    const dress = dressRows[0];
    if (!dress) throw new Error('تصویر لباس برای پردازش موجود نیست');

    const [photoBuffer, dressBuffer] = await Promise.all([
      this.storage.read(photo.storage_key),
      this.storage.read(dress.storage_key),
    ]);

    return provider.render({ photo: photoBuffer, dress: dressBuffer, requestId: claim.id });
  }
}
