import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface MediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** وضعیت شفاف: در production باید S3/MinIO باشد، نه دیسک محلی. */
  readonly driver: 'local-dev';
}

/**
 * ذخیره‌سازی **خصوصی** روی دیسک برای local/dev.
 *
 * وضعیت: این آداپتور فقط برای توسعه است. ذخیره‌سازی object storage (S3/MinIO) با
 * URL امضاشده مستقیم، پیش‌نیاز staging و production است و **مسدود به‌علت دسترسی**
 * (بدون سرویس ذخیره‌سازی در محیط ساخت) است. فایل‌ها هرگز به‌صورت عمومی سرو نمی‌شوند؛
 * تنها مسیر خواندن، `GET /api/v1/media/:id` با توکن امضاشده کوتاه‌عمر است.
 */
@Injectable()
export class LocalMediaStorage implements MediaStorage {
  readonly driver = 'local-dev' as const;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    if (this.config.isProduction) {
      throw new Error(
        'LocalMediaStorage در production مجاز نیست؛ باید آداپتور S3/MinIO پیکربندی شود.',
      );
    }
  }

  private resolve(key: string): string {
    const root = path.resolve(this.config.media.root);
    const target = path.resolve(root, key);
    // جلوگیری از path traversal؛ کلیدها همیشه زیر ریشه ذخیره‌سازی‌اند
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error('کلید ذخیره‌سازی نامعتبر است');
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { mode: 0o600 });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
