import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHOTO_CONSENT_VERSION, PHOTO_RETENTION_DAYS } from '@bridalos/contracts';

import { authHeader, createTestApp, login, type TestContext } from './helpers/test-app.js';

let ctx: TestContext;
let brideToken: string;
let otherToken: string;

async function makePhoto(withSecretExif = false): Promise<Buffer> {
  const base = sharp({ create: { width: 120, height: 180, channels: 3, background: '#cbb6c4' } });
  if (!withSecretExif) return base.jpeg().toBuffer();
  return sharp({ create: { width: 120, height: 180, channels: 3, background: '#cbb6c4' } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { ImageDescription: 'secret-home-gps' } } })
    .toBuffer();
}

function upload(
  token: string,
  options: {
    buffer?: Buffer;
    consent?: string;
    version?: string;
    contentType?: string;
  } = {},
) {
  let req = request(ctx.app.getHttpServer())
    .post('/api/v1/photos')
    .set(authHeader(token))
    .set('content-type', options.contentType ?? 'image/jpeg');
  if (options.consent !== undefined) req = req.set('x-consent-given', options.consent);
  if (options.version !== undefined) req = req.set('x-consent-version', options.version);
  return req.send(options.buffer ?? Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
}

beforeAll(async () => {
  ctx = await createTestApp();
  brideToken = (await login(ctx.app, '09126000001')).accessToken;
  otherToken = (await login(ctx.app, '09126000002')).accessToken;
});

afterAll(async () => {
  await ctx.close();
});

describe('رضایت و اعتبارسنجی بارگذاری', () => {
  it('بدون احراز هویت ۴۰۱ است', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/photos')
      .set('content-type', 'image/jpeg')
      .set('x-consent-given', 'true')
      .set('x-consent-version', PHOTO_CONSENT_VERSION)
      .send(await makePhoto());
    expect(response.status).toBe(401);
  });

  it('بارگذاری بدون رضایت صریح رد می‌شود', async () => {
    const response = await upload(brideToken, { buffer: await makePhoto() });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('رضایت');
  });

  it('نسخه رضایت‌نامه نامعتبر رد می‌شود', async () => {
    const response = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: 'v99',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('نسخه');
  });

  it('فرمت غیرتصویری یا بدنه غیر خام رد می‌شود', async () => {
    const wrongType = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
      contentType: 'application/json',
    });
    expect(wrongType.status).toBe(400);

    const jsonBody = await request(ctx.app.getHttpServer())
      .post('/api/v1/photos')
      .set(authHeader(brideToken))
      .set('content-type', 'application/json')
      .set('x-consent-given', 'true')
      .set('x-consent-version', PHOTO_CONSENT_VERSION)
      .send({ photo: 'not-a-file' });
    expect(jsonBody.status).toBe(400);
  });

  it('فایل بزرگ‌تر از سقف مجاز رد می‌شود', async () => {
    const oversized = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(9 * 1024 * 1024)]);
    const response = await upload(brideToken, {
      buffer: oversized,
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
  });
    expect([400, 413]).toContain(response.status);
  });
});

