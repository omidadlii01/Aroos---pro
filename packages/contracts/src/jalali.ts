import { isValidJalaaliDate, toGregorian, toJalaali } from 'jalaali-js';

import { toPersianDigits } from './digits.js';

/**
 * تاریخ: ذخیره‌سازی استاندارد، نمایش شمسی
 * ----------------------------------------
 * قاعده پروژه: در دیتابیس/API همیشه ISO-8601 با منطقه زمانی (UTC) ذخیره می‌شود؛
 * «تاریخ شمسی» صرفاً لایه نمایش است. فیلدهای «تاریخ تقویمی» (مثل تاریخ رزرو یا
 * تاریخ تولد) به‌صورت کلید `YYYY-MM-DD` بتنی بر تقویم میلادی در منطقه
 * Asia/Tehran نگه داشته می‌شوند تا DST/تغییرات منطقه زمانی به‌وجود نیاید.
 */

export const TEHRAN_TIMEZONE = 'Asia/Tehran';

export type JalaliDate = { jy: number; jm: number; jd: number };
export type GregorianDate = { gy: number; gm: number; gd: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(options: Intl.DateTimeFormatOptions, locale = 'fa-IR'): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { timeZone: TEHRAN_TIMEZONE, ...options });
  formatterCache.set(key, formatter);
  return formatter;
}

