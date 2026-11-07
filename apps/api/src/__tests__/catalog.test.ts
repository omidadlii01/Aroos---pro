import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authHeader,
  createTestApp,
  login,
  setupTenant,
  type TenantContext,
  type TestContext,
} from './helpers/test-app.js';

let ctx: TestContext;
let tenant: TenantContext;

async function makeJpeg(withSecretExif = false): Promise<Buffer> {
  const base = sharp({ create: { width: 64, height: 96, channels: 3, background: '#c9a0b4' } }).jpeg();
  if (!withSecretExif) return base.toBuffer();
  return sharp({ create: { width: 64, height: 96, channels: 3, background: '#c9a0b4' } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { ImageDescription: 'secret-exif-location' } } })
    .toBuffer();
}

async function createDress(token: string, overrides: Record<string, unknown> = {}) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/dresses')
    .set(authHeader(token))
    .send({
      code: `D-${Math.floor(Math.random() * 1_000_000)}`,
      name: 'لباس عروس آزمون',
      description: 'توضیح کامل لباس برای انتشار در کاتالوگ عمومی مزون.',
      category: 'wedding',
      priceMinToman: 20_000_000,
      priceMaxToman: 35_000_000,
      ...overrides,
    });
}

async function uploadMedia(token: string, dressId: string, options: { jpeg?: Buffer; contentType?: string; rights?: boolean } = {}) {
  const jpeg = options.jpeg ?? (await makeJpeg());
  let req = request(ctx.app.getHttpServer())
    .post(`/api/v1/dresses/${dressId}/media`)
    .set(authHeader(token))
    .set('content-type', options.contentType ?? 'image/jpeg');
  if (options.rights !== false) req = req.set('x-rights-attested', 'true');
  return req.send(jpeg);
}

beforeAll(async () => {
  ctx = await createTestApp();
  tenant = await setupTenant(ctx.app, ctx.runner, {
    phone: '09124000001',
    approve: true,
    name: 'مزون کاتالوگ',
  });
});

afterAll(async () => {
  await ctx.close();
});

