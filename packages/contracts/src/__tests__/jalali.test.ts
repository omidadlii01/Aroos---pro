import { describe, expect, it } from 'vitest';

import {
  formatDateKeyJalali,
  formatJalaliDate,
  gregorianToJalali,
  isValidJalali,
  jalaliToGregorian,
  parseJalaliInputToDateKey,
  tehranDateKey,
} from '../jalali.js';

describe('تاریخ شمسی', () => {
  it.each([
    [{ gy: 2024, gm: 3, gd: 20 }, { jy: 1403, jm: 1, jd: 1 }],
    [{ gy: 2023, gm: 3, gd: 21 }, { jy: 1402, jm: 1, jd: 1 }],
    [{ gy: 2021, gm: 3, gd: 21 }, { jy: 1400, jm: 1, jd: 1 }],
    [{ gy: 2020, gm: 3, gd: 20 }, { jy: 1399, jm: 1, jd: 1 }],
    [{ gy: 2024, gm: 8, gd: 2 }, { jy: 1403, jm: 5, jd: 12 }],
  ])('تبدیل میلادی %o به شمسی', (gregorian, expected) => {
    expect(gregorianToJalali(gregorian)).toEqual(expected);
  });

  it('تبدیل رفت‌وبرگشت برای ۱۰۰۰ روز متوالی پایدار است', () => {
    const start = Date.UTC(2022, 0, 1);
    for (let i = 0; i < 1000; i += 1) {
      const date = new Date(start + i * 86_400_000);
      const gy = date.getUTCFullYear();
      const gm = date.getUTCMonth() + 1;
      const gd = date.getUTCDate();
      const jalali = gregorianToJalali({ gy, gm, gd });
      expect(jalaliToGregorian(jalali)).toEqual({ gy, gm, gd });
    }
  });

  it('تاریخ شمسی نامعتبر را تشخیص می‌دهد (۳۱ اسفند در سال غیرکبیسه)', () => {
    expect(isValidJalali({ jy: 1403, jm: 12, jd: 30 })).toBe(true);
    expect(isValidJalali({ jy: 1403, jm: 12, jd: 31 })).toBe(false);
    expect(isValidJalali({ jy: 1403, jm: 13, jd: 1 })).toBe(false);
  });

  it('ورودی فرم شمسی را به کلید تاریخ میلادی تهران تبدیل می‌کند', () => {
    expect(parseJalaliInputToDateKey('۱۴۰۳/۰۵/۱۲')).toEqual({ ok: true, dateKey: '2024-08-02' });
    expect(parseJalaliInputToDateKey('1403-5-2')).toEqual({ ok: true, dateKey: '2024-07-23' });
    expect(parseJalaliInputToDateKey('1403/12/31').ok).toBe(false);
    expect(parseJalaliInputToDateKey('not-a-date').ok).toBe(false);
  });

  it('کلید تاریخ میلادی را شمسی نمایش می‌دهد', () => {
    expect(formatDateKeyJalali('2024-08-02')).toBe('۱۲ مرداد ۱۴۰۳');
  });

  it('مرز نیمه‌شب تهران را برای کلید تاریخ درست حساب می‌کند', () => {
    // ۲۱:۰۰ UTC روز ۲۰ مارس = ۰۰:۳۰ روز ۲۱ مارس در تهران
    expect(tehranDateKey('2024-03-20T21:00:00.000Z')).toBe('2024-03-21');
    expect(tehranDateKey('2024-03-20T20:00:00.000Z')).toBe('2024-03-20');
  });

  it('نمایش تاریخ شمسی برای کاربر فارسی است', () => {
    const formatted = formatJalaliDate('2024-03-20T09:00:00.000Z');
    expect(formatted).toContain('۱۴۰۳');
    expect(formatted).toContain('فروردین');
  });
});
