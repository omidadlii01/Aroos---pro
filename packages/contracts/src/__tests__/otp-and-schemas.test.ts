import { describe, expect, it } from 'vitest';

import { isValidOtpCode, normalizeOtpCode } from '../otp.js';
import { BoutiqueCreateSchema, IranianMobileSchema, OtpVerifySchema, PaginationSchema } from '../schemas.js';

describe('کد یکبارمصرف', () => {
  it('ارقام فارسی را نرمال می‌کند', () => {
    expect(normalizeOtpCode('۱۲۳۴۵')).toBe('12345');
    expect(normalizeOtpCode(' 1 2-3 4 5 ')).toBe('12345');
  });

  it('فقط ۵ رقم را معتبر می‌داند', () => {
    expect(isValidOtpCode('۱۲۳۴۵')).toBe(true);
    expect(isValidOtpCode('1234')).toBe(false);
    expect(isValidOtpCode('123456')).toBe(false);
    expect(isValidOtpCode('12a45')).toBe(false);
  });
});

describe('اسکیمای ورودی', () => {
  it('شماره موبایل را نرمال می‌کند', () => {
    const parsed = IranianMobileSchema.safeParse('۰۹۱۲۱۲۳۴۵۶۷');
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe('09121234567');
  });

  it('پیام خطای فارسی برای شماره نامعتبر می‌دهد', () => {
    const parsed = IranianMobileSchema.safeParse('02188776655');
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain('۰۹');
  });

  it('شناسه درخواست باید UUID باشد', () => {
    expect(OtpVerifySchema.safeParse({ challengeId: 'abc', code: '12345' }).success).toBe(false);
    expect(
      OtpVerifySchema.safeParse({
        challengeId: '0b8f5c1e-6a4d-4f1a-9a1c-0d3e5f7a9b2c',
        code: '۱۲۳۴۵',
      }).success,
    ).toBe(true);
  });

  it('نام مزون کوتاه رد می‌شود', () => {
    const result = BoutiqueCreateSchema.safeParse({ name: 'ا', citySlug: 'tehran' });
    expect(result.success).toBe(false);
  });

  it('صفحه‌بندی پیش‌فرض و سقف دارد', () => {
    expect(PaginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(PaginationSchema.safeParse({ pageSize: 500 }).success).toBe(false);
    expect(PaginationSchema.parse({ page: '2', pageSize: '10' })).toEqual({ page: 2, pageSize: 10 });
  });
});
