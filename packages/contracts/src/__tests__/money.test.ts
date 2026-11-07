import { describe, expect, it } from 'vitest';

import { MoneyError, formatToman, makePriceRange, parseTomanInput, rialToToman, tomanToRial } from '../money.js';

describe('پول', () => {
  it('تبدیل تومان و ریال', () => {
    expect(tomanToRial(2_500_000)).toBe(25_000_000);
    expect(rialToToman(25_000_000)).toBe(2_500_000);
  });

  it('ریال غیرمضرب ۱۰ را رد می‌کند تا نمایش تومان دقیق بماند', () => {
    expect(() => rialToToman(1235)).toThrow(MoneyError);
  });

  it('عدد اعشاری را رد می‌کند', () => {
    expect(() => tomanToRial(10.5)).toThrow(MoneyError);
  });

  it('نمایش مبلغ با ارقام و جداکننده فارسی', () => {
    expect(formatToman(25_000_000)).toBe('۲٬۵۰۰٬۰۰۰ تومان');
    expect(formatToman(25_000_000, { withUnit: false })).toBe('۲٬۵۰۰٬۰۰۰');
  });

  it('ورودی کاربر را با ارقام فارسی و جداکننده می‌خواند', () => {
    expect(parseTomanInput('۲٬۵۰۰٬۰۰۰ تومان')).toEqual({ ok: true, rial: 25_000_000 });
    expect(parseTomanInput('2500000')).toEqual({ ok: true, rial: 25_000_000 });
  });

  it('ورودی نامعتبر را با دلیل فارسی برمی‌گرداند', () => {
    expect(parseTomanInput('').ok).toBe(false);
    expect(parseTomanInput('۰').ok).toBe(false);
    expect(parseTomanInput('abc').ok).toBe(false);
  });

  it('بازه قیمت را اعتبارسنجی می‌کند', () => {
    expect(makePriceRange(1_000_000, 5_000_000)).toEqual({ minRial: 1_000_000, maxRial: 5_000_000 });
    expect(() => makePriceRange(5_000_000, 1_000_000)).toThrow(MoneyError);
  });
});
