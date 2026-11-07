import { toLatinDigits } from './digits.js';

export const OTP_DIGITS = 5;

/** کد یکبارمصرف را از ورودی کاربر نرمال می‌کند (ارقام فارسی/فاصله حذف می‌شود). */
export function normalizeOtpCode(raw: string): string {
  return toLatinDigits(String(raw ?? ''))
    .replace(/[\s\u200c\u200f\u200e-]/g, '')
    .trim();
}

export function isValidOtpCode(raw: string): boolean {
  return new RegExp(`^\\d{${OTP_DIGITS}}$`).test(normalizeOtpCode(raw));
}

export function formatOtpForDisplay(code: string): string {
  return code.replace(/[0-9]/g, (d) => String.fromCodePoint(0x06f0 + Number(d)));
}
