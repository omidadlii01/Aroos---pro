import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config/config.js';

const base = {
  NODE_ENV: 'development',
  AUTH_JWT_SECRET: 'a'.repeat(40),
  AUTH_OTP_PEPPER: 'b'.repeat(40),
};

describe('اعتبارسنجی تنظیمات', () => {
  it('در development بدون راز هم بالا می‌آید اما هشدار می‌دهد', () => {
    const { config, warnings } = loadConfig({ NODE_ENV: 'development' });
    expect(config.auth.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.join(' ')).toContain('AUTH_JWT_SECRET');
  });

  it('در production بدون راز بالا نمی‌آید', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DB_DRIVER: 'postgres',
        DATABASE_URL: 'postgresql://user:pass@db:5432/bridalos',
        API_ORIGINS: 'https://app.example.com',
        AUTH_DEV_ECHO_OTP: 'false',
      }),
    ).toThrow(ConfigError);
  });

  it('در production اجازه نمی‌دهد کد OTP در پاسخ API برگردد', () => {
    try {
      loadConfig({
        NODE_ENV: 'production',
        DB_DRIVER: 'postgres',
        DATABASE_URL: 'postgresql://user:pass@db:5432/bridalos',
        API_ORIGINS: 'https://app.example.com',
        AUTH_JWT_SECRET: 'a'.repeat(40),
        AUTH_OTP_PEPPER: 'b'.repeat(40),
        AUTH_DEV_ECHO_OTP: 'true',
        SMS_DRIVER: 'dev',
      });
      throw new Error('باید خطا می‌داد');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const messages = (error as ConfigError).issues.join(' ');
      expect(messages).toContain('AUTH_DEV_ECHO_OTP');
      // پیام خطا نباید مقدار راز را افشا کند
      expect(messages).not.toContain('a'.repeat(40));
    }
  });

  it('pglite در production ممنوع است', () => {
    try {
      loadConfig({
        NODE_ENV: 'production',
        DB_DRIVER: 'pglite',
        AUTH_JWT_SECRET: 'a'.repeat(40),
        AUTH_OTP_PEPPER: 'b'.repeat(40),
        API_ORIGINS: 'https://app.example.com',
        AUTH_DEV_ECHO_OTP: 'false',
      });
      throw new Error('باید خطا می‌داد');
    } catch (error) {
      expect((error as ConfigError).issues.join(' ')).toContain('pglite');
    }
  });

  it('آداپتور پیامک واقعی هنوز پیاده‌سازی نشده و باید صریح خطا بدهد', () => {
    try {
      loadConfig({ ...base, SMS_DRIVER: 'kavenegar' });
      throw new Error('باید خطا می‌داد');
    } catch (error) {
      expect((error as ConfigError).issues.join(' ')).toContain('SMS_DRIVER=kavenegar');
    }
  });

  it('CORS در production باید https باشد', () => {
    try {
      loadConfig({
        NODE_ENV: 'production',
        DB_DRIVER: 'postgres',
        DATABASE_URL: 'postgresql://user:pass@db:5432/bridalos',
        API_ORIGINS: 'http://insecure.example.com',
        AUTH_JWT_SECRET: 'a'.repeat(40),
        AUTH_OTP_PEPPER: 'b'.repeat(40),
        AUTH_DEV_ECHO_OTP: 'false',
      });
      throw new Error('باید خطا می‌داد');
    } catch (error) {
      expect((error as ConfigError).issues.join(' ')).toContain('https');
    }
  });

  it('مقدار عددی نامعتبر را گزارش می‌دهد', () => {
    try {
      loadConfig({ ...base, AUTH_OTP_MAX_ATTEMPTS: '99' });
      throw new Error('باید خطا می‌داد');
    } catch (error) {
      expect((error as ConfigError).issues.join(' ')).toContain('AUTH_OTP_MAX_ATTEMPTS');
    }
  });

  it('مقادیر معتبر را به شکل صحیح نگاشت می‌کند', () => {
    const { config } = loadConfig({
      ...base,
      API_PORT: '4100',
      API_ORIGINS: 'http://localhost:3000, http://127.0.0.1:3000',
      AUTH_OTP_TTL_SECONDS: '180',
    });
    expect(config.api.port).toBe(4100);
    expect(config.api.origins).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
    expect(config.auth.otpTtlSeconds).toBe(180);
    expect(config.db.driver).toBe('pglite');
  });
});
