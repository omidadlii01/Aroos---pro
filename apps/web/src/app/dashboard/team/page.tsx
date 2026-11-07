'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ROLE_LABELS_FA, formatJalaliDate, type BoutiqueMemberView } from '@bridalos/contracts';
import { Alert, Badge, Button, Field } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

type Me = {
  activeBoutiqueId: string | null;
  user: { id: string; memberships: Array<{ boutiqueId: string; boutiqueName: string; role: string }> };
};

type Member = BoutiqueMemberView & { revokedAt?: string | null };

const assignableRoles = ['branch_manager', 'boutique_staff'] as const;

export default function TeamPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<(typeof assignableRoles)[number]>('boutique_staff');
  const [isInviting, setInviting] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    setLoadError(null);

    const meResult = await apiFetch<Me>('/api/v1/auth/me');
    if (!meResult.ok) {
      if (meResult.status === 401) {
        router.replace('/login');
        return;
      }
      setLoadError(meResult.message);
      setLoading(false);
      return;
    }
    setMe(meResult.data);

    if (!meResult.data.activeBoutiqueId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const result = await apiFetch<{ items: Member[] }>('/api/v1/boutiques/active/members');
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setMembers(result.data.items);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeMembership = me?.user.memberships.find(
    (membership) => membership.boutiqueId === me?.activeBoutiqueId,
  );
  const isOwner = activeMembership?.role === 'boutique_owner';

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);
    setNotice(null);
    setInviting(true);

    const result = await apiFetch<{ smsSent: boolean; noteFa: string }>(
      '/api/v1/boutiques/active/members/invite',
      { method: 'POST', body: JSON.stringify({ phone: phone.trim(), role }) },
    );
    setInviting(false);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setPhone('');
    setNotice(
      result.data.smsSent
        ? 'دعوت ارسال شد.'
        : `عضویت ثبت شد. ${result.data.noteFa}`,
    );
    await load();
  }

  async function changeRole(userId: string, nextRole: string) {
    setBusyUser(userId);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<Member>(`/api/v1/boutiques/active/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: nextRole }),
    });
    setBusyUser(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('نقش کاربر به‌روزرسانی شد و در گزارش فعالیت ثبت گردید.');
    await load();
  }

  async function revoke(userId: string) {
    setBusyUser(userId);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<{ revoked: boolean }>(
      `/api/v1/boutiques/active/members/${userId}`,
      { method: 'DELETE' },
    );
    setBusyUser(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('دسترسی کاربر لغو شد؛ توکن‌های مزون‌دار او دیگر پذیرفته نمی‌شوند.');
    await load();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">کارکنان مزون</h1>
          <Link href="/dashboard" className="text-sm text-brand-700 underline">
            بازگشت به پنل
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-6" aria-busy="true">
            <div className="h-20 animate-pulse rounded-xl bg-sand-100" />
            <p className="mt-2 text-xs text-slate-500">در حال بارگذاری…</p>
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-4">
            <Alert tone="error" title="بارگذاری انجام نشد">
              {loadError}
            </Alert>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4">
            <Alert tone="success">{notice}</Alert>
          </div>
        ) : null}
        {actionError ? (
          <div className="mt-4">
            <Alert tone="error">{actionError}</Alert>
          </div>
        ) : null}

        {!isLoading && me && !me.activeBoutiqueId ? (
          <div className="mt-6">
            <Alert tone="warning" title="مزون فعالی انتخاب نشده است">
              ابتدا در{' '}
              <Link href="/dashboard" className="underline">
                پنل
              </Link>{' '}
              مزون فعال را انتخاب کنید.
            </Alert>
          </div>
        ) : null}

        {members && members.length > 0 ? (
          <ul className="mt-6 divide-y divide-sand-100 rounded-2xl border border-sand-200 bg-white">
            {members.map((member) => (
              <li key={member.userId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{member.displayName}</span>
                    <Badge tone={member.role === 'boutique_owner' ? 'brand' : 'neutral'}>
                      {ROLE_LABELS_FA[member.role]}
                    </Badge>
                    {member.revokedAt ? <Badge tone="danger">لغو‌شده</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500" dir="ltr">
                    {member.phoneMasked}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    دعوت: {formatJalaliDate(member.invitedAt)}
                  </p>
                </div>

                {isOwner && member.role !== 'boutique_owner' && !member.revokedAt ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`تغییر نقش ${member.displayName}`}
                      value={member.role}
                      disabled={busyUser === member.userId}
                      onChange={(event) => void changeRole(member.userId, event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    >
                      {assignableRoles.map((option) => (
                        <option key={option} value={option}>
                          {ROLE_LABELS_FA[option]}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={busyUser === member.userId}
                      onClick={() => void revoke(member.userId)}
                    >
                      لغو دسترسی
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {me?.activeBoutiqueId && isOwner ? (
          <form onSubmit={invite} className="mt-6 rounded-2xl border border-sand-200 bg-white p-5" noValidate>
            <h2 className="text-sm font-bold text-slate-900">افزودن کارمند</h2>
            <p className="mt-1 text-xs text-slate-500">
              کاربر باید با همین شماره موبایل در BridalOS ثبت‌نام کند. ارسال پیامک دعوت در نسخه فعلی
              پیکربندی نشده است و این موضوع به کاربر اطلاع داده می‌شود.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="شماره موبایل"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="09121234567"
                dir="ltr"
                required
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="memberRole" className="text-sm font-medium text-slate-700">
                  نقش
                </label>
                <select
                  id="memberRole"
                  value={role}
                  onChange={(event) => setRole(event.target.value as (typeof assignableRoles)[number])}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base"
                >
                  {assignableRoles.map((option) => (
                    <option key={option} value={option}>
                      {ROLE_LABELS_FA[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <Button type="submit" isLoading={isInviting}>
                ثبت دعوت
              </Button>
            </div>
          </form>
        ) : null}

        {me?.activeBoutiqueId && !isOwner && !isLoading ? (
          <p className="mt-6 text-xs text-slate-500">
            مدیریت کارکنان فقط توسط مالک مزون انجام می‌شود.
          </p>
        ) : null}
      </main>
    </div>
  );
}
