import { toLatinDigits } from './digits.js';

export type PhoneParseResult =
  | { ok: true; /** فرمت استاندارد داخلی: 09xxxxxxxxx */ value: string; e164: string }
  | { ok: false; reason: 'empty' | 'invalid_characters' | 'invalid_length' | 'invalid_prefix' };

/**
 * نرمال‌سازی شماره موبایل ایران.
 *
 * ورودی‌های پذیرفته‌شده: ۰۹۱۲۱۲۳۴۵۶۷ / 09121234567 / +989121234567 /
 * 00989121234567 / 989121234567 / 9121234567
 * خروجی استاندارد: 09xxxxxxxxx و E.164 برای ارسال به سرویس پیامک.
 */
export function parseIranianMobile(raw: string): PhoneParseResult {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };

  let digits = toLatinDigits(trimmed);
  const hadInvalid = digits.replace(/[\d+\s()-]/g, '');
  if (hadInvalid.length > 0) return { ok: false, reason: 'invalid_characters' };
  digits = digits.replace(/[\s()-]/g, '');

  if (digits.startsWith('+98')) digits = digits.slice(3);
  else if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98') && digits.length === 12) digits = digits.slice(2);

  if (/^9\d{9}$/.test(digits)) digits = `0${digits}`;

  if (!/^\d{11}$/.test(digits)) return { ok: false, reason: 'invalid_length' };
  // پیش‌شماره‌های فعال موبایل ایران: 090x تا 099x با شروع 09
  if (!/^09\d{9}$/.test(digits)) return { ok: false, reason: 'invalid_prefix' };

  return { ok: true, value: digits, e164: `+98${digits.slice(1)}` };
}

/** نمایش خوانا برای UI: ۰۹۱۲ ۱۲۳ ۴۵۶۷ */
export function formatMobileFa(value: string): string {
  const match = /^09(\d{2})(\d{3})(\d{4})$/.exec(value);
  if (!match) return value;
  const parts = ['0' + '9' + match[1], match[2], match[3]].join(' ');
  return parts.replace(/[0-9]/g, (d) => String.fromCodePoint(0x06f0 + Number(d)));
}

/** ماسک کردن شماره برای لاگ و نمایش عمومی (هرگز شماره کامل در لاگ نباشد). */
export function maskMobile(value: string): string {
  if (value.length < 11) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}
