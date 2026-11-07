import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authHeader, createTestApp, login, type TestContext } from './helpers/test-app.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

async function createBoutique(token: string, overrides: Record<string, unknown> = {}) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/boutiques')
    .set(authHeader(token))
    .send({ name: 'مزون آرام', citySlug: 'tehran', ...overrides });
}

describe('چندمستاجری و کنترل دسترسی مزون', () => {
  it('کاربر عادی می‌تواند مزون بسازد و مالک آن شود', async () => {
    const session = await login(ctx.app, '09122000001');
    const response = await createBoutique(session.accessToken);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('draft');
    expect(response.body.myRole).toBe('boutique_owner');
    expect(response.body.slug).toMatch(/^bz-[0-9a-f]{10}$/);

    const memberships = await ctx.runner.query<{ role: string }>(
      'SELECT role FROM memberships WHERE user_id = $1 AND boutique_id = $2',
      [session.userId, response.body.id],
    );
    expect(memberships[0]?.role).toBe('boutique_owner');
  });

  it('ایجاد مزون رخداد audit ثبت می‌کند', async () => {
    const session = await login(ctx.app, '09122000002');
    const boutique = await createBoutique(session.accessToken, { name: 'مزون نیلوفر' });

    const logs = await ctx.runner.query<{ action: string; actor_user_id: string; request_id: string }>(
      'SELECT action, actor_user_id, request_id FROM audit_logs WHERE tenant_id = $1',
      [boutique.body.id],
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe('boutique.created');
    expect(logs[0]?.actor_user_id).toBe(session.userId);
    expect(logs[0]?.request_id).toBeTruthy();
  });

  it('«مزون‌های من» فقط مزون‌های همان کاربر را برمی‌گرداند', async () => {
    const ownerA = await login(ctx.app, '09122000003');
    const ownerB = await login(ctx.app, '09122000004');
    const boutiqueA = await createBoutique(ownerA.accessToken, { name: 'مزون الف' });
    await createBoutique(ownerB.accessToken, { name: 'مزون ب' });

    const listA = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/mine')
      .set(authHeader(ownerA.accessToken));

    expect(listA.status).toBe(200);
    expect(listA.body.items).toHaveLength(1);
    expect(listA.body.items[0].id).toBe(boutiqueA.body.id);
  });

  it('TEST منفی: کاربر مزون A به رکورد مزون B دسترسی ندارد و وجود آن هم لو نمی‌رود', async () => {
    const ownerA = await login(ctx.app, '09122000005');
    const ownerB = await login(ctx.app, '09122000006');
    await createBoutique(ownerA.accessToken, { name: 'مزون خصوصی الف' });
    const boutiqueB = await createBoutique(ownerB.accessToken, { name: 'مزون خصوصی ب' });

    const read = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${boutiqueB.body.id}`)
      .set(authHeader(ownerA.accessToken));
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe('NOT_FOUND');

    const patch = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/boutiques/${boutiqueB.body.id}`)
      .set(authHeader(ownerA.accessToken))
      .send({ name: 'تلاش برای تغییر' });
    expect(patch.status).toBe(404);

    const submit = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/${boutiqueB.body.id}/submit-review`)
      .set(authHeader(ownerA.accessToken));
    expect(submit.status).toBe(404);

    const unchanged = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${boutiqueB.body.id}`)
      .set(authHeader(ownerB.accessToken));
    expect(unchanged.body.name).toBe('مزون خصوصی ب');
  });

  it('TEST منفی: query مستقیم با tenant نادرست هیچ ردیفی برنمی‌گرداند', async () => {
    const ownerA = await login(ctx.app, '09122000007');
    const ownerB = await login(ctx.app, '09122000008');
    await createBoutique(ownerA.accessToken, { name: 'مزون کوئری الف' });
    const boutiqueB = await createBoutique(ownerB.accessToken, { name: 'مزون کوئری ب' });

    // همان کوئری سرویس، اما با شناسه کاربر A و مزون B
    const rows = await ctx.runner.query(
      'SELECT id FROM boutiques WHERE id = $1 AND owner_user_id = $2',
      [boutiqueB.body.id, ownerA.userId],
    );
    expect(rows).toHaveLength(0);
  });

  it('مزون فعال در توکن بررسی می‌شود: کاربر بیمزون ۴۰۰ می‌گیرد', async () => {
    const bride = await login(ctx.app, '09122000009');
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/active')
      .set(authHeader(bride.accessToken));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TENANT_REQUIRED');
  });

  it('انتخاب مزون برای غیرعضو ۴۰۳ است و برای عضو، توکن مزون‌دار صادر می‌شود', async () => {
    const owner = await login(ctx.app, '09122000010');
    const outsider = await login(ctx.app, '09122000011');
    const boutique = await createBoutique(owner.accessToken, { name: 'مزون انتخاب' });

    const denied = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(outsider.accessToken))
      .send({ boutiqueId: boutique.body.id });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const session = await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(owner.accessToken));
    // توکنِ زمان ورود، مزون فعال ندارد؛ عضویت جدید توکن را به‌طور خودکار تغییر نمی‌دهد.
    expect(session.body.activeBoutiqueId).toBeNull();
    expect(session.body.user.roles).toContain('boutique_owner');

    const staleActive = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/active')
      .set(authHeader(owner.accessToken));
    expect(staleActive.status).toBe(400);
    expect(staleActive.body.error.code).toBe('TENANT_REQUIRED');

    // انتخاب صریح مزون: توکن تازه با activeBoutiqueId صادر می‌شود
    const selected = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(owner.accessToken))
      .send({ boutiqueId: boutique.body.id });
    expect(selected.status).toBe(200);
    expect(selected.body.activeBoutiqueId).toBe(boutique.body.id);

    const active = await request(ctx.app.getHttpServer())
      .get('/api/v1/boutiques/active')
      .set(authHeader(selected.body.accessToken));
    expect(active.status).toBe(200);
    expect(active.body.tenant).toEqual({ boutiqueId: boutique.body.id, role: 'boutique_owner' });
  });

  it('چرخه وضعیت: پیش‌نویس → در انتظار بررسی، و ارسال دوباره ۴۰۹ است', async () => {
    const owner = await login(ctx.app, '09122000012');
    const boutique = await createBoutique(owner.accessToken, { name: 'مزون وضعیت' });

    const submitted = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/${boutique.body.id}/submit-review`)
      .set(authHeader(owner.accessToken));
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('pending_review');

    const again = await request(ctx.app.getHttpServer())
      .post(`/api/v1/boutiques/${boutique.body.id}/submit-review`)
      .set(authHeader(owner.accessToken));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  it('نشانی تکراری مزون ۴۰۹ می‌دهد', async () => {
    const owner = await login(ctx.app, '09122000013');
    const first = await createBoutique(owner.accessToken, { name: 'مزون نشانی', slug: 'unique-slug-1' });
    expect(first.status).toBe(201);

    const second = await createBoutique(owner.accessToken, { name: 'مزون نشانی دوم', slug: 'unique-slug-1' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('اعتبارسنجی ورودی مزون با پیام فارسی است', async () => {
    const owner = await login(ctx.app, '09122000014');
    const response = await createBoutique(owner.accessToken, { name: 'ا', citySlug: 'Tehran!' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.length).toBeGreaterThanOrEqual(1);
  });

  it('ویرایش توسط مالک انجام می‌شود و citySlug نامعتبر رد می‌شود', async () => {
    const owner = await login(ctx.app, '09122000015');
    const boutique = await createBoutique(owner.accessToken, { name: 'مزون ویرایش' });

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/boutiques/${boutique.body.id}`)
      .set(authHeader(owner.accessToken))
      .send({ name: 'مزون ویرایش‌شده', description: 'توضیح تازه' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('مزون ویرایش‌شده');

    const empty = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/boutiques/${boutique.body.id}`)
      .set(authHeader(owner.accessToken))
      .send({});
    expect(empty.status).toBe(400);
  });

  it('مزون تأییدشده برای کاربران دیگر قابل خواندن است، اما مزون پیش‌نویس نه', async () => {
    const owner = await login(ctx.app, '09122000016');
    const stranger = await login(ctx.app, '09122000017');
    const boutique = await createBoutique(owner.accessToken, { name: 'مزون انتشار' });

    const beforeApproval = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${boutique.body.id}`)
      .set(authHeader(stranger.accessToken));
    expect(beforeApproval.status).toBe(404);

    await ctx.runner.query("UPDATE boutiques SET status = 'approved' WHERE id = $1", [boutique.body.id]);

    const afterApproval = await request(ctx.app.getHttpServer())
      .get(`/api/v1/boutiques/${boutique.body.id}`)
      .set(authHeader(stranger.accessToken));
    expect(afterApproval.status).toBe(200);
    expect(afterApproval.body.myRole).toBeNull();
  });
});
