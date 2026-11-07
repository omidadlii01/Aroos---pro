import { readdir } from 'node:fs/promises';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, createTestApp, type TestContext } from './helpers/test-app.js';
import { runMigrations } from '../database/migrator.js';

let ctx: TestContext;

/** شناسه migrationها از پوشه خوانده می‌شود تا با افزودن migration جدید تست به‌روز بماند. */
async function migrationIds(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.replace(/\.sql$/, ''))
    .sort();
}

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('سلامت سرویس و وضعیت شفاف قابلیت‌ها', () => {
  it('healthz وضعیت ok و اتصال دیتابیس را برمی‌گرداند', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.status).toBe('ok');
    expect(response.body.checks.database.driver).toBe('pglite');
  });

  it('readyz آمادگی را اعلام می‌کند', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/readyz');
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
  });

  it('meta قابلیت‌های غیرفعال را صریح اعلام می‌کند (بدون ادعای کذب)', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/v1/meta');
    expect(response.status).toBe(200);
    expect(response.body.otpDelivery).toBe('dev-log');
    expect(response.body.payments.status).toBe('disabled');
    expect(response.body.ai.status).toBe('not-configured');
    expect(response.body.ai.realOutput).toBe(false);
    expect(response.body.ai.provider).toBe('none');
    expect(response.body.sms.status).toBe('blocked');
  });

  it('مسیر ناشناخته ۴۰۴ با قالب خطای یکدست برمی‌گرداند', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });
});

describe('migrationها', () => {
  it('همه migrationها در schema_migrations ثبت شده‌اند', async () => {
    const rows = await ctx.runner.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
    const expected = await migrationIds();
    expect(rows.map((row) => row.id)).toEqual(expected);
    expect(expected.length).toBeGreaterThanOrEqual(4);
  });

  it('اجرای دوباره migration چیزی اعمال نمی‌کند (idempotent)', async () => {
    const report = await runMigrations(ctx.runner, { dir: MIGRATIONS_DIR });
    expect(report.applied).toEqual([]);
    expect(report.alreadyApplied).toEqual(await migrationIds());
  });

  it('policyهای RLS برای جدول‌های tenant تعریف شده‌اند', async () => {
    const rows = await ctx.runner.query<{ tablename: string; policyname: string }>(
      'SELECT tablename, policyname FROM pg_policies ORDER BY tablename, policyname',
    );
    const names = rows.map((row) => `${row.tablename}.${row.policyname}`);
    expect(names).toContain('boutiques.boutiques_select');
    expect(names).toContain('boutiques.boutiques_insert');
    expect(names).toContain('memberships.memberships_select');
    expect(names).toContain('audit_logs.audit_logs_insert');

    const rlsEnabled = await ctx.runner.query<{ relname: string; relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('boutiques','memberships','audit_logs')",
    );
    for (const row of rlsEnabled) expect(row.relrowsecurity).toBe(true);
  });

  it('⚠️ RLS در این محیط اعمال نمی‌شود (نقش superuser) — این محدودیت مستند است', async () => {
    const roles = await ctx.runner.query<{ current_user: string; is_super: boolean }>(
      `SELECT current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super`,
    );
    expect(roles[0]?.is_super).toBe(true);
  });
});
