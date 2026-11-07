import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { BridePhotoView } from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { AppError } from '../common/errors.js';
import { PhotosService } from './photos.service.js';

/**
 * عکس شخصی عروس — همیشه پشت احراز هویت.
 *
 * بارگذاری با بدنه خام تصویر و دو هدر اجباری انجام می‌شود:
 * `x-consent-given: true` و `x-consent-version: v1`.
 * خواندن فایل فقط با مسیر امضاشده کوتاه‌عمر (`/file?expires&token`) ممکن است.
 */
@Controller('api/v1/photos')
export class PhotosController {
  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AccessTokenPayload): Promise<{ items: BridePhotoView[] }> {
    return { items: await this.photos.listMine(user.sub) };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async upload(@CurrentUser() user: AccessTokenPayload, @Req() request: AuthenticatedRequest): Promise<BridePhotoView> {
    const body = request.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw AppError.validation(
        undefined,
        'بدنه درخواست باید فایل تصویر خام باشد (Content-Type تصویر).',
      );
    }

    const consentHeader = request.headers['x-consent-given'];
    const versionHeader = request.headers['x-consent-version'];
    return this.photos.upload({
      userId: user.sub,
      buffer: body,
      declaredType: String(request.headers['content-type'] ?? ''),
      consentGiven: String(consentHeader ?? '').toLowerCase() === 'true',
      consentVersion: typeof versionHeader === 'string' ? versionHeader : undefined,
    });
  }

  @Delete(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') photoId: string,
  ): Promise<{ deleted: true }> {
    await this.photos.deleteOwn(user.sub, photoId);
    return { deleted: true };
  }

  @Get(':id/file')
  async file(
    @Param('id') photoId: string,
    @Query('expires') expires = '',
    @Query('token') token = '',
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.photos.readSigned(photoId, expires, token);
    response.setHeader('content-type', file.contentType);
    response.setHeader('cache-control', 'private, max-age=60');
    response.setHeader('content-disposition', 'inline');
    response.setHeader('x-content-type-options', 'nosniff');
    response.send(file.buffer);
  }
}
