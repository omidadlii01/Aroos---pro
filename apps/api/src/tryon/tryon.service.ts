import { Inject, Injectable } from '@nestjs/common';

import type { TryOnCreateInput, TryOnStatus, TryOnView } from '@bridalos/contracts';

import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';

type TryOnRow = {
  id: string;
  photo_id: string | null;
  dress_id: string;
  status: TryOnStatus;
  status_reason: string | null;
  provider: string;
  created_at: Date | string;
};

/**
 * درخواست امتحان مجازی.
 *
 * اصل ۹ و ۱۷ کارفرما: خروجی AI هرگز نباید به‌عنوان تضمین تناسب یا سفارش قطعی
 * ارائه شود، و بدون provider واقعی هیچ تصویری تولید نمی‌شود. بنابراین در این
 * نسخه هر درخواست با وضعیت صریح `blocked` و دلیل فارسی ثبت می‌شود و پاسخ،
 * مقدار `aiConfigured: false` را برمی‌گرداند. هیچ تصویر ساختگی ساخته نمی‌شود.
 */
@Injectable()
export class TryOnService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * در این فاز هیچ provider واقعی و هیچ صف پردازشی وجود ندارد؛ حتی با آداپتور
   * آزمایشی هم خروجی تولید نمی‌شود. پس این مقدار عمداً همیشه `false` است و
   * فقط با تکمیل فاز ۷ (provider + صف) تغییر می‌کند.
   */
  private get aiConfigured(): boolean {
    return false;
  }

  private blockedReason(): string {
    return this.config.ai.tryonProvider === 'none'
      ? 'سرویس هوش مصنوعی پیکربندی نشده است؛ هیچ تصویری ساخته نشد. برای فعال‌سازی، کلید provider و تأیید مالک لازم است.'
      : 'آداپتور آزمایشی پیکربندی شده اما صف پردازش فعال نیست؛ هیچ تصویر واقعی تولید نشد.';
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

    const status: TryOnStatus = this.aiConfigured ? 'queued' : 'blocked';
    const reason = this.aiConfigured ? null : this.blockedReason();

    const rows = await this.runner.query<TryOnRow>(
      `INSERT INTO tryon_requests (user_id, photo_id, dress_id, status, status_reason, provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, photo_id, dress_id, status, status_reason, provider, created_at`,
      [userId, input.photoId, input.dressId, status, reason, this.config.ai.tryonProvider],
    );
    const row = rows[0];
    if (!row) throw AppError.internal('ثبت درخواست امتحان مجازی ناموفق بود.');
    return this.toView(row);
  }

  async listMine(userId: string): Promise<TryOnView[]> {
    const rows = await this.runner.query<TryOnRow>(
      `SELECT id, photo_id, dress_id, status, status_reason, provider, created_at
         FROM tryon_requests
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [userId],
    );
    return rows.map((row) => this.toView(row));
  }

  async getMine(userId: string, requestId: string): Promise<TryOnView> {
    const rows = await this.runner.query<TryOnRow>(
      `SELECT id, photo_id, dress_id, status, status_reason, provider, created_at
         FROM tryon_requests
        WHERE id = $1 AND user_id = $2`,
      [requestId, userId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('درخواست یافت نشد.');
    return this.toView(row);
  }

  private toView(row: TryOnRow): TryOnView {
    return {
      id: row.id,
      photoId: row.photo_id,
      dressId: row.dress_id,
      status: row.status,
      statusReason: row.status_reason,
      provider: row.provider,
      aiConfigured: this.aiConfigured,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
