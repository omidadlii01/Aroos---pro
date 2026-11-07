import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHOTO_CONSENT_VERSION } from '@bridalos/contracts';

import {
  authHeader,
  createTestApp,
  login,
  promoteToPlatformAdmin,
  setupTenant,
  type TestContext,
} from './helpers/test-app.js';

let ctx: TestContext;
let brideToken: string;
let otherBrideToken: string;
let publishedDressId: string;
let draftDressId: string;
let photoId: string;

async function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 150, channels: 3, background: '#c4b2bf' } })
    .jpeg()
    .toBuffer();
}

async function uploadPhoto(token: string): Promise<{ id: string; url: string }> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/v1/photos')
    .set(authHeader(token))
    .set('content-type', 'image/jpeg')
    .set('x-consent-given', 'true')
    .set('x-consent-version', PHOTO_CONSENT_VERSION)
    .send(await jpeg());
  return response.body;
}

beforeAll(async () => {
  ctx = await createTestApp();

  const tenant = await setupTenant(ctx.app, ctx.runner, {
    phone: '09127000001',
    approve: true,
    name: 'مزون امتحان مجازی',
    citySlug: 'tehran',
  });

  const published = await request(ctx.app.getHttpServer())
    .post('/api/v1/dresses')
    .set(authHeader(tenant.tenantToken))
    .send({
      code: 'TRY-1',
      name: 'لباس امتحان مجازی',
      description: 'توضیح کافی برای انتشار لباس امتحان مجازی در کاتالوگ عمومی.',
      category: 'wedding',
      priceMinToman: 25_000_000,
    });
  publishedDressId = published.body.id;

  await request(ctx.app.getHttpServer())
    .post(`/api/v1/dresses/${publishedDressId}/media`)
    .set(authHeader(tenant.tenantToken))
    .set('content-type', 'image/jpeg')
    .set('x-rights-attested', 'true')
    .send(await jpeg());
  await request(ctx.app.getHttpServer())
    .post(`/api/v1/dresses/${publishedDressId}/publish`)
    .set(authHeader(tenant.tenantToken));

  const draft = await request(ctx.app.getHttpServer())
    .post('/api/v1/dresses')
    .set(authHeader(tenant.tenantToken))
    .send({ code: 'TRY-2', name: 'لباس پیش‌نویس', category: 'wedding' });
  draftDressId = draft.body.id;

  brideToken = (await login(ctx.app, '09127000002')).accessToken;
  otherBrideToken = (await login(ctx.app, '09127000003')).accessToken;
  photoId = (await uploadPhoto(brideToken)).id;
});

afterAll(async () => {
  await ctx.close();
});

describe('امتحان مجازی — وضعیت صریح بدون ادعای خروجی', () => {
  it('بدون ورود ۴۰۱ است', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .send({ photoId, dressId: publishedDressId });
    expect(response.status).toBe(401);
  });

  it('درخواست معتبر با وضعیت blocked و دلیل فارسی ثبت می‌شود', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(brideToken))
      .send({ photoId, dressId: publishedDressId });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('blocked');
    expect(response.body.aiConfigured).toBe(false);
    expect(response.body.provider).toBe('none');
    expect(response.body.statusReason).toContain('سرویس هوش مصنوعی');
    // هیچ آدرس تصویری برای نتیجه برنمی‌گردد (چون خروجی وجود ندارد)
    expect(response.body).not.toHaveProperty('resultUrl');
  });

  it('عکس کاربر دیگر ۴۰۴ می‌گیرد', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(otherBrideToken))
      .send({ photoId, dressId: publishedDressId });
    expect(response.status).toBe(404);
  });

  it('لباس منتشرنشده برای امتحان مجازی در دسترس نیست', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(brideToken))
      .send({ photoId, dressId: draftDressId });
    expect(response.status).toBe(404);
  });

  it('شناسه نامعتبر ۴۰۰ می‌دهد', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(brideToken))
      .send({ photoId: 'not-a-uuid', dressId: publishedDressId });
    expect(response.status).toBe(400);
  });

  it('هر کاربر فقط درخواست‌های خودش را می‌بیند', async () => {
    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/tryon')
      .set(authHeader(brideToken));
    expect(mine.status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThanOrEqual(1);

    const requestId = mine.body.items[0].id;
    const other = await request(ctx.app.getHttpServer())
      .get(`/api/v1/tryon/${requestId}`)
      .set(authHeader(otherBrideToken));
    expect(other.status).toBe(404);

    const own = await request(ctx.app.getHttpServer())
      .get(`/api/v1/tryon/${requestId}`)
      .set(authHeader(brideToken));
    expect(own.status).toBe(200);
    expect(own.body.status).toBe('blocked');
  });
});

describe('پاک‌سازی خودکار عکس‌های منقضی', () => {
  it('ادمین می‌تواند پاک‌سازی را اجرا کند و فقط منقضی‌ها حذف می‌شوند', async () => {
    const adminLogin = await login(ctx.app, '09127000009');
    await promoteToPlatformAdmin(ctx.runner, adminLogin.userId);
    const adminToken = (await login(ctx.app, '09127000009', { fresh: true })).accessToken;

    const expired = await uploadPhoto(brideToken);
    const fresh = await uploadPhoto(brideToken);

    // رکورد را به گذشته منتقل می‌کنیم (constraint رضایت<نگه‌داری حفظ می‌شود)
    await ctx.runner.query(
      `UPDATE bride_photos
          SET consent_given_at = now() - interval '100 days',
              retention_until = now() - interval '1 day'
        WHERE id = $1`,
      [expired.id],
    );

    const forbidden = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/maintenance/photos-purge')
      .set(authHeader(brideToken));
    expect(forbidden.status).toBe(403);

    const purge = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/maintenance/photos-purge')
      .set(authHeader(adminToken));
    expect(purge.status).toBe(201);
    expect(purge.body.purged).toBeGreaterThanOrEqual(1);

    const expiredRows = await ctx.runner.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bride_photos WHERE id = $1',
      [expired.id],
    );
    expect(expiredRows[0]?.count).toBe(0);

    const freshRows = await ctx.runner.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bride_photos WHERE id = $1',
      [fresh.id],
    );
    expect(freshRows[0]?.count).toBe(1);

    const expiredFile = await request(ctx.app.getHttpServer()).get(expired.url);
    expect(expiredFile.status).toBe(404);

    const audit = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/audit?limit=10')
      .set(authHeader(adminToken));
    const entry = audit.body.items.find(
      (item: { action: string }) => item.action === 'photos.retention_purged',
    );
    expect(entry).toBeTruthy();
  });

  it('اجرای دوباره پاک‌سازی بی‌خطر است (idempotent)', async () => {
    const adminToken = (await login(ctx.app, '09127000009')).accessToken;
    const first = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/maintenance/photos-purge')
      .set(authHeader(adminToken));
    expect(first.status).toBe(201);
    expect(first.body.failed).toBe(0);
  });
});
