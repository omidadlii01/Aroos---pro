import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authHeader, type LoginResult, login, createTestApp, type TestContext } from './helpers/test-app.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('مسیر ورود با کد یکبارمصرف', () => {
  it('کد را درخواست می‌کند و در حالت توسعه برمی‌گرداند و پیامک واقعی ارسال نمی‌شود', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '۰۹۱۲۳۴۵۶۷۸۹' });

    expect(response.status).toBe(200);
    expect(response.body.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.delivery).toBe('dev-log');
    expect(response.body.devCode).toMatch(/^\d{5}$/);
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('شماره نامعتبر را با پیام فارسی و کد خطای یکدست رد می‌کند', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '12345' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBeTruthy();
    expect(response.body.error.requestId).toBeTruthy();
    expect(response.body.error.details?.[0]?.message).toContain('معتبر');
  });

  it('ارسال مجدد پیش از پایان cooldown را ۴۲۹ می‌کند', async () => {
    const phone = '09121110001';
    const first = await request(ctx.app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone });
    expect(first.status).toBe(200);

    const second = await request(ctx.app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('کد اشتباه را رد می‌کند و شمارنده تلاش را افزایش می‌دهد', async () => {
    const phone = '09121110002';
    const challenge = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone });
    const wrongCode = challenge.body.devCode === '00000' ? '11111' : '00000';

    const verify = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code: wrongCode });

    expect(verify.status).toBe(401);
    expect(verify.body.error.code).toBe('OTP_INVALID');

    const rows = await ctx.runner.query<{ attempts: number }>(
      'SELECT attempts FROM otp_challenges WHERE id = $1',
      [challenge.body.challengeId],
    );
    expect(rows[0]?.attempts).toBe(1);
  });

  it('پس از رسیدن به سقف تلاش، کد معتبر هم پذیرفته نمی‌شود', async () => {
    const phone = '09121110003';
    const challenge = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone });
    const wrongCode = challenge.body.devCode === '00000' ? '11111' : '00000';

    for (let attempt = 0; attempt < ctx.config.auth.otpMaxAttempts; attempt += 1) {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.body.challengeId, code: wrongCode });
    }

    const finalAttempt = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code: challenge.body.devCode });

    expect(finalAttempt.status).toBe(429);
    expect(finalAttempt.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('کد مصرف‌شده دوباره پذیرفته نمی‌شود', async () => {
    const phone = '09121110004';
    const challenge = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone });

    const first = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code: challenge.body.devCode });
    expect(first.status).toBe(200);

    const second = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code: challenge.body.devCode });
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('OTP_INVALID');
  });

  it('کد منقضی‌شده را با کد خطای مشخص رد می‌کند', async () => {
    const phone = '09121110005';
    const challenge = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone });

    await ctx.runner.query(
      "UPDATE otp_challenges SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [challenge.body.challengeId],
    );

    const verify = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code: challenge.body.devCode });

    expect(verify.status).toBe(401);
    expect(verify.body.error.code).toBe('OTP_EXPIRED');
  });

  it('کد را به‌صورت هش ذخیره می‌کند، نه خام', async () => {
    const phone = '09121110006';
    const challenge = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone });

    const rows = await ctx.runner.query<{ code_hash: string }>(
      'SELECT code_hash FROM otp_challenges WHERE id = $1',
      [challenge.body.challengeId],
    );
    expect(rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.code_hash).not.toContain(challenge.body.devCode);
  });

  it('پس از ورود، /me اطلاعات نشست و نقش پیش‌فرض عروس را برمی‌گرداند', async () => {
    const session: LoginResult = await login(ctx.app, '09121110007');
    expect(session.status).toBe(200);
    expect(session.accessToken).not.toBe('');

    const me = await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(session.accessToken));

    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe('09121110007');
    expect(me.body.user.roles).toEqual(['bride']);
    expect(me.body.user.memberships).toEqual([]);
    expect(me.body.activeBoutiqueId).toBeNull();
  });

  it('دسترسی بدون توکن ۴۰۱ با قالب خطای یکدست است', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('توکن دستکاری‌شده پذیرفته نمی‌شود', async () => {
    const session = await login(ctx.app, '09121110008');
    const tampered = `${session.accessToken.slice(0, -3)}abc`;
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(tampered));
    expect(response.status).toBe(401);
  });
});
