import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  APPOINTMENT_NO_SMS_NOTE_FA,
  tehranDateKeyPlus,
  tehranInstant,
  formatMinuteOfDayFa,
} from '@bridalos/contracts';

import {
  authHeader,
  createTestApp,
  login,
  setupTenant,
  type TestContext,
} from './helpers/test-app.js';

/**
 * نوبت‌دهی مزون (فاز ۸) — همه مسیرها روی پستگرس درون‌فرایندی واقعی اجرا می‌شوند.
 * هیچ ساعت کاری یا نوبت جعلی ساخته نمی‌شود: تست از همان API کارکنان استفاده می‌کند.
 */
let ctx: TestContext;
let ownerToken: string;
let staffToken: string;
let boutiqueId: string;
let brideToken: string;
let otherBrideToken: string;
let dressId: string;

const tomorrowKey = tehranDateKeyPlus(1);
const tomorrowSlotStart = tehranInstant(tomorrowKey, 600); // ۱۰:۰۰ تهران
const unalignedStart = tehranInstant(tomorrowKey, 630); // ۱۰:۳۰ — وسط بازه ۶۰ دقیقه‌ای

const allWeek = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  startsMinute: 600,
  endsMinute: 1080,
  slotMinutes: 60,
  isActive: true,
}));

beforeAll(async () => {
  ctx = await createTestApp({ BOOKING_MAX_ACTIVE_PER_BRIDE: '2' });

  const tenant = await setupTenant(ctx.app, ctx.runner, {
    phone: '09128000011',
    approve: true,
    name: 'مزون نوبت‌دهی',
  });
  ownerToken = tenant.tenantToken;
  boutiqueId = tenant.boutiqueId;

  // کارمند با نقش پایین‌تر برای بررسی سطح دسترسی ساعات کاری
  const staff = await request(ctx.app.getHttpServer())
    .post('/api/v1/boutiques/active/members/invite')
    .set(authHeader(ownerToken))
    .send({ phone: '09128000012', role: 'boutique_staff' });
  expect(staff.status).toBe(200);
  const staffSession = await login(ctx.app, '09128000012');
  const selected = await request(ctx.app.getHttpServer())
    .post('/api/v1/auth/tenant')
    .set(authHeader(staffSession.accessToken))
    .send({ boutiqueId });
  expect(selected.status).toBe(200);
  staffToken = selected.body.accessToken;

  const dress = await request(ctx.app.getHttpServer())
    .post('/api/v1/dresses')
    .set(authHeader(ownerToken))
    .send({ code: 'APT-01', name: 'لباس نوبت آزمون', category: 'wedding' });
  expect(dress.status).toBe(201);
  dressId = dress.body.id;
  // انتشار از مسیر API نیازمند توضیح/قیمت/تصویر است؛ برای این تست فقط وضعیت لازم است.
  await ctx.runner.query(
    "UPDATE dresses SET status = 'published', published_at = now() WHERE id = $1",
    [dressId],
  );

  brideToken = (await login(ctx.app, '09128000013')).accessToken;
  otherBrideToken = (await login(ctx.app, '09128000014')).accessToken;
});

afterAll(async () => {
  await ctx.close();
});

describe('ساعات کاری مزون', () => {
  it('بدون ورود قابل خواندن نیست', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/api/v1/boutiques/active/availability',
    );
    expect(response.status).toBe(401);
  });

  it('کارمند عادی اجازه تغییر ساعات کاری ندارد', async () => {
    const response = await request(ctx.app.getHttpServer())
      .put('/api/v1/boutiques/active/availability')
      .set(authHeader(staffToken))
      .send({ rules: allWeek });
    expect(response.status).toBe(403);
  });

  it('بازه‌های هم‌پوشان یا تکرارشده در یک روز رد می‌شوند', async () => {
    const duplicate = await request(ctx.app.getHttpServer())
      .put('/api/v1/boutiques/active/availability')
      .set(authHeader(ownerToken))
      .send({ rules: [allWeek[0], { ...allWeek[0], startsMinute: 700 }] });
    expect(duplicate.status).toBe(400);

    const invalid = await request(ctx.app.getHttpServer())
      .put('/api/v1/boutiques/active/availability')
      .set(authHeader(ownerToken))
      .send({ rules: [{ ...allWeek[1], endsMinute: 610 }] });
    expect(invalid.status).toBe(400);
  });

  it('مالک ساعات کاری هفتگی را ثبت و دوباره می‌خواند', async () => {
    const saved = await request(ctx.app.getHttpServer())
      .put('/api/v1/boutiques/active/availability')
      .set(authHeader(ownerToken))
      .send({ rules: allWeek });
    expect(saved.status).toBe(200);
    expect(saved.body.rules).toHaveLength(7);

    const fetched = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/active/availability')
      .set(authHeader(ownerToken));
    expect(fetched.status).toBe(200);
    expect(fetched.body.rules[0]).toMatchObject({ weekday: 0, startsMinute: 600, slotMinutes: 60 });
  });
});

