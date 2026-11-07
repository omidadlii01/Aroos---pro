import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEV_TRYON_LABEL_FA, PHOTO_CONSENT_VERSION } from '@bridalos/contracts';

import {
  authHeader,
  createTestApp,
  login,
  promoteToPlatformAdmin,
  setupTenant,
  type TestContext,
} from './helpers/test-app.js';

/** این فایل با آداپتور آزمایشی اجرا می‌شود تا مسیر صف واقعی سنجیده شود. */
let ctx: TestContext;
let brideToken: string;
let adminToken: string;
let dressId: string;
let photoId: string;

async function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 90, height: 140, channels: 3, background: '#c8b6c2' } })
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  ctx = await createTestApp({ AI_TRYON_PROVIDER: 'dev-watermark' });

  const tenant = await setupTenant(ctx.app, ctx.runner, {
    phone: '09128000001',
    approve: true,
    name: 'مزون صف امتحان',
    citySlug: 'tehran',
  });

  const dress = await request(ctx.app.getHttpServer())
    .post('/api/v1/dresses')
    .set(authHeader(tenant.tenantToken))
    .send({
      code: 'QUEUE-1',
      name: 'لباس صف امتحان',
      description: 'توضیح کافی برای انتشار لباس در تست صف امتحان مجازی.',
      category: 'wedding',
      priceMinToman: 22_000_000,
    });
  dressId = dress.body.id;

  await request(ctx.app.getHttpServer())
    .post(`/api/v1/dresses/${dressId}/media`)
    .set(authHeader(tenant.tenantToken))
    .set('content-type', 'image/jpeg')
    .set('x-rights-attested', 'true')
    .send(await jpeg());
  await request(ctx.app.getHttpServer())
    .post(`/api/v1/dresses/${dressId}/publish`)
    .set(authHeader(tenant.tenantToken));

  brideToken = (await login(ctx.app, '09128000002')).accessToken;
  const photo = await request(ctx.app.getHttpServer())
    .post('/api/v1/photos')
    .set(authHeader(brideToken))
    .set('content-type', 'image/jpeg')
    .set('x-consent-given', 'true')
    .set('x-consent-version', PHOTO_CONSENT_VERSION)
    .send(await jpeg());
  photoId = photo.body.id;

  const admin = await login(ctx.app, '09128000009');
  await promoteToPlatformAdmin(ctx.runner, admin.userId);
  adminToken = (await login(ctx.app, '09128000009', { fresh: true })).accessToken;
});

afterAll(async () => {
  await ctx.close();
});

describe('صف امتحان مجازی با آداپتور آزمایشی', () => {
  it('درخواست با provider آزمایشی در صف قرار می‌گیرد (نه blocked)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(brideToken))
      .send({ photoId, dressId });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('queued');
    expect(response.body.aiConfigured).toBe(true);
    expect(response.body.provider).toBe('dev-watermark');
    expect(response.body.queuePosition).toBeGreaterThanOrEqual(1);
    expect(response.body.result).toBeUndefined();
  });

  it('پردازش صف، خروجی واترمارک‌دار با برچسب صریح تولید می‌کند', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(brideToken))
      .send({ photoId, dressId });
    expect(created.body.status).toBe('queued');

    const drain = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/maintenance/tryon-drain?limit=5')
      .set(authHeader(adminToken));
    expect(drain.status).toBe(201);
    expect(drain.body.succeeded).toBeGreaterThanOrEqual(1);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/tryon/${created.body.id}`)
      .set(authHeader(brideToken));
    expect(detail.body.status).toBe('succeeded');
    expect(detail.body.isDevOutput).toBe(true);
    expect(detail.body.result.url).toContain(`/api/v1/tryon/${created.body.id}/result`);
    expect(detail.body.result.isDevOutput).toBe(true);
    expect(detail.body.result.labelFa).toContain('خروجی آزمایشی');

    const file = await request(ctx.app.getHttpServer()).get(detail.body.result.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-bridalos-dev-output']).toBe('true');
    expect(file.headers['cache-control']).toContain('private');
  });

  it('برچسب اجباری در قرارداد و پاسخ یکسان است', async () => {
    const list = await request(ctx.app.getHttpServer())
      .get('/api/v1/tryon')
      .set(authHeader(brideToken));
    const succeeded = list.body.items.find((item: { status: string }) => item.status === 'succeeded');
    expect(succeeded).toBeTruthy();
    expect(succeeded.result.labelFa).toBe(DEV_TRYON_LABEL_FA);
  });

  it('لینک نتیجه با توکن جعلی یا منقضی ۴۰۳ می‌دهد', async () => {
    const list = await request(ctx.app.getHttpServer())
      .get('/api/v1/tryon')
      .set(authHeader(brideToken));
    const id = list.body.items[0].id as string;

    const forged = await request(ctx.app.getHttpServer()).get(
      `/api/v1/tryon/${id}/result?expires=9999999999&token=forged`,
    );
    expect(forged.status).toBe(403);

    const expired = await request(ctx.app.getHttpServer()).get(
      `/api/v1/tryon/${id}/result?expires=1&token=abc`,
    );
    expect(expired.status).toBe(403);
  });

  it('کاربر دیگر نتیجه را نمی‌بیند و ادمین غیرمجاز نمی‌تواند صف را اجرا کند', async () => {
    const other = await login(ctx.app, '09128000003');
    const list = await request(ctx.app.getHttpServer())
      .get('/api/v1/tryon')
      .set(authHeader(other.accessToken));
    expect(list.body.items).toEqual([]);

    const drain = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/maintenance/tryon-drain')
      .set(authHeader(brideToken));
    expect(drain.status).toBe(403);
  });

  it('اگر عکس پیش از پردازش حذف شود، درخواست شکست می‌خورد (بدون خروجی جعلی)', async () => {
    const photo = await request(ctx.app.getHttpServer())
      .post('/api/v1/photos')
      .set(authHeader(brideToken))
      .set('content-type', 'image/jpeg')
      .set('x-consent-given', 'true')
      .set('x-consent-version', PHOTO_CONSENT_VERSION)
      .send(await jpeg());

    const created = await request(ctx.app.getHttpServer())
      .post('/api/v1/tryon')
      .set(authHeader(brideToken))
      .send({ photoId: photo.body.id, dressId });
    expect(created.body.status).toBe('queued');

    // شبیه‌سازی توقف پردازش: عکس و فایلش حذف می‌شوند
    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/photos/${photo.body.id}`)
      .set(authHeader(brideToken));

    const drain = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/maintenance/tryon-drain?limit=5')
      .set(authHeader(adminToken));
    expect(drain.body.requeued + drain.body.failed).toBeGreaterThanOrEqual(1);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/tryon/${created.body.id}`)
      .set(authHeader(brideToken));
    expect(detail.body.result).toBeUndefined();
    expect(['queued', 'failed']).toContain(detail.body.status);
  });

  it('meta آداپتور آزمایشی را صریح و بدون ادعای خروجی واقعی اعلام می‌کند', async () => {
    const meta = await request(ctx.app.getHttpServer()).get('/api/v1/meta');
    expect(meta.body.ai.provider).toBe('dev-watermark');
    expect(meta.body.ai.realOutput).toBe(false);
    expect(meta.body.ai.experimentalAdapter).toBe(true);
    expect(meta.body.ai.reason).toContain('آزمایشی');
  });
});
