import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { MEDIA_ALLOWED_TYPES, MEDIA_MAX_BYTES, type MediaContentType } from '@bridalos/contracts';

import { AppError } from '../common/errors.js';

/** امضاهای فایلی (magic bytes) برای جلوگیری از جعل MIME با پسوند. */
const MAGIC: Array<{ type: MediaContentType; test: (b: Buffer) => boolean }> = [
  { type: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: 'image/webp',
    test: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export type ProcessedImage = {
  buffer: Buffer;
  contentType: MediaContentType;
  width: number;
  height: number;
  checksumSha256: string;
};

/**
 * پردازش تصویر ورودی: اعتبارسنجی نوع/حجم، بازکدگذاری (حذف کامل EXIF/GPS) و
 * استخراج ابعاد. خروجی همیشه JPEG بدون متادیتاست تا داده مکان/دستگاه کاربر
 * ناخواسته منتشر نشود.
 */
@Injectable()
export class ImageService {
  async process(input: {
    buffer: Buffer;
    declaredType: string;
    maxBytes?: number;
  }): Promise<ProcessedImage> {
    const maxBytes = input.maxBytes ?? MEDIA_MAX_BYTES;
    if (!input.buffer || input.buffer.length === 0) {
      throw AppError.validation(undefined, 'فایل تصویر خالی است.');
    }
    if (input.buffer.length > maxBytes) {
      throw AppError.validation(
        undefined,
        `حجم تصویر باید کمتر از ${Math.round(maxBytes / (1024 * 1024))} مگابایت باشد.`,
      );
    }

    const declared = input.declaredType.split(';')[0]?.trim() as MediaContentType | undefined;
    if (!declared || !MEDIA_ALLOWED_TYPES.includes(declared)) {
      throw AppError.validation(
        undefined,
        'فرمت تصویر مجاز نیست؛ فقط JPEG، PNG یا WebP پذیرفته می‌شود.',
      );
    }
    const detected = MAGIC.find((entry) => entry.test(input.buffer));
    if (!detected || detected.type !== declared) {
      throw AppError.validation(undefined, 'محتوای فایل با فرمت اعلام‌شده سازگار نیست.');
    }

    const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');

    try {
      const pipeline = sharp(input.buffer, { failOn: 'error' }).rotate();
      const metadata = await pipeline.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('ابعاد تصویر قابل تشخیص نیست');
      }
      // بازکدگذاری بدون withMetadata → همه EXIF/ICC/GPS حذف می‌شود
      const normalized = await pipeline
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: normalized.data,
        contentType: 'image/jpeg',
        width: normalized.info.width,
        height: normalized.info.height,
        checksumSha256,
      };
    } catch {
      throw AppError.validation(undefined, 'تصویر قابل خواندن نیست یا آسیب‌دیده است.');
    }
  }
}
