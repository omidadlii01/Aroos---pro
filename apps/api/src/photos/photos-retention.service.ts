import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/local-storage.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';

export type PurgeResult = { purged: number; failed: number };

/**
 * سیاست نگه‌داری عکس عروس.
 *
 * `retention_until` تنها وقتی معنا دارد که اجرا شود؛ این سرویس رکوردها و فایل‌های
 * منقضی را حذف می‌کند. دو مسیر اجرا وجود دارد:
 *   ۱) interval داخل فرایند API (با `PHOTO_RETENTION_SWEEP_SECONDS`، در تست خاموش)
 *   ۲) CLI برای cron در محیط واقعی: `npm run photos:sweep`
 * حذف هر رکورد مستقل است؛ یک خطا بقیه صف را متوقف نمی‌کند.
 */
@Injectable()
export class PhotosRetentionService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('PhotosRetention');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.photos.sweepSeconds;
    if (seconds <= 0) return;

    this.timer = setInterval(() => {
      void this.purgeExpired().catch((error: unknown) => {
        this.logger.warn(
          JSON.stringify({
            msg: 'photo_retention_sweep_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }, seconds * 1000);
    // اجرای پس‌زمینه نباید خروج فرایند را متوقف کند
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** حذف کامل عکس‌هایی که مهلت نگه‌داری‌شان گذشته است. */
  async purgeExpired(now: Date = new Date()): Promise<PurgeResult> {
    if (this.running) return { purged: 0, failed: 0 };
    this.running = true;
    try {
      const expired = await this.runner.query<{ id: string; storage_key: string }>(
        `SELECT id, storage_key
           FROM bride_photos
          WHERE retention_until <= $1 AND deleted_at IS NULL
          ORDER BY retention_until ASC
          LIMIT 200`,
        [now.toISOString()],
      );

      let purged = 0;
      let failed = 0;

      for (const row of expired) {
        try {
          await this.runner.query('DELETE FROM bride_photos WHERE id = $1', [row.id]);
          await this.storage.remove(row.storage_key);
          purged += 1;
        } catch (error) {
          failed += 1;
          this.logger.warn(
            JSON.stringify({
              msg: 'photo_retention_delete_failed',
              photoId: row.id,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }

      if (purged > 0 || failed > 0) {
        this.logger.log(JSON.stringify({ msg: 'photo_retention_swept', purged, failed }));
      }
      return { purged, failed };
    } finally {
      this.running = false;
    }
  }
}
