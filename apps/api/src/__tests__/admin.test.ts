import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authHeader,
  createTestApp,
  login,
  promoteToPlatformAdmin,
  setupTenant,
  type TenantContext,
  type TestContext,
} from './helpers/test-app.js';

let ctx: TestContext;
let adminToken: string;
let pending: TenantContext;
let ownerToken: string;

beforeAll(async () => {
  ctx = await createTestApp();

  // مدیر پلتفرم: کاربر عادی → ارتقا در دیتابیس → ورود تازه (توکن قدیمی نقش قبلی را دارد)
  const adminLogin = await login(ctx.app, '09125000001');
  await promoteToPlatformAdmin(ctx.runner, adminLogin.userId);
  const adminSession = await login(ctx.app, '09125000001', { fresh: true });
  adminToken = adminSession.accessToken;

  // مزون در انتظار بررسی (بدون تأیید مستقیم در دیتابیس)
  const owner = await login(ctx.app, '09125000002');
  ownerToken = owner.accessToken;
  const boutique = await request(ctx.app.getHttpServer())
    .post('/api/v1/boutiques')
    .set(authHeader(ownerToken))
    .send({ name: 'مزون در انتظار تأیید', citySlug: 'tehran' });
  await request(ctx.app.getHttpServer())
    .post(`/api/v1/boutiques/${boutique.body.id}/submit-review`)
    .set(authHeader(ownerToken));
  const selected = await request(ctx.app.getHttpServer())
    .post('/api/v1/auth/tenant')
    .set(authHeader(ownerToken))
    .send({ boutiqueId: boutique.body.id });
  pending = {
    ownerToken,
    tenantToken: selected.body.accessToken,
    boutiqueId: boutique.body.id,
    userId: owner.userId,
  };

  // یک مزون تأییدشده برای مقایسه شمارش‌ها
  await setupTenant(ctx.app, ctx.runner, {
    phone: '09125000003',
    approve: true,
    name: 'مزون تأییدشده آزمون',
    citySlug: 'shiraz',
  });
});

afterAll(async () => {
  await ctx.close();
});

describe('دسترسی پنل ادمین', () => {
  it('کاربر بدون نقش مدیر پلتفرم ۴۰۳ می‌گیرد', async () => {
    const ownerView = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/overview')
      .set(authHeader(ownerToken));
    expect(ownerView.status).toBe(403);

    const bride = await login(ctx.app, '09125000009');
    const brideView = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/boutiques')
      .set(authHeader(bride.accessToken));
    expect(brideView.status).toBe(403);
  });

  it('درخواست بدون توکن ۴۰۱ است (نه ۴۰۳)', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/v1/admin/overview');
    expect(response.status).toBe(401);
  });

  it('مدیر پلتفرم فهرست مزون‌های در انتظار را با شماره ماسک‌شده می‌بیند', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/boutiques?status=pending_review')
      .set(authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    const target = response.body.items.find(
      (item: { id: string }) => item.id === pending.boutiqueId,
    );
    expect(target).toBeTruthy();
    expect(target.status).toBe('pending_review');
    expect(target.ownerPhoneMasked).toContain('*');
    expect(JSON.stringify(response.body)).not.toContain('09125000002');
  });
});

