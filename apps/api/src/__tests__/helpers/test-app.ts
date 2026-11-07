import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../../app.module.js';
import { configureHttp } from '../../app-config.js';
import { JsonLogger } from '../../common/logger.js';
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
    MEDIA_ROOT: path.join(tmpdir(), `bridalos-media-test-${randomUUID()}`),
    MEDIA_SIGNING_SECRET: 'test-media-signing-secret-0123456789abcdef',
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
    { logger: ['error'], abortOnError: false },
  );
  configureHttp(app as never, { logger });
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

/**
 * کش توکن ورود در هر فایل تست؛ محدودیت نرخ OTP (cooldown) واقعی است و نباید
 * در تست دور زده شود، پس به‌جای درخواست مکرر از نشست قبلی استفاده می‌کنیم.
 */
const loginCache = new Map<string, LoginResult>();

/** ورود کامل با OTP در حالت توسعه (کد از پاسخ devCode خوانده می‌شود). */
export async function login(app: INestApplication, phone: string): Promise<LoginResult> {
  const cached = loginCache.get(phone);
  if (cached && cached.accessToken) return cached;

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

  const result: LoginResult = {
    accessToken: verify.body?.accessToken ?? '',
    userId: verify.body?.user?.id ?? '',
    activeBoutiqueId: verify.body?.activeBoutiqueId ?? null,
    phone,
    status: verify.status,
  };
  if (result.accessToken) loginCache.set(phone, result);
  return result;
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export type TenantContext = {
  ownerToken: string;
  tenantToken: string;
  boutiqueId: string;
  userId: string;
};

/**
 * ساخت مزون + (در صورت نیاز) تأیید آن + گرفتن توکنِ مزون‌دار.
 * دقیقاً همان مسیر واقعی UI/API را طی می‌کند.
 */
export async function setupTenant(
  app: INestApplication,
  runner: SqlRunner,
  options: { phone: string; approve?: boolean; name?: string; citySlug?: string },
): Promise<TenantContext> {
  const server = app.getHttpServer();
  const session = await login(app, options.phone);
  if (session.status !== 200) throw new Error(`ورود ناموفق: ${session.status}`);

  const boutique = await request(server)
    .post('/api/v1/boutiques')
    .set(authHeader(session.accessToken))
    .send({ name: options.name ?? 'مزون آزمون', citySlug: options.citySlug ?? 'tehran' });
  if (boutique.status !== 201) {
    throw new Error(`ساخت مزون ناموفق: ${boutique.status} ${JSON.stringify(boutique.body)}`);
  }

  if (options.approve) {
    await runner.query("UPDATE boutiques SET status = 'approved' WHERE id = $1", [boutique.body.id]);
  }

  const selected = await request(server)
    .post('/api/v1/auth/tenant')
    .set(authHeader(session.accessToken))
    .send({ boutiqueId: boutique.body.id });
  if (selected.status !== 200) {
    throw new Error(`انتخاب مزون ناموفق: ${selected.status}`);
  }

  return {
    ownerToken: session.accessToken,
    tenantToken: selected.body.accessToken,
    boutiqueId: boutique.body.id,
    userId: session.userId,
  };
}
