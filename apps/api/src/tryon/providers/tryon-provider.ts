import sharp from 'sharp';

export const TRYON_PROVIDER = Symbol('TRYON_PROVIDER');

export type TryOnProviderKind = 'none' | 'dev-watermark';

export type ProviderRenderInput = {
  photo: Buffer;
  dress: Buffer;
  /** شناسه درخواست برای افزودن به واترمارک (قابلیت ردیابی). */
  requestId: string;
};

export type ProviderRenderResult = {
  buffer: Buffer;
  contentType: 'image/jpeg';
  /** آیا خروجی ساختگی/آزمایشی است؟ در این حالت UI باید برچسب اجباری نشان دهد. */
  isDevOutput: boolean;
  labelFa: string | null;
};

export interface TryOnProvider {
  readonly kind: TryOnProviderKind;
  /** خروجی واقعی AI تولید می‌کند؟ برای آداپتور آزمایشی همیشه false. */
  readonly producesRealOutput: boolean;
  render(input: ProviderRenderInput): Promise<ProviderRenderResult>;
}

/**
 * آداپتور آزمایشی: عکس عروس و تصویر لباس را کنار هم می‌گذارد و واترمارک
 * «DEV PREVIEW — NOT REAL AI OUTPUT» می‌زند.
 *
 * چرا این کار «تقلب» نیست: خروجی با واترمارک دائمی، برچسب فارسی و ستون
 * `is_dev_output` مشخص است و UI آن را صریحاً «خروجی واقعی AI نیست» می‌نامد.
 * هیچ تلاشی برای شبیه‌سازی پرو واقعی انجام نمی‌شود.
 */
export class DevWatermarkProvider implements TryOnProvider {
  readonly kind = 'dev-watermark' as const;
  readonly producesRealOutput = false;

  async render(input: ProviderRenderInput): Promise<ProviderRenderResult> {
    const photo = await sharp(input.photo).resize(600, 900, { fit: 'cover' }).jpeg().toBuffer();
    const dress = await sharp(input.dress).resize(600, 900, { fit: 'cover' }).jpeg().toBuffer();

    const overlay = Buffer.from(
      `<svg width="1200" height="980" xmlns="http://www.w3.org/2000/svg">
         <rect width="1200" height="980" fill="#f6f1f4"/>
         <text x="600" y="72" font-family="sans-serif" font-size="30" fill="#7a3b5c"
               text-anchor="middle">DEV PREVIEW — NOT REAL AI OUTPUT</text>
         <text x="600" y="946" font-family="sans-serif" font-size="26" fill="#7a3b5c"
               text-anchor="middle">request ${input.requestId.slice(0, 8)} · BridalOS dev adapter</text>
       </svg>`,
    );

    const buffer = await sharp({
      create: { width: 1200, height: 980, channels: 3, background: '#f6f1f4' },
    })
      .composite([
        { input: overlay, top: 0, left: 0 },
        { input: photo, top: 90, left: 0 },
        { input: dress, top: 90, left: 600 },
      ])
      .jpeg({ quality: 80 })
      .withMetadata({ exif: { IFD0: { ImageDescription: 'dev-watermark-preview' } } })
      .toBuffer();

    return {
      buffer,
      contentType: 'image/jpeg',
      isDevOutput: true,
      labelFa:
        'خروجی آزمایشی (واترمارک‌دار) — این تصویر خروجی واقعی هوش مصنوعی نیست و برای سفارش یا تأیید تناسب معتبر نیست.',
    };
  }
}

export function createProvider(kind: TryOnProviderKind): TryOnProvider | null {
  if (kind === 'dev-watermark') return new DevWatermarkProvider();
  return null;
}