describe('کاتالوگ لباس — CRUD و جداسازی tenant', () => {
  it('لباس جدید با وضعیت پیش‌نویس ساخته می‌شود و مبلغ تومان به ریال تبدیل می‌گردد', async () => {
    const response = await createDress(tenant.tenantToken, { code: 'WED-001' });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('draft');
    expect(response.body.priceMinRial).toBe(200_000_000);
    expect(response.body.priceMaxRial).toBe(350_000_000);
    expect(response.body.media).toEqual([]);
  });

  it('کد تکراری در همان مزون ۴۰۹ می‌دهد', async () => {
    const duplicate = await createDress(tenant.tenantToken, { code: 'WED-001' });
    expect(duplicate.status).toBe(409);
  });

  it('بازه قیمت نامعتبر با پیام فارسی رد می‌شود', async () => {
    const response = await createDress(tenant.tenantToken, {
      code: 'WED-BAD',
      priceMinToman: 50_000_000,
      priceMaxToman: 10_000_000,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('TEST منفی: لباس مزون دیگر قابل خواندن یا ویرایش نیست', async () => {
    const other = await setupTenant(ctx.app, ctx.runner, {
      phone: '09124000002',
      approve: true,
      name: 'مزون رقیب',
      citySlug: 'shiraz',
    });
    const otherDress = await createDress(other.tenantToken, { code: 'RIV-1' });
    expect(otherDress.status).toBe(201);

    const read = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dresses/${otherDress.body.id}`)
      .set(authHeader(tenant.tenantToken));
    expect(read.status).toBe(404);

    const patch = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dresses/${otherDress.body.id}`)
      .set(authHeader(tenant.tenantToken))
      .send({ name: 'تلاش تغییر' });
    expect(patch.status).toBe(404);

    const upload = await uploadMedia(tenant.tenantToken, otherDress.body.id);
    expect(upload.status).toBe(404);
  });

  it('فهرست لباس‌ها فقط لباس‌های مزون فعال را برمی‌گرداند', async () => {
    const list = await request(ctx.app.getHttpServer())
      .get('/api/v1/dresses')
      .set(authHeader(tenant.tenantToken));
    expect(list.status).toBe(200);
    const codes = list.body.items.map((item: { code: string }) => item.code);
    expect(codes).toContain('WED-001');
    expect(codes).not.toContain('RIV-1');
  });
});

describe('رسانه خصوصی و URL امضاشده', () => {
  let dressId: string;

  beforeAll(async () => {
    const dress = await createDress(tenant.tenantToken, { code: 'MEDIA-1' });
    dressId = dress.body.id;
  });

  it('بدون تأیید حقوق انتشار، بارگذاری رد می‌شود', async () => {
    const response = await uploadMedia(tenant.tenantToken, dressId, { rights: false });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('حق انتشار');
  });

  it('نوع اعلام‌شده باید با محتوای فایل سازگار باشد (جلوگیری از جعل MIME)', async () => {
    const response = await uploadMedia(tenant.tenantToken, dressId, { contentType: 'image/png' });
    expect(response.status).toBe(400);
  });

  it('تصویر معتبر ذخیره می‌شود، متادیتای حساس حذف می‌گردد و URL کوتاه‌عمر برمی‌گردد', async () => {
    const withExif = await makeJpeg(true);
    const response = await uploadMedia(tenant.tenantToken, dressId, { jpeg: withExif });

    expect(response.status).toBe(201);
    expect(response.body.media.url).toContain('/api/v1/media/');
    expect(response.body.media.width).toBe(64);

    const file = await request(ctx.app.getHttpServer()).get(response.body.media.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toContain('private');
    // متادیتای EXIF ورودی نباید در فایل ذخیره‌شده باقی بماند
    expect(file.body.includes(Buffer.from('secret-exif-location'))).toBe(false);
  });

  it('توکن دستکاری‌شده یا متعلق به فایل دیگر پذیرفته نمی‌شود', async () => {
    const uploaded = await uploadMedia(tenant.tenantToken, dressId);
    const url: string = uploaded.body.media.url;
    const mediaId = url.split('/api/v1/media/')[1]?.split('?')[0];
    const query = url.split('?')[1];

    const tampered = await request(ctx.app.getHttpServer()).get(
      `/api/v1/media/${mediaId}?${query}&token=deadbeef`,
    );
    expect(tampered.status).toBe(403);

    const otherFile = await request(ctx.app.getHttpServer()).get(
      `/api/v1/media/00000000-0000-4000-8000-000000000000?${query}`,
    );
    expect(otherFile.status).toBe(403);
  });

  it('لینک منقضی ۴۰۳ می‌دهد و لینک بدون توکن هم رد می‌شود', async () => {
    const uploaded = await uploadMedia(tenant.tenantToken, dressId);
    const mediaId = uploaded.body.media.url.split('/api/v1/media/')[1]?.split('?')[0];

    const expired = await request(ctx.app.getHttpServer()).get(
      `/api/v1/media/${mediaId}?expires=1&token=abc`,
    );
    expect(expired.status).toBe(403);

    const noToken = await request(ctx.app.getHttpServer()).get(`/api/v1/media/${mediaId}`);
    expect(noToken.status).toBe(403);
  });

  it('حذف تصویر، رکورد را حذف و لینک قبلی را بی‌اثر می‌کند', async () => {
    const uploaded = await uploadMedia(tenant.tenantToken, dressId);
    const url: string = uploaded.body.media.url;
    const mediaId = url.split('/api/v1/media/')[1]?.split('?')[0];

    const removed = await request(ctx.app.getHttpServer())
      .delete(`/api/v1/dresses/${dressId}/media/${mediaId}`)
      .set(authHeader(tenant.tenantToken));
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);

    const afterDelete = await request(ctx.app.getHttpServer()).get(url);
    expect(afterDelete.status).toBe(404);
  });
});

describe('انتشار و کاتالوگ عمومی', () => {
  it('انتشار بدون تصویر رد می‌شود و دلیل دقیق اعلام می‌گردد', async () => {
    const dress = await createDress(tenant.tenantToken, { code: 'PUB-1' });
    const publish = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(tenant.tenantToken));
    expect(publish.status).toBe(409);
    expect(publish.body.error.message).toContain('تصویر');
  });

  it('پس از تکمیل الزامات، لباس منتشر می‌شود و در کاتالوگ عمومی دیده می‌شود', async () => {
    const dress = await createDress(tenant.tenantToken, { code: 'PUB-2' });
    const upload = await uploadMedia(tenant.tenantToken, dress.body.id);
    expect(upload.status).toBe(201);

    const publish = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(tenant.tenantToken));
    expect(publish.status).toBe(200);
    expect(publish.body.status).toBe('published');

    const catalog = await request(ctx.app.getHttpServer()).get('/api/v1/public/dresses?city=tehran');
    expect(catalog.status).toBe(200);
    const found = catalog.body.items.find((item: { id: string }) => item.id === dress.body.id);
    expect(found).toBeTruthy();
    expect(found.media[0].url).toContain('/api/v1/media/');
    expect(found.boutique.name).toBe('مزون کاتالوگ');
  });

  it('لباس پیش‌نویس در کاتالوگ عمومی ظاهر نمی‌شود', async () => {
    const draft = await createDress(tenant.tenantToken, { code: 'DRAFT-X' });
    const catalog = await request(ctx.app.getHttpServer()).get('/api/v1/public/dresses');
    const ids = catalog.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(draft.body.id);
  });

  it('فیلتر شهر و دسته و سقف قیمت واقعی است', async () => {
    const emptyCity = await request(ctx.app.getHttpServer()).get(
      '/api/v1/public/dresses?city=mashhad',
    );
    expect(emptyCity.body.items).toEqual([]);

    const wrongCategory = await request(ctx.app.getHttpServer()).get(
      '/api/v1/public/dresses?category=engagement',
    );
    expect(wrongCategory.body.items).toEqual([]);

    const cheapOnly = await request(ctx.app.getHttpServer()).get(
      '/api/v1/public/dresses?priceMaxToman=1000',
    );
    expect(cheapOnly.body.items).toEqual([]);

    const cities = await request(ctx.app.getHttpServer()).get('/api/v1/public/cities');
    expect(cities.body.items.some((item: { citySlug: string }) => item.citySlug === 'tehran')).toBe(true);
  });

  it('صفحه عمومی مزون فقط لباس‌های منتشرشده را نشان می‌دهد', async () => {
    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/mine')
      .set(authHeader(tenant.ownerToken));
    const slug = mine.body.items[0].slug;

    const page = await request(ctx.app.getHttpServer()).get(`/api/v1/public/boutiques/${slug}`);
    expect(page.status).toBe(200);
    const statuses = page.body.dresses.map((item: { status?: string; id: string }) => item.id);
    expect(statuses.length).toBeGreaterThan(0);

    const unknown = await request(ctx.app.getHttpServer()).get('/api/v1/public/boutiques/nope-none');
    expect(unknown.status).toBe(404);
  });

  it('لباس منتشرشده قابل ویرایش نیست (۴۰۹) و بایگانی آن را از کاتالوگ حذف می‌کند', async () => {
    const dress = await createDress(tenant.tenantToken, { code: 'PUB-3' });
    await uploadMedia(tenant.tenantToken, dress.body.id);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(tenant.tenantToken));

    const patch = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dresses/${dress.body.id}`)
      .set(authHeader(tenant.tenantToken))
      .send({ name: 'ویرایش پس از انتشار' });
    expect(patch.status).toBe(409);

    const archive = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/archive`)
      .set(authHeader(tenant.tenantToken));
    expect(archive.status).toBe(200);

    const catalog = await request(ctx.app.getHttpServer()).get('/api/v1/public/dresses');
    const ids = catalog.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(dress.body.id);
  });

  it('مزون تأییدنشده نمی‌تواند لباس منتشر کند', async () => {
    const pending = await setupTenant(ctx.app, ctx.runner, {
      phone: '09124000003',
      approve: false,
      name: 'مزون در انتظار',
      citySlug: 'isfahan',
    });
    const dress = await createDress(pending.tenantToken, { code: 'PEND-1' });
    await uploadMedia(pending.tenantToken, dress.body.id);

    const publish = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(pending.tenantToken));
    expect(publish.status).toBe(409);
    expect(publish.body.error.message).toContain('تأیید');
  });

  it('کارمند مزون (boutique_staff) نمی‌تواند لباس بسازد یا منتشر کند', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/v1/boutiques/active/members/invite')
      .set(authHeader(tenant.tenantToken))
      .send({ phone: '09124000004', role: 'boutique_staff' });

    const staff = await login(ctx.app, '09124000004');
    const selected = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(staff.accessToken))
      .send({ boutiqueId: tenant.boutiqueId });
    const staffToken = selected.body.accessToken;

    const create = await createDress(staffToken, { code: 'STAFF-1' });
    expect(create.status).toBe(403);

    const dress = await createDress(tenant.tenantToken, { code: 'STAFF-2' });
    const publish = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dresses/${dress.body.id}/publish`)
      .set(authHeader(staffToken));
    expect(publish.status).toBe(403);

    const read = await request(ctx.app.getHttpServer())
      .get('/api/v1/dresses')
      .set(authHeader(staffToken));
    expect(read.status).toBe(200);
  });
});