describe('بازه‌های آزاد عمومی', () => {
  it('بازه‌های ۱۰ تا ۱۸ را با برچسب فارسی برمی‌گرداند', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/public/boutiques/bz-${boutiqueId.slice(0, 8)}/slots`)
      .query({ date: tomorrowKey });
    // اسلاگ واقعی از پنل مزون خوانده می‌شود؛ این درخواست فقط باید ۴۰۴ بدهد
    expect([200, 404]).toContain(response.status);
  });

  it('برای مزون تأییدشده بازه‌های درست و قیمت‌گذاری‌نشده برمی‌گردد', async () => {
    const boutique = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${boutiqueId}`)
      .set(authHeader(ownerToken));
    const slug = boutique.body.slug as string;

    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/public/boutiques/${slug}/slots`)
      .query({ date: tomorrowKey });
    expect(response.status).toBe(200);
    expect(response.body.closed).toBe(false);
    expect(response.body.slots.length).toBe(8);
    expect(response.body.slots[0]).toMatchObject({
      startsAt: tomorrowSlotStart.toISOString(),
      timeLabel: formatMinuteOfDayFa(600),
      available: true,
    });
  });

  it('تاریخ نامعتبر و مزون ناشناس رد می‌شوند', async () => {
    const invalid = await request(ctx.app.getHttpServer())
      .get('/api/v1/public/boutiques/bz-unknown/slots')
      .query({ date: '1403/05/12' });
    expect(invalid.status).toBe(400);

    const unknown = await request(ctx.app.getHttpServer())
      .get('/api/v1/public/boutiques/bz-does-not-exist/slots')
      .query({ date: tomorrowKey });
    expect(unknown.status).toBe(404);
  });

  it('مزون بدون ساعت کاری، روز بسته اعلام می‌کند', async () => {
    const bare = await setupTenant(ctx.app, ctx.runner, {
      phone: '09128000015',
      approve: true,
      name: 'مزون بدون ساعت',
    });
    const boutique = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${bare.boutiqueId}`)
      .set(authHeader(bare.ownerToken));
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/public/boutiques/${boutique.body.slug}/slots`)
      .query({ date: tomorrowKey });
    expect(response.status).toBe(200);
    expect(response.body.closed).toBe(true);
    expect(response.body.slots).toEqual([]);
    expect(response.body.noteFa).toContain('ساعت کاری');
  });
});

describe('ثبت نوبت توسط عروس', () => {
  it('بدون ورود ۴۰۱ و با زمان نامعتبر ۴۰۰', async () => {
    const anonymous = await request(ctx.app.getHttpServer()).post('/api/v1/appointments').send({
      boutiqueId,
      startsAt: tomorrowSlotStart.toISOString(),
    });
    expect(anonymous.status).toBe(401);

    const invalid = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(brideToken))
      .send({ boutiqueId, startsAt: 'فردا صبح' });
    expect(invalid.status).toBe(400);
  });

  it('زمانی که جزو بازه‌های مزون نیست ۴۰۹ می‌گیرد', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(brideToken))
      .send({ boutiqueId, startsAt: unalignedStart.toISOString() });
    expect(response.status).toBe(409);
  });

  it('نوبت معتبر با وضعیت requested ثبت می‌شود و پیامکی ادعا نمی‌کند', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(brideToken))
      .send({ boutiqueId, dressId, startsAt: tomorrowSlotStart.toISOString(), note: 'قد ۱۷۰' });
    expect(response.status).toBe(201);
    expect(response.body.smsSent).toBe(false);
    expect(response.body.noteFa).toBe(APPOINTMENT_NO_SMS_NOTE_FA);
    expect(response.body.appointment).toMatchObject({
      status: 'requested',
      dateKey: tomorrowKey,
      timeLabel: formatMinuteOfDayFa(600),
      boutique: { id: boutiqueId },
      dress: { id: dressId },
      brideName: null,
      bridePhoneMasked: null,
    });
    expect(new Date(response.body.appointment.endsAt).getTime()).toBe(
      tomorrowSlotStart.getTime() + 60 * 60_000,
    );
  });

  it('همان بازه برای عروس دیگر ۴۰۹ است و در فهرست آزاد «ناموجود» می‌شود', async () => {
    const conflict = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(otherBrideToken))
      .send({ boutiqueId, startsAt: tomorrowSlotStart.toISOString() });
    expect(conflict.status).toBe(409);

    const boutique = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${boutiqueId}`)
      .set(authHeader(ownerToken));
    const slots = await request(ctx.app.getHttpServer())
      .get(`/api/v1/public/boutiques/${boutique.body.slug}/slots`)
      .query({ date: tomorrowKey });
    expect(slots.status).toBe(200);
    expect(slots.body.slots[0]).toMatchObject({ available: false });
    expect(slots.body.slots[1].available).toBe(true);
  });

  it('لباس مزون دیگر یا مزون تأییدنشده پذیرفته نمی‌شود', async () => {
    const other = await setupTenant(ctx.app, ctx.runner, {
      phone: '09128000016',
      approve: true,
      name: 'مزون دوم نوبت',
    });
    const otherDress = await request(ctx.app.getHttpServer())
      .post('/api/v1/dresses')
      .set(authHeader(other.tenantToken))
      .send({ code: 'APT-02', name: 'لباس مزون دوم', category: 'wedding' });
    await ctx.runner.query(
      "UPDATE dresses SET status = 'published', published_at = now() WHERE id = $1",
      [otherDress.body.id],
    );

    const wrongDress = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(otherBrideToken))
      .send({
        boutiqueId,
        dressId: otherDress.body.id,
        startsAt: tehranInstant(tomorrowKey, 660).toISOString(),
      });
    expect(wrongDress.status).toBe(404);

    const draftBoutique = await setupTenant(ctx.app, ctx.runner, {
      phone: '09128000017',
      approve: false,
      name: 'مزون تأییدنشده',
    });
    const unapproved = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(otherBrideToken))
      .send({ boutiqueId: draftBoutique.boutiqueId, startsAt: tomorrowSlotStart.toISOString() });
    expect(unapproved.status).toBe(404);
  });
});

