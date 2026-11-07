/**
 * ابزارهای رقم فارسی/عربی → لاتین و برعکس.
 *
 * قاعده پروژه: مقدار «ذخیره‌شده» همیشه لاتین و استاندارد است؛ ارقام فارسی فقط
 * برای نمایش به کاربر استفاده می‌شوند. ورودی کاربر همیشه قبل از اعتبارسنجی
 * نرمال می‌شود تا کاربر بتواند با صفحه‌کلید فارسی تایپ کند.
 */

const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_ZERO = 0x0660; // ٠

/** ارقام فارسی و عربی را به ارقام لاتین تبدیل می‌کند. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      out += String(code - PERSIAN_ZERO);
    } else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) {
      out += String(code - ARABIC_ZERO);
    } else {
      out += char;
    }
  }
  return out;
}

/** ارقام لاتین را به ارقام فارسی تبدیل می‌کند (برای نمایش). */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => String.fromCodePoint(PERSIAN_ZERO + Number(digit)));
}

/** نویسه‌های عربی رایج در متن فارسی را یکدست می‌کند. */
export function normalizePersianText(input: string): string {
  return input
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/\u200F|\u200E/g, '') // حذف نشانه‌های جهت
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** جداکننده هزارگان با «٬» فارسی و ارقام فارسی — مخصوص نمایش مبلغ. */
export function groupDigitsFa(value: number): string {
  const grouped = new Intl.NumberFormat('en-US').format(value);
  return toPersianDigits(grouped).replace(/,/g, '٬');
}