/** تاریخ تقویمی میلادی در تهران برای یک لحظه زمانی (کلید ماندگار: YYYY-MM-DD). */
export function tehranDateKey(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError('تاریخ نامعتبر است');
  const parts = getFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').formatToParts(
    date,
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function gregorianToJalali({ gy, gm, gd }: GregorianDate): JalaliDate {
  const { jy, jm, jd } = toJalaali(gy, gm, gd);
  return { jy, jm, jd };
}

export function jalaliToGregorian({ jy, jm, jd }: JalaliDate): GregorianDate {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return { gy, gm, gd };
}

export function isValidJalali({ jy, jm, jd }: JalaliDate): boolean {
  return isValidJalaaliDate(jy, jm, jd);
}

/** «۱۴۰۳/۰۵/۱۲» — بدون ساعت، برای فرم‌ها و کارت‌ها. */
export function formatJalaliDate(instant: Date | string): string {
  return getFormatter({ dateStyle: 'medium' }).format(toDate(instant));
}

/** «۱۲ مرداد ۱۴۰۳، ساعت ۱۶:۳۰» */
export function formatJalaliDateTime(instant: Date | string): string {
  const date = toDate(instant);
  const datePart = getFormatter({ dateStyle: 'medium' }).format(date);
  const timePart = getFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${datePart}، ساعت ${timePart}`;
}

/** فاصله نسبی («۳ روز پیش») با ارقام فارسی. */
export function formatRelativeFa(instant: Date | string, now: Date = new Date()): string {
  const target = toDate(instant);
  const diffSeconds = Math.round((target.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}

/** ساعت محلی تهران برای یک لحظه زمانی: «۱۶:۳۰» */
export function formatTehranTime(instant: Date | string): string {
  return getFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(instant));
}

/**
 * تبدیل «۱۴۰۳/۰۵/۱۲» یا «1403-5-12» به کلید تقویمی میلادی تهران.
 * برای ذخیره در ستون‌های `date` استفاده می‌شود.
 */
export function parseJalaliInputToDateKey(
  input: string,
): { ok: true; dateKey: string } | { ok: false; reason: string } {
  const normalized = (input ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.codePointAt(0)! - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.codePointAt(0)! - 0x0660))
    .replace(/[.\s]/g, '/')
    .replace(/-/g, '/')
    .trim();

  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) return { ok: false, reason: 'قالب تاریخ باید ۱۴۰۳/۰۵/۱۲ باشد' };

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  if (!isValidJalali({ jy, jm, jd })) return { ok: false, reason: 'تاریخ شمسی معتبر نیست' };

  const { gy, gm, gd } = jalaliToGregorian({ jy, jm, jd });
  const pad = (n: number) => String(n).padStart(2, '0');
  return { ok: true, dateKey: `${gy}-${pad(gm)}-${pad(gd)}` };
}

/** کلید تاریخ میلادی → نمایش شمسی («۱۲ مرداد ۱۴۰۳»). */
export function formatDateKeyJalali(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`کلید تاریخ نامعتبر است: ${dateKey}`);
  const { jy, jm, jd } = gregorianToJalali({
    gy: Number(match[1]),
    gm: Number(match[2]),
    gd: Number(match[3]),
  });
  const monthNames = [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند',
  ];
  return `${toPersianDigits(jd)} ${monthNames[jm - 1]} ${toPersianDigits(jy)}`;
}

function toDate(instant: Date | string): Date {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError(`تاریخ نامعتبر است: ${String(instant)}`);
  return date;
}

/* ------------------------------------------------------------------ */
/* زمان‌بندی نوبت (فاز ۸)                                              */
/* ------------------------------------------------------------------ */

/**
 * اختلاف زمانی تهران با UTC بر حسب دقیقه (زمستان +۲۱۰، تابستان +۲۷۰).
 *
 * از `timeZoneName: 'longOffset'` استفاده می‌شود چون بعضی ICUها با
 * `hour12: false` همچنان ساعت ۱۲ساعته برمی‌گردانند و محاسبه اختلاف را خراب می‌کنند.
 */
export function tehranOffsetMinutes(instant: Date | string): number {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError('تاریخ نامعتبر است');
  const parts = getFormatter({ timeZoneName: 'longOffset' }, 'en-US').formatToParts(date);
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * ساخت لحظه دقیق از «کلید تاریخ تهران» + «دقیقه از نیمه‌شب تهران».
 * دو بار تکرار می‌شود تا در مرز تغییر ساعت، مقدار نهایی درست باشد.
 */
export function tehranInstant(dateKey: string, minuteOfDay: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`کلید تاریخ نامعتبر است: ${dateKey}`);
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1440) {
    throw new RangeError('دقیقه روز باید بین ۰ و ۱۴۴۰ باشد');
  }
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, minuteOfDay);
  let instant = new Date(guess - tehranOffsetMinutes(new Date(guess)) * 60000);
  instant = new Date(guess - tehranOffsetMinutes(instant) * 60000);
  return instant;
}

/** روز هفته ایرانی: ۰=شنبه … ۶=جمعه (بر خلاف `Date.getDay` که یکشنبه=۰ است). */
export function persianWeekdayOfDateKey(dateKey: string): number {
  const { gy, gm, gd } = gregorianFromDateKey(dateKey);
  const jsDay = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
  return (jsDay + 1) % 7;
}

/** کلید تاریخ تهران برای امروز + n روز (برای ساخت بازه‌های انتخاب تاریخ). */
export function tehranDateKeyPlus(days: number, from: Date = new Date()): string {
  const base = tehranInstant(tehranDateKey(from), 0);
  return tehranDateKey(new Date(base.getTime() + days * 86400000 + 12 * 3600000));
}

/** «۰۹:۳۰» از دقیقه‌های روز، با ارقام فارسی. */
export function formatMinuteOfDayFa(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return toPersianDigits(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
}

/** «شنبه ۱۲ مرداد» — برچسب کوتاه یک روز برای انتخاب‌گر تاریخ. */
export function formatDateKeyJalaliShort(dateKey: string): string {
  const { jm, jd } = gregorianToJalali(gregorianFromDateKey(dateKey));
  const monthNames = [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند',
  ];
  const weekday = PERSIAN_WEEKDAYS_FA[persianWeekdayOfDateKey(dateKey)];
  return `${weekday} ${toPersianDigits(jd)} ${monthNames[jm - 1]}`;
}

/** نام روزهای هفته ایرانی؛ ایندکس ۰ = شنبه. */
export const PERSIAN_WEEKDAYS_FA = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;

/** کلید تاریخ میلادی → اجزای میلادی (با اعتبارسنجی قالب). */
export function gregorianFromDateKey(dateKey: string): GregorianDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`کلید تاریخ نامعتبر است: ${dateKey}`);
  return { gy: Number(match[1]), gm: Number(match[2]), gd: Number(match[3]) };
}
