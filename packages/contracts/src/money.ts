import { groupDigitsFa } from './digits.js';

/**
 * پول در BridalOS
 * -----------------
 * ذخیره‌سازی: **ریال** به‌صورت عدد صحیح (integer) در دیتابیس؛ هیچ‌گاه float.
 * نمایش: **تومان** (مطابق الزام محصول برای کاربر ایرانی).
 *
 * دلیل: ریال واحد پایه است و امکان نمایش دقیق‌تر را می‌دهد؛ در عین حال در UI
 * همیشه تومان نوشته می‌شود تا با ذهن کاربر ایرانی هم‌خوان باشد.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} باید عدد صحیح و امن باشد؛ دریافت شد: ${String(value)}`);
  }
}

/** تومان → ریال (ضرب در ۱۰). */
export function tomanToRial(toman: number): number {
  assertSafeInteger(toman, 'مبلغ تومان');
  if (toman < 0) throw new MoneyError('مبلغ نمی‌تواند منفی باشد');
  const rial = toman * 10;
  assertSafeInteger(rial, 'مبلغ ریال');
  return rial;
}

/** ریال → تومان (تقسیم بر ۱۰). مقدار غیرقابل تقسیم را رد می‌کند. */
export function rialToToman(rial: number): number {
  assertSafeInteger(rial, 'مبلغ ریال');
  if (rial < 0) throw new MoneyError('مبلغ نمی‌تواند منفی باشد');
  if (rial % 10 !== 0) {
    throw new MoneyError('مبلغ ریال باید مضربی از ۱۰ باشد تا نمایش تومان دقیق بماند');
  }
  return rial / 10;
}

/** نمایش متنی مبلغ برای UI: «۲٬۵۰۰٬۰۰۰ تومان» */
export function formatToman(rial: number, options: { withUnit?: boolean } = {}): string {
  const { withUnit = true } = options;
  const toman = rialToToman(rial);
  const digits = groupDigitsFa(toman);
  return withUnit ? `${digits} تومان` : digits;
}

export type ParsedAmount = { ok: true; rial: number } | { ok: false; reason: string };

/**
 * تبدیل ورودی متنی کاربر به ریال.
 * پشتیبانی از ارقام فارسی، «٬»/«,»/فاصله به‌عنوان جداکننده و کلمه تومان.
 */
export function parseTomanInput(raw: string): ParsedAmount {
  const cleaned = (raw ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.codePointAt(0)! - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.codePointAt(0)! - 0x0660))
    .replace(/تومان|تومن|ریال/g, '')
    .replace(/[\s,٬،]/g, '')
    .trim();

  if (cleaned.length === 0) return { ok: false, reason: 'خالی است' };
  if (!/^\d+$/.test(cleaned)) return { ok: false, reason: 'فقط رقم مجاز است' };

  const toman = Number(cleaned);
  if (!Number.isSafeInteger(toman) || toman <= 0) {
    return { ok: false, reason: 'مبلغ باید بزرگ‌تر از صفر باشد' };
  }
  return { ok: true, rial: tomanToRial(toman) };
}

/** محدوده قیمت لباس (ریال). ذخیره‌سازی همیشه جفت مرتب‌شده است. */
export type PriceRangeRial = { minRial: number; maxRial: number };

export function makePriceRange(minRial: number, maxRial: number): PriceRangeRial {
  assertSafeInteger(minRial, 'کمینه');
  assertSafeInteger(maxRial, 'بیشینه');
  if (minRial < 0 || maxRial < 0) throw new MoneyError('بازه قیمت نمی‌تواند منفی باشد');
  if (maxRial < minRial) throw new MoneyError('بیشینه بازه نباید کمتر از کمینه باشد');
  return { minRial, maxRial };
}
