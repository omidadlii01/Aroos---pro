import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { JsonLogger } from '../../common/logger.js';
import { requestIdMiddleware } from '../../common/request-id.middleware.js';
import { type AppConfig, loadConfig } from '../../config/config.js';
import { SQL_RUNNER } from '../../database/database.module.js';
import type { SqlRunner } from '../../database/sql.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../../database/migrations');

/** تنظیمات تست: پستگرس درون‌فرایندی (pglite) و رازهای ساختگی تست. */
export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  const { config } = loadConfig({
    NODE_ENV: 'test',
    APP_ENV: 'test',
    DB_DRIVER: 'pglite',
    PGLITE_DATA_DIR: 'memory://',
    AUTH_JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789',
    AUTH_OTP_PEPPER: 'test-otp-pepper-0123456789abcdef0123456789',
    AUTH_OTP_RESEND_COOLDOWN_SECONDS: '10',
    AUTH_OTP_MAX_PER_HOUR: '10',
    AUTH_DEV_ECHO_OTP: 'true',
    LOG_LEVEL: 'error',
    ...overrides,
  });
  return config;
}

export type TestContext = {
  app: INestApplication;
  runner: SqlRunner;
  config: AppConfig;
  close: () => Promise<void>;
};

/**
 * ساخت برنامه کامل Nest با migration واقعی روی پستگرس درون‌فرایندی.
 * هیچ mock‌ای برای دیتابیس استفاده نمی‌شود؛ همان SQL تولیدی اجرا می‌شود.
 */
export async function createTestApp(
  overrides: Record<string, string | undefined> = {},
): Promise<TestContext> {
  const config = testConfig(overrides);
  const logger = new JsonLogger('error');
  const app = await NestFactory.create(
    AppModule.forRoot(config, { logger, migrationsDir: MIGRATIONS_DIR }),
    { logger: false },
  );
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  await app.init();

  const runner = app.get<SqlRunner>(SQL_RUNNER);
  return {
    app,
    runner,
    config,
    close: async () => {
      await app.close();
    },
  };
}

export type LoginResult = {
  accessToken: string;
  userId: string;
  activeBoutiqueId: string | null;
  phone: string;
  status: number;
};

/** ورود کامل با OTP در حالت توسعه (کد از پاسخ devCode خوانده می‌شود). */
export async function login(app: INestApplication, phone: string): Promise<LoginResult> {
  const server = app.getHttpServer();
  const challenge = await request(server).post('/api/v1/auth/otp/request').send({ phone });
  if (challenge.status !== 200) {
    return {
      accessToken: '',
      userId: '',
      activeBoutiqueId: null,
      phone,
      status: challenge.status,
    };
  }
  const verify = await request(server)
    .post('/api/v1/auth/otp/verify')
    .send({ challengeId: challenge.body.challengeId, code: challenge.body.devCode });

  return {
    accessToken: verify.body?.accessToken ?? '',
    userId: verify.body?.user?.id ?? '',
    activeBoutiqueId: verify.body?.activeBoutiqueId ?? null,
    phone,
    status: verify.status,
  };
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