describe('ذخیره خصوصی و خواندن با URL امضاشده', () => {
  it('عکس با تاریخ نگه‌داری ذخیره می‌شود و EXIF حذف می‌گردد', async () => {
    const response = await upload(brideToken, {
      buffer: await makePhoto(true),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });

    expect(response.status).toBe(201);
    expect(response.body.url).toContain(`/api/v1/photos/${response.body.id}/file`);
    expect(response.body.consentVersion).toBe(PHOTO_CONSENT_VERSION);

    const created = new Date(response.body.consentGivenAt).getTime();
    const retention = new Date(response.body.retentionUntil).getTime();
    const days = Math.round((retention - created) / (24 * 3600 * 1000));
    expect(days).toBe(PHOTO_RETENTION_DAYS);

    const file = await request(ctx.app.getHttpServer()).get(response.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toContain('private');
    expect(file.body.includes(Buffer.from('secret-home-gps'))).toBe(false);
  });

  it('توکن دستکاری‌شده، منقضی یا خالی ۴۰۳ می‌گیرد', async () => {
    const uploaded = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });
    const id = uploaded.body.id as string;

    const tampered = await request(ctx.app.getHttpServer()).get(
      `/api/v1/photos/${id}/file?expires=9999999999&token=forged`,
    );
    expect(tampered.status).toBe(403);

    const expired = await request(ctx.app.getHttpServer()).get(
      `/api/v1/photos/${id}/file?expires=1&token=abc`,
    );
    expect(expired.status).toBe(403);

    const missing = await request(ctx.app.getHttpServer()).get(`/api/v1/photos/${id}/file`);
    expect(missing.status).toBe(403);
  });

  it('عکس در مسیر عمومی یا رسانه لباس قابل دسترسی نیست', async () => {
    const uploaded = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });
    const publicMedia = await request(ctx.app.getHttpServer()).get(
      `/api/v1/media/${uploaded.body.id}?expires=9999999999&token=x`,
    );
    expect(publicMedia.status).toBe(403);
  });
});

describe('جداسازی داده بین کاربران', () => {
  it('هر کاربر فقط عکس‌های خودش را می‌بیند', async () => {
    const uploaded = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });

    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/photos')
      .set(authHeader(brideToken));
    expect(mine.status).toBe(200);
    expect(mine.body.items.some((item: { id: string }) => item.id === uploaded.body.id)).toBe(true);

    const other = await request(ctx.app.getHttpServer())
      .get('/api/v1/photos')
      .set(authHeader(otherToken));
    expect(other.body.items.some((item: { id: string }) => item.id === uploaded.body.id)).toBe(false);
  });

  it('کاربر دیگر نمی‌تواند عکس دیگری را حذف کند', async () => {
    const uploaded = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });

    const response = await request(ctx.app.getHttpServer())
      .delete(`/api/v1/photos/${uploaded.body.id}`)
      .set(authHeader(otherToken));
    expect(response.status).toBe(404);

    const stillThere = await request(ctx.app.getHttpServer())
      .get('/api/v1/photos')
      .set(authHeader(brideToken));
    expect(stillThere.body.items.some((item: { id: string }) => item.id === uploaded.body.id)).toBe(true);
  });
});

describe('حذف کامل داده', () => {
  it('حذف توسط مالک، رکورد و فایل را پاک می‌کند و لینک قبلی ۴۰۴ می‌شود', async () => {
    const uploaded = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });
    const url = uploaded.body.url as string;

    const removed = await request(ctx.app.getHttpServer())
      .delete(`/api/v1/photos/${uploaded.body.id}`)
      .set(authHeader(brideToken));
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);

    const rows = await ctx.runner.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bride_photos WHERE id = $1',
      [uploaded.body.id],
    );
    expect(rows[0]?.count).toBe(0);

    const afterDelete = await request(ctx.app.getHttpServer()).get(url);
    expect(afterDelete.status).toBe(404);

    const again = await request(ctx.app.getHttpServer())
      .delete(`/api/v1/photos/${uploaded.body.id}`)
      .set(authHeader(brideToken));
    expect(again.status).toBe(404);
  });

  it('رضایت با نسخه و زمان در دیتابیس ثبت می‌شود', async () => {
    const uploaded = await upload(brideToken, {
      buffer: await makePhoto(),
      consent: 'true',
      version: PHOTO_CONSENT_VERSION,
    });
    const rows = await ctx.runner.query<{ consent_version: string; consent_given_at: string; retention_until: string }>(
      'SELECT consent_version, consent_given_at, retention_until FROM bride_photos WHERE id = $1',
      [uploaded.body.id],
    );
    expect(rows[0]?.consent_version).toBe(PHOTO_CONSENT_VERSION);
    expect(new Date(rows[0]!.retention_until).getTime()).toBeGreaterThan(
      new Date(rows[0]!.consent_given_at).getTime(),
    );
  });
});
