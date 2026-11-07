import { createHmac, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';

/**
 * URL امضاشده کوتاه‌عمر برای رسانه خصوصی.
 *
 * مدل: توکن، دسترسی موقت به **یک** رسانه را می‌دهد (capability) و پس از انقضا
 * باطل است. امضا با HMAC-SHA256 روی «شناسه رسانه + زمان انقضا» انجام می‌شود.
 */
@Injectable()
export class MediaSigner {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private signature(mediaId: string, expiresAt: number): Buffer {
    return createHmac('sha256', this.config.media.signingSecret)
      .update(`${mediaId}.${expiresAt}`)
      .digest();
  }

  /**
   * ساخت مسیر امضاشده. `basePath` برای منابعی است که مسیر خواندن متفاوتی دارند
   * (مثلاً عکس عروس: `/api/v1/photos/:id/file`)؛ امضا همیشه روی شناسه + انقضا است.
   */
  createSignedPath(
    mediaId: string,
    options: { basePath?: string; now?: Date } = {},
  ): { path: string; expiresAt: string } {
    const now = options.now ?? new Date();
    const expiresAtSeconds = Math.floor(now.getTime() / 1000) + this.config.media.signedUrlTtlSeconds;
    const token = this.signature(mediaId, expiresAtSeconds).toString('base64url');
    const basePath = options.basePath ?? `/api/v1/media/${mediaId}`;
    return {
      path: `${basePath}?expires=${expiresAtSeconds}&token=${token}`,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    };
  }

  verify(mediaId: string, expiresRaw: string, token: string, now: Date = new Date()): boolean {
    const expiresAt = Number(expiresRaw);
    if (!Number.isInteger(expiresAt)) return false;
    if (expiresAt * 1000 <= now.getTime()) return false;

    let provided: Buffer;
    try {
      provided = Buffer.from(token, 'base64url');
    } catch {
      return false;
    }
    const expected = this.signature(mediaId, expiresAt);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }
}
