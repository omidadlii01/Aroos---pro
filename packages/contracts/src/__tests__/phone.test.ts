import { describe, expect, it } from 'vitest';

import { formatMobileFa, maskMobile, parseIranianMobile } from '../phone.js';

describe('parseIranianMobile', () => {
  it.each([
    ['09121234567', '09121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '09121234567'],
    ['+98 912 123 4567', '09121234567'],
    ['00989121234567', '09121234567'],
    ['989121234567', '09121234567'],
    ['9121234567', '09121234567'],
    ['0912-123-4567', '09121234567'],
  ])('نرمال‌سازی %s', (input, expected) => {
    const result = parseIranianMobile(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });

  it('E.164 را برای سرویس پیامک می‌سازد', () => {
    const result = parseIranianMobile('09121234567');
    expect(result.ok && result.e164).toBe('+989121234567');
  });

  it('ورودی خالی را رد می‌کند', () => {
    expect(parseIranianMobile('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('طول نامعتبر را رد می‌کند', () => {
    expect(parseIranianMobile('0912123456')).toEqual({ ok: false, reason: 'invalid_length' });
  });

  it('پیش‌شماره غیرموبایل را رد می‌کند', () => {
    expect(parseIranianMobile('02188776655')).toEqual({ ok: false, reason: 'invalid_prefix' });
  });

  it('نویسه غیرمجاز را رد می‌کند', () => {
    expect(parseIranianMobile('0912abc4567')).toEqual({ ok: false, reason: 'invalid_characters' });
  });

  it('نمایش فارسی و ماسک امن تولید می‌کند', () => {
    expect(formatMobileFa('09121234567')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷');
    expect(maskMobile('09121234567')).toBe('0912***67');
    expect(maskMobile('123')).toBe('***');
  });
});
