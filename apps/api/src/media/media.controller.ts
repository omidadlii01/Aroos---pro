import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MediaService } from './media.service.js';

@Controller('api/v1/media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  /**
   * تحویل تصویر خصوصی با URL امضاشده کوتاه‌عمر.
   * این مسیر عمداً بدون JWT است (capability URL) و توکن آن کوتاه‌عمر و مخصوص یک فایل است.
   */
  @Get(':id')
  async read(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.media.readSigned(id, expires ?? '', token ?? '');
    response.setHeader('content-type', file.contentType);
    response.setHeader('cache-control', 'private, max-age=60, no-transform');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.send(file.buffer);
  }
}