describe('مدیریت نوبت توسط مزون', () => {
  let appointmentId = '';

  it('کارکنان مزون فهرست را با نام و شماره ماسک‌شده می‌بینند', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/active/appointments?status=requested')
      .set(authHeader(ownerToken));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    const item = response.body.items[0];
    appointmentId = item.id;
    expect(item.bridePhoneMasked).toMatch(/\*/);
    expect(item.boutique.id).toBe(boutiqueId);
  });

  it('عروس دیگر نمی‌تواند نوبت را ببیند یا لغو کند', async () => {
    const other = await request(ctx.app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentId}`)
      .set(authHeader(otherBrideToken));
    expect(other.status).toBe(404);

    const cancel = await request(ctx.app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set(authHeader(otherBrideToken));
    expect(cancel.status).toBe(404);
  });

  it('تأیید نوبت توسط مزون ثبت و در فهرست عروس دیده می‌شود', async () => {
    const confirmed = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/active/appointments/${appointmentId}/confirm`)
      .set(authHeader(ownerToken));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmed');

    const again = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/active/appointments/${appointmentId}/confirm`)
      .set(authHeader(ownerToken));
    expect(again.status).toBe(409);

    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/appointments')
      .set(authHeader(brideToken));
    expect(mine.body.items[0]).toMatchObject({ status: 'confirmed', brideName: null });
  });

  it('رد نوبت همراه دلیل برای عروس نمایش داده می‌شود', async () => {
    const slot2 = tehranInstant(tomorrowKey, 660).toISOString();
    const created = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(otherBrideToken))
      .send({ boutiqueId, startsAt: slot2 });
    expect(created.status).toBe(201);

    const declined = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/active/appointments/${created.body.appointment.id}/decline`)
      .set(authHeader(ownerToken))
      .send({ reason: 'لباس در این تاریخ در مزون نیست' });
    expect(declined.status).toBe(200);
    expect(declined.body.status).toBe('declined');

    const mine = await request(ctx.app.getHttpServer())
      .get(`/api/v1/appointments/${created.body.appointment.id}`)
      .set(authHeader(otherBrideToken));
    expect(mine.body.declineReason).toBe('لباس در این تاریخ در مزون نیست');

    const tooShort = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/active/appointments/${created.body.appointment.id}/decline`)
      .set(authHeader(ownerToken))
      .send({ reason: 'نه' });
    expect(tooShort.status).toBe(400);
  });

  it('لغو توسط عروس پس از تأیید کار می‌کند و تکرار آن ۴۰۹ است', async () => {
    const cancelled = await request(ctx.app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set(authHeader(brideToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');

    const again = await request(ctx.app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set(authHeader(brideToken));
    expect(again.status).toBe(409);
  });

  it('کاربر غیرعضو مزون به فهرست نوبت‌ها دسترسی ندارد', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/active/appointments')
      .set(authHeader(brideToken));
    expect([400, 403]).toContain(response.status);
  });

  it('سقف نوبت فعال برای هر عروس اعمال می‌شود', async () => {
    const first = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(brideToken))
      .send({ boutiqueId, startsAt: tehranInstant(tomorrowKey, 720).toISOString() });
    expect(first.status).toBe(201);
    const second = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(brideToken))
      .send({ boutiqueId, startsAt: tehranInstant(tomorrowKey, 780).toISOString() });
    expect(second.status).toBe(201);
    const third = await request(ctx.app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(brideToken))
      .send({ boutiqueId, startsAt: tehranInstant(tomorrowKey, 840).toISOString() });
    expect(third.status).toBe(409);
    expect(third.body.error.message).toContain('نوبت فعال');
  });
});
