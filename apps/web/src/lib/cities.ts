/**
 * فهرست موقت شهرها برای فرم ثبت مزون.
 *
 * بدهی فنی: در فاز ۴ به جدول `cities` با شناسه پایدار و لینک SEO منتقل می‌شود؛
 * تا آن زمان این فهرست فقط برای ورودی فرم است و شناسه‌ها لاتین و پایدار هستند.
 */
export const CITY_OPTIONS = [
  { slug: 'tehran', label: 'تهران' },
  { slug: 'mashhad', label: 'مشهد' },
  { slug: 'isfahan', label: 'اصفهان' },
  { slug: 'shiraz', label: 'شیراز' },
  { slug: 'tabriz', label: 'تبریز' },
  { slug: 'karaj', label: 'کرج' },
  { slug: 'qom', label: 'قم' },
  { slug: 'ahvaz', label: 'اهواز' },
  { slug: 'rasht', label: 'رشت' },
  { slug: 'kerman', label: 'کرمان' },
  { slug: 'yazd', label: 'یزد' },
  { slug: 'urmia', label: 'ارومیه' },
] as const;

export function cityLabel(slug: string): string {
  return CITY_OPTIONS.find((city) => city.slug === slug)?.label ?? slug;
}