describe('تأیید و رد مزون', () => {
  it('رد بدون دلیل ۴۰۰ است و دلیل کوتاه هم پذیرفته نمی‌شود', async () => {
    const empty = await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/boutiques/${pending.boutiqueId}/reject`)
      .set(authHeader(adminToken))
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const tooShort = await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/boutiques/${pending.boutiqueId}/reject`)
      .set(authHeader(adminToken))
      .send({ reason: 'نه' });
    expect(tooShort.status).toBe(400);
  });

  it('تأیید، وضعیت را approved می‌کند و در audit ثبت می‌شود', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/boutiques/${pending.boutiqueId}/approve`)
      .set(authHeader(adminToken));

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('approved');
    expect(response.body.reviewedAt).toBeTruthy();
    expect(response.body.reviewReason).toBeNull();

    const audit = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/audit?limit=20')
      .set(authHeader(adminToken));
    expect(audit.status).toBe(200);
    const approvedEntry = audit.body.items.find(
      (item: { action: string }) => item.action === 'boutique.approved',
    );
    expect(approvedEntry).toBeTruthy();
    expect(JSON.stringify(audit.body)).not.toMatch(/0912\d{7}/);
  });

  it('تأیید دوباره مزون تأییدشده ۴۰۹ است', async () => {
    const again = await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/boutiques/${pending.boutiqueId}/approve`)
      .set(authHeader(adminToken));
    expect(again.status).toBe(409);
  });

  it('پس از تأیید ادمین، مالک می‌تواند لباس منتشر کند (زنجیره اولویت‌دار)', async () => {
    const dress = await request(ctx.app.getHttpServer())
      .post('/api/v1/dresses')
      .set(authHeader(pending.tenantToken))
      .send({
        code: 'ADMIN-1',
        name: 'لباس پس از تأیید',
        description: 'توضیح کافی برای انتشار این لباس پس از تأیید رسمی مزون توسط ادمین.',
        category: 'wedding',
        priceMinToman: 30_000_000,
      });
    expect(dress.status).toBe(201);

    const jpeg = await sharp({
      create: { width: 80, height: 120, channels: 3, background: '#b9a0c0' },
    })
      .jpeg()
      .toBuffer();
    const upload = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/media`)
      .set(authHeader(pending.tenantToken))
      .set('content-type', 'image/jpeg')
      .set('x-rights-attested', 'true')
      .send(jpeg);
    expect(upload.status).toBe(201);

    const publish = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(pending.tenantToken));
    expect(publish.status).toBe(200);
    expect(publish.body.status).toBe('published');

    const catalog = await request(ctx.app.getHttpServer()).get('/api/v1/public/dresses?city=tehran');
    const ids = catalog.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(dress.body.id);
  });

  it('رد مزون، دلیل را برای مالک نمایش می‌دهد و امکان ارسال دوباره می‌دهد', async () => {
    const owner = await login(ctx.app, '09125000004');
    const boutique = await request(ctx.app.getHttpServer())
      .post('/api/v1/boutiques')
      .set(authHeader(owner.accessToken))
      .send({ name: 'مزون قابل رد', citySlug: 'tabriz' });
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/${boutique.body.id}/submit-review`)
      .set(authHeader(owner.accessToken));

    const reject = await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/boutiques/${boutique.body.id}/reject`)
      .set(authHeader(adminToken))
      .send({ reason: 'تصاویر مجوز انتشار ندارند؛ لطفاً مدارک را تکمیل کنید.' });
    expect(reject.status).toBe(201);
    expect(reject.body.status).toBe('rejected');
    expect(reject.body.reviewReason).toContain('مجوز انتشار');

    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/mine')
      .set(authHeader(owner.accessToken));
    const mineTarget = mine.body.items.find(
      (item: { id: string }) => item.id === boutique.body.id,
    );
    expect(mineTarget.status).toBe('rejected');
    expect(mineTarget.reviewReason).toContain('مجوز انتشار');

    const resubmit = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/${boutique.body.id}/submit-review`)
      .set(authHeader(owner.accessToken));
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe('pending_review');
  });

  it('مزون ردشده نمی‌تواند لباس منتشر کند', async () => {
    const owner = await login(ctx.app, '09125000005');
    const boutique = await request(ctx.app.getHttpServer())
      .post('/api/v1/boutiques')
      .set(authHeader(owner.accessToken))
      .send({ name: 'مزون ردشده دوم', citySlug: 'qom' });
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/${boutique.body.id}/submit-review`)
      .set(authHeader(owner.accessToken));
    const reject = await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/boutiques/${boutique.body.id}/reject`)
      .set(authHeader(adminToken))
      .send({ reason: 'مدارک هویت ناقص است؛ پس از تکمیل دوباره ارسال کنید.' });
    expect(reject.body.status).toBe('rejected');

    const tenant = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(owner.accessToken))
      .send({ boutiqueId: boutique.body.id });
    expect(tenant.status).toBe(200);

    const dress = await request(ctx.app.getHttpServer())
      .post('/api/v1/dresses')
      .set(authHeader(tenant.body.accessToken))
      .send({ code: 'REJ-1', name: 'لباس مزون ردشده', category: 'wedding' });
    expect(dress.status).toBe(201);

    const publish = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(tenant.body.accessToken));
    expect(publish.status).toBe(409);
    expect(publish.body.error.message).toContain('تأیید');
  });
});

describe('نمای کلی پلتفرم', () => {
  it('شمارش وضعیت‌ها با واقعیت دیتابیس هم‌خوان است', async () => {
    const overview = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/overview')
      .set(authHeader(adminToken));
    expect(overview.status).toBe(200);

    const dbCounts = await ctx.runner.query<{ status: string; count: string | number }>(
      'SELECT status, count(*) AS count FROM boutiques GROUP BY status',
    );
    for (const row of dbCounts) {
      expect(overview.body.boutiques[row.status]).toBe(Number(row.count));
    }
    expect(overview.body.users).toBeGreaterThan(0);
    expect(overview.body.publishedDresses).toBeGreaterThanOrEqual(1);
    expect(overview.body.pendingBoutiques).toBe(overview.body.boutiques.pending_review);
  });

  it('فهرست با فیلتر نامعتبر ۴۰۰ می‌دهد', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/boutiques?status=nonsense')
      .set(authHeader(adminToken));
    expect(response.status).toBe(400);
  });
});
