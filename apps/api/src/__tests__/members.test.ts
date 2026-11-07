import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authHeader, createTestApp, login, setupTenant, type TenantContext, type TestContext } from './helpers/test-app.js';

let ctx: TestContext;
let owner: TenantContext;

beforeAll(async () => {
  ctx = await createTestApp();
  owner = await setupTenant(ctx.app, ctx.runner, { phone: '09123000001', name: 'مزون کارکنان' });
});

afterAll(async () => {
  await ctx.close();
});

function membersUrl(suffix = ''): string {
  return `/api/v1/boutiques/active/members${suffix}`;
}

describe('مدیریت کارکنان مزون', () => {
  it('مالک می‌تواند کارمند را با شماره موبایل دعوت کند و پیامک ارسال‌نشده را صریح اعلام می‌کند', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post(membersUrl('/invite'))
      .set(authHeader(owner.tenantToken))
      .send({ phone: '09123000002', role: 'boutique_staff' });

    expect(response.status).toBe(200);
    expect(response.body.member.role).toBe('boutique_staff');
    expect(response.body.member.phoneMasked).toContain('***');
    expect(response.body.smsSent).toBe(false);
    expect(response.body.noteFa).toContain('پیامک');
  });

  it('شماره کامل کارمند در پاسخ عضویت لو نمی‌رود', async () => {
    const list = await request(ctx.app.getHttpServer())
      .get(membersUrl())
      .set(authHeader(owner.tenantToken));
    expect(list.status).toBe(200);
    const phones = JSON.stringify(list.body.items);
    expect(phones).not.toContain('09123000002');
  });

  it('دعوت تکراری ۴۰۹ و دعوت مالک ۴۰۹ است', async () => {
    const duplicate = await request(ctx.app.getHttpServer())
      .post(membersUrl('/invite'))
      .set(authHeader(owner.tenantToken))
      .send({ phone: '09123000002', role: 'boutique_staff' });
    expect(duplicate.status).toBe(409);

    const ownerPhone = '09123000001';
    const selfInvite = await request(ctx.app.getHttpServer())
      .post(membersUrl('/invite'))
      .set(authHeader(owner.tenantToken))
      .send({ phone: ownerPhone, role: 'branch_manager' });
    expect(selfInvite.status).toBe(409);
  });

  it('کاربر دعوت‌شده پس از ورود، عضویت خود را می‌بیند و به داده مزون دسترسی دارد', async () => {
    const staffSession = await login(ctx.app, '09123000002');
    expect(staffSession.status).toBe(200);
    const selected = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(staffSession.accessToken))
      .send({ boutiqueId: owner.boutiqueId });

    expect(selected.status).toBe(200);
    expect(selected.body.activeBoutiqueId).toBe(owner.boutiqueId);

    const dresses = await request(ctx.app.getHttpServer())
      .get('/api/v1/dresses')
      .set(authHeader(selected.body.accessToken));
    expect(dresses.status).toBe(200);
  });

  it('کارمند نمی‌تواند کارمند دعوت کند یا نقش عوض کند (۴۰۳)', async () => {
    const staffSession = await login(ctx.app, '09123000002');
    const selected = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(staffSession.accessToken))
      .send({ boutiqueId: owner.boutiqueId });

    const invite = await request(ctx.app.getHttpServer())
      .post(membersUrl('/invite'))
      .set(authHeader(selected.body.accessToken))
      .send({ phone: '09123000003', role: 'boutique_staff' });
    expect(invite.status).toBe(403);
    expect(invite.body.error.code).toBe('FORBIDDEN');

    const roleChange = await request(ctx.app.getHttpServer())
      .patch(membersUrl(`/${owner.userId}`))
      .set(authHeader(selected.body.accessToken))
      .send({ role: 'boutique_staff' });
    expect(roleChange.status).toBe(403);
  });

  it('مالک نقش کارمند را تغییر می‌دهد و در audit ثبت می‌شود', async () => {
    const list = await request(ctx.app.getHttpServer())
      .get(membersUrl())
      .set(authHeader(owner.tenantToken));
    const staff = list.body.items.find((item: { role: string }) => item.role === 'boutique_staff');
    expect(staff).toBeTruthy();

    const updated = await request(ctx.app.getHttpServer())
      .patch(membersUrl(`/${staff.userId}`))
      .set(authHeader(owner.tenantToken))
      .send({ role: 'branch_manager' });
    expect(updated.status).toBe(200);
    expect(updated.body.role).toBe('branch_manager');

    const audit = await ctx.runner.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE tenant_id = $1 AND action = 'membership.role_changed'",
      [owner.boutiqueId],
    );
    expect(audit.length).toBe(1);
  });

  it('لغو دسترسی، توکن مزون‌دار کارمند را بی‌اثر می‌کند', async () => {
    const staffSession = await login(ctx.app, '09123000002');
    const selected = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set(authHeader(staffSession.accessToken))
      .send({ boutiqueId: owner.boutiqueId });
    const staffTenantToken = selected.body.accessToken;

    const list = await request(ctx.app.getHttpServer())
      .get(membersUrl())
      .set(authHeader(owner.tenantToken));
    const staff = list.body.items.find((item: { userId: string }) => item.userId !== owner.userId);

    const revoked = await request(ctx.app.getHttpServer())
      .delete(membersUrl(`/${staff.userId}`))
      .set(authHeader(owner.tenantToken));
    expect(revoked.status).toBe(200);

    const afterRevoke = await request(ctx.app.getHttpServer())
      .get('/api/v1/dresses')
      .set(authHeader(staffTenantToken));
    expect(afterRevoke.status).toBe(403);
  });

  it('مالک نمی‌تواند دسترسی خودش یا مالک را لغو کند', async () => {
    const self = await request(ctx.app.getHttpServer())
      .delete(membersUrl(`/${owner.userId}`))
      .set(authHeader(owner.tenantToken));
    expect(self.status).toBe(409);
  });

  it('مدیریت اعضا همیشه به مزون فعال محدود است (دو مزون مستقل)', async () => {
    const other = await setupTenant(ctx.app, ctx.runner, {
      phone: '09123000010',
      name: 'مزون دیگر',
      citySlug: 'shiraz',
    });
    await request(ctx.app.getHttpServer())
      .post(membersUrl('/invite'))
      .set(authHeader(other.tenantToken))
      .send({ phone: '09123000011', role: 'boutique_staff' });

    const otherList = await request(ctx.app.getHttpServer())
      .get(membersUrl())
      .set(authHeader(other.tenantToken));
    const ownerList = await request(ctx.app.getHttpServer())
      .get(membersUrl())
      .set(authHeader(owner.tenantToken));

    const otherPhones = otherList.body.items.map((item: { userId: string }) => item.userId);
    const ownerPhones = ownerList.body.items.map((item: { userId: string }) => item.userId);

    expect(otherPhones.some((id: string) => ownerPhones.includes(id))).toBe(false);
    expect(otherPhones.length).toBe(2);
    expect(ownerPhones.length).toBe(2);
  });
});
