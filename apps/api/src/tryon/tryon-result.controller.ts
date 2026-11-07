import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { TryOnService } from './tryon.service.js';

/**
 * سرو فایل نتیجه با URL امضاشده کوتاه‌عمر.
 *
 * این مسیر عمداً بدون JwtAuthGuard است: مرورگر برای <img> نمی‌تواند هدر
 * Authorization بفرستد و دسترسی فقط با توکن HMAC (capability) ممکن است —
 * دقیقاً مانند عکس خصوصی عروس. توکن جعلی/منقضی → ۴۰۳.
 */
@Controller('api/v1/tryon')
export class TryOnResultController {
  constructor(@Inject(TryOnService) private readonly tryon: TryOnService) {}

  @Get(':id/result')
  async result(
    @Param('id') requestId: string,
    @Query('expires') expires = '',
    @Query('token') token = '',
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.tryon.readResult(requestId, expires, token);
    response.setHeader('content-type', file.contentType);
    response.setHeader('cache-control', 'private, max-age=60');
    response.setHeader('x-content-type-options', 'nosniff');
    if (file.isDevOutput) response.setHeader('x-bridalos-dev-output', 'true');
    response.send(file.buffer);
  }
}
