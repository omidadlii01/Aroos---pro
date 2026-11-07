'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  BOUTIQUE_STATUS_LABELS_FA,
  ROLE_LABELS_FA,
  formatJalaliDateTime,
  formatMobileFa,
  type MembershipSummary,
  type Role,
} from '@bridalos/contracts';
import { Alert, Badge, Button, Field } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { CITY_OPTIONS, cityLabel } from '@/lib/cities';
import { clearToken, getToken, setToken } from '@/lib/session';

type Me = {
  user: {
    id: string;
    phone: string;
    displayName: string | null;
    roles: Role[];
    memberships: MembershipSummary[];
  };
  activeBoutiqueId: string | null;
};

type Boutique = {
  id: string;
  slug: string;
  name: string;
  citySlug: string;
  description: string | null;
  status: keyof typeof BOUTIQUE_STATUS_LABELS_FA;
  reviewReason: string | null;
  createdAt: string;
  myRole: Role | null;
};

const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  draft: 'neutral',
  pending_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [boutiques, setBoutiques] = useState<Boutique[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isCreating, setCreating] = useState(false);
  const [isSelecting, setSelecting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [citySlug, setCitySlug] = useState<string>('tehran');
  const [nameError, setNameError] = useState<string | null>(null);

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
        clearToken();
        router.replace('/login');
        return;
      }
      setLoading(false);
      setLoadError(meResult.message);
      return;
    }
    setMe(meResult.data);

    const boutiqueResult = await apiFetch<{ items: Boutique[] }>('/api/v1/boutiques/mine');
    setLoading(false);
    if (!boutiqueResult.ok) {
      setLoadError(boutiqueResult.message);
      return;
    }
    setBoutiques(boutiqueResult.data.items);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectTenant(boutiqueId: string, successMessage?: string) {
    setSelecting(boutiqueId);
    setActionError(null);
    const result = await apiFetch<{ accessToken: string; activeBoutiqueId: string | null }>(
      '/api/v1/auth/tenant',
      { method: 'POST', body: JSON.stringify({ boutiqueId }) },
    );
    setSelecting(null);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setToken(result.data.accessToken);
    setNotice(successMessage ?? 'مزون فعال تغییر کرد.');
    await load();
  }

  async function createBoutique(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setActionError(null);

    if (name.trim().length < 2) {
      setNameError('نام مزون باید حداقل ۲ نویسه باشد');
      return;
    }

    setCreating(true);
    const result = await apiFetch<Boutique>('/api/v1/boutiques', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), citySlug }),
    });
    setCreating(false);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setName('');
    setNotice('مزون با وضعیت پیش‌نویس ساخته شد. اکنون آن را برای بررسی ارسال کنید.');
    await selectTenant(result.data.id, 'مزون ساخته شد و به‌عنوان مزون فعال انتخاب شد.');
  }

  async function submitForReview(boutiqueId: string) {
    setActionError(null);
    const result = await apiFetch<Boutique>(`/api/v1/boutiques/${boutiqueId}/submit-review`, {
      method: 'POST',
    });
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('مزون برای بررسی پلتفرم ارسال شد.');
    await load();
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const activeBoutique = boutiques?.find((item) => item.id === me?.activeBoutiqueId) ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">پنل من</h1>
          <div className="flex items-center gap-3">
            {me?.user.roles.includes('platform_admin') ? (
              <Link href="/admin" className="text-sm text-brand-700 underline">
                پنل مدیر پلتفرم
              </Link>
            ) : null}
            <Button variant="ghost" size="sm" onClick={logout}>
              خروج
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-20 animate-pulse rounded-xl bg-sand-100" />
            <div className="h-32 animate-pulse rounded-xl bg-sand-100" />
            <p className="text-xs text-slate-500">در حال بارگذاری اطلاعات…</p>
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-4">
            <Alert tone="error" title="بارگذاری اطلاعات انجام نشد">
              {loadError}
            </Alert>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                تلاش دوباره
              </Button>
            </div>
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

        {me ? (
          <section className="mt-6 rounded-2xl border border-sand-200 bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-slate-900">حساب کاربری</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-slate-500">شما</dt>
                <dd className="font-medium text-slate-900">
                  {me.user.displayName ?? formatMobileFa(me.user.phone)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-slate-500">نقش‌ها</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {me.user.roles.map((role) => (
                    <Badge key={role} tone="brand">
                      {ROLE_LABELS_FA[role]}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              مزون فعال: {activeBoutique ? activeBoutique.name : 'هیچ مزونی انتخاب نشده'}
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-sand-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-bold text-slate-900">مزون‌های من</h2>

          {isLoading ? null : boutiques && boutiques.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-sand-200 bg-sand-50 p-4 text-sm text-slate-600">
              هنوز مزونی ثبت نکرده‌اید. با فرم پایین می‌توانید اولین مزون را بسازید؛ وضعیت اولیه
              «پیش‌نویس» است و پس از بررسی پلتفرم تأیید می‌شود.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-sand-100">
              {boutiques?.map((boutique) => (
                <li key={boutique.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{boutique.name}</span>
                      <Badge tone={statusTone[boutique.status] ?? 'neutral'}>
                        {BOUTIQUE_STATUS_LABELS_FA[boutique.status]}
                      </Badge>
                      {me?.activeBoutiqueId === boutique.id ? <Badge tone="brand">فعال</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {cityLabel(boutique.citySlug)} · ثبت: {formatJalaliDateTime(boutique.createdAt)}
                    </p>
                    {boutique.reviewReason ? (
                      <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
                        دلیل رد: {boutique.reviewReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={isSelecting === boutique.id}
                      onClick={() => void selectTenant(boutique.id)}
                    >
                      انتخاب به‌عنوان مزون فعال
                    </Button>
                    {boutique.status === 'draft' || boutique.status === 'rejected' ? (
                      <Button size="sm" onClick={() => void submitForReview(boutique.id)}>
                        {boutique.status === 'rejected' ? 'ارسال دوباره برای بررسی' : 'ارسال برای بررسی'}
                      </Button>
                    ) : null}
                    <Link
                      href="/dashboard/dresses"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      لباس‌ها
                    </Link>
                    <Link
                      href="/dashboard/appointments"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      نوبت‌ها
                    </Link>
                    <Link
                      href="/dashboard/team"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      کارکنان
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={createBoutique} className="mt-5 flex flex-col gap-3 border-t border-sand-100 pt-5" noValidate>
            <h3 className="text-sm font-bold text-slate-900">ثبت مزون جدید</h3>
            <Field
              label="نام مزون"
              name="boutiqueName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: مزون نیلوفر"
              hint="این نام در پنل و صفحه عمومی مزون نمایش داده می‌شود."
              error={nameError}
              maxLength={80}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="city" className="text-sm font-medium text-slate-700">
                شهر
              </label>
              <select
                id="city"
                name="city"
                value={citySlug}
                onChange={(event) => setCitySlug(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                {CITY_OPTIONS.map((city) => (
                  <option key={city.slug} value={city.slug}>
                    {city.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit" isLoading={isCreating}>
                ساخت مزون
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
