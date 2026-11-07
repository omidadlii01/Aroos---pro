'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  BOUTIQUE_STATUS_LABELS_FA,
  formatJalaliDateTime,
  type AdminAuditView,
  type AdminBoutiqueView,
  type AdminOverview,
} from '@bridalos/contracts';
import { Alert, Badge, Button } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { cityLabel } from '@/lib/cities';
import { getToken } from '@/lib/session';

type Me = {
  user: { id: string; displayName: string | null; roles: string[] };
};

const ACTION_LABELS_FA: Record<string, string> = {
  'boutique.created': 'ثبت مزون',
  'boutique.updated': 'ویرایش مزون',
  'boutique.submitted_for_review': 'ارسال مزون برای بررسی',
  'boutique.approved': 'تأیید مزون',
  'boutique.rejected': 'رد مزون',
  'membership.invited': 'دعوت کارمند',
  'membership.role_changed': 'تغییر نقش کارمند',
  'membership.revoked': 'لغو دسترسی کارمند',
  'dress.created': 'ثبت لباس',
  'dress.updated': 'ویرایش لباس',
  'dress.published': 'انتشار لباس',
  'dress.archived': 'بایگانی لباس',
};

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [boutiques, setBoutiques] = useState<AdminBoutiqueView[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditView[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [purgeState, setPurgeState] = useState<{ purged: number; failed: number } | null>(null);
  const [isPurging, setPurging] = useState(false);

  const load = useCallback(
    async (status: string) => {
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

      if (!meResult.data.user.roles.includes('platform_admin')) {
        setLoading(false);
        return;
      }

      const [overviewResult, listResult, auditResult] = await Promise.all([
        apiFetch<AdminOverview>('/api/v1/admin/overview'),
        apiFetch<{ items: AdminBoutiqueView[]; total: number }>(
          `/api/v1/admin/boutiques?status=${encodeURIComponent(status)}`,
        ),
        apiFetch<{ items: AdminAuditView[] }>('/api/v1/admin/audit?limit=20'),
      ]);
      setLoading(false);

      if (!overviewResult.ok) {
        setLoadError(overviewResult.message);
        return;
      }
      setOverview(overviewResult.data);
      setBoutiques(listResult.ok ? listResult.data.items : []);
      setAudit(auditResult.ok ? auditResult.data.items : []);
      if (!listResult.ok) setLoadError(listResult.message);
    },
    [router],
  );

  useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function approve(boutiqueId: string) {
    setBusyId(boutiqueId);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<AdminBoutiqueView>(
      `/api/v1/admin/boutiques/${boutiqueId}/approve`,
      { method: 'POST' },
    );
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('مزون تأیید شد و از این پس می‌تواند لباس منتشر کند.');
    await load(statusFilter);
  }

  async function reject(boutiqueId: string) {
    if (reason.trim().length < 5) {
      setActionError('دلیل رد باید حداقل ۵ نویسه باشد تا مالک مزون بداند چه چیزی را اصلاح کند.');
      return;
    }
    setBusyId(boutiqueId);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<AdminBoutiqueView>(
      `/api/v1/admin/boutiques/${boutiqueId}/reject`,
      { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) },
    );
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setRejectingId(null);
    setReason('');
    setNotice('مزون رد شد و دلیل برای مالک نمایش داده می‌شود.');
    await load(statusFilter);
  }

  async function purgePhotos() {
    setPurging(true);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<{ purged: number; failed: number }>(
      '/api/v1/admin/maintenance/photos-purge',
      { method: 'POST' },
    );
    setPurging(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setPurgeState(result.data);
    setNotice(
      `پاک‌سازی اجرا شد: ${result.data.purged.toLocaleString('fa-IR')} عکس منقضی حذف شد.`,
    );
  }

  const isAdmin = me?.user.roles.includes('platform_admin') ?? false;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">پنل مدیر پلتفرم</h1>
          <Link href="/dashboard" className="text-sm text-brand-700 underline">
            پنل من
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-6" aria-busy="true">
            <div className="h-24 animate-pulse rounded-xl bg-sand-100" />
            <p className="mt-2 text-xs text-slate-500">در حال بارگذاری…</p>
          </div>
        ) : null}

        {!isLoading && me && !isAdmin ? (
          <div className="mt-6">
            <Alert tone="error" title="دسترسی مجاز نیست">
              این بخش فقط برای مدیر پلتفرم در دسترس است. بررسی دسترسی در سرور هم انجام می‌شود و
              درخواست‌های مستقیم API با خطای ۴۰۳ رد می‌شوند.
            </Alert>
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

        {isAdmin && overview ? (
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-sand-200 bg-white p-4">
              <p className="text-xs text-slate-500">در انتظار بررسی</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">
                {overview.boutiques.pending_review.toLocaleString('fa-IR')}
              </p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-4">
              <p className="text-xs text-slate-500">مزون تأییدشده</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {overview.boutiques.approved.toLocaleString('fa-IR')}
              </p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-4">
              <p className="text-xs text-slate-500">لباس منتشرشده</p>
              <p className="mt-1 text-2xl font-bold text-brand-700">
                {overview.publishedDresses.toLocaleString('fa-IR')}
              </p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-4">
              <p className="text-xs text-slate-500">کاربران</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {overview.users.toLocaleString('fa-IR')}
              </p>
            </div>
          </section>
        ) : null}

        {isAdmin ? (
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">مزون‌ها</h2>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                وضعیت
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                >
                  {(['pending_review', 'approved', 'rejected', 'draft', 'suspended'] as const).map(
                    (status) => (
                      <option key={status} value={status}>
                        {BOUTIQUE_STATUS_LABELS_FA[status]}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            {boutiques && boutiques.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-sm text-slate-600">
                موردی با این وضعیت وجود ندارد.
              </div>
            ) : null}

            <ul className="mt-3 space-y-3">
              {boutiques?.map((boutique) => (
                <li key={boutique.id} className="rounded-2xl border border-sand-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{boutique.name}</span>
                    <Badge
                      tone={
                        boutique.status === 'approved'
                          ? 'success'
                          : boutique.status === 'rejected'
                            ? 'danger'
                            : boutique.status === 'pending_review'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {BOUTIQUE_STATUS_LABELS_FA[boutique.status]}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {cityLabel(boutique.citySlug)} · {boutique.ownerName ?? 'بدون نام'}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500" dir="ltr">
                    {boutique.ownerPhoneMasked}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {boutique.dressCount.toLocaleString('fa-IR')} لباس ·{' '}
                    {boutique.publishedDressCount.toLocaleString('fa-IR')} منتشرشده
                    {boutique.submittedAt
                      ? ` · ارسال: ${formatJalaliDateTime(boutique.submittedAt)}`
                      : ''}
                  </p>
                  {boutique.reviewReason ? (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      دلیل رد: {boutique.reviewReason}
                    </p>
                  ) : null}

                  {boutique.status === 'pending_review' ? (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          isLoading={busyId === boutique.id}
                          onClick={() => void approve(boutique.id)}
                        >
                          تأیید مزون
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setRejectingId(rejectingId === boutique.id ? null : boutique.id);
                            setActionError(null);
                          }}
                        >
                          رد با دلیل
                        </Button>
                      </div>

                      {rejectingId === boutique.id ? (
                        <div className="mt-3 rounded-xl border border-slate-200 p-3">
                          <label
                            htmlFor={`reason-${boutique.id}`}
                            className="text-xs font-medium text-slate-700"
                          >
                            دلیل رد (برای مالک نمایش داده می‌شود)
                          </label>
                          <textarea
                            id={`reason-${boutique.id}`}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={2}
                            maxLength={500}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="مثال: تصاویر مجوز انتشار ندارند؛ لطفاً مدارک را تکمیل کنید."
                          />
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              isLoading={busyId === boutique.id}
                              onClick={() => void reject(boutique.id)}
                            >
                              ثبت رد
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {boutique.status === 'approved' ? (
                    <Link
                      href={`/boutiques/${boutique.slug}`}
                      className="mt-3 inline-block text-xs text-brand-700 underline"
                    >
                      مشاهده صفحه عمومی
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isAdmin ? (
          <section className="mt-8 rounded-2xl border border-sand-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">نگه‌داری داده</h2>
            <p className="mt-1 text-xs leading-6 text-slate-600">
              عکس‌های عروس پس از پایان مهلت نگه‌داری (۹۰ روز) باید حذف شوند. این عملیات
              به‌صورت خودکار هر ساعت اجرا می‌شود و در محیط واقعی با cron
              (<code dir="ltr">npm run photos:sweep</code>) هم قابل اجراست؛ اجرای دستی در audit ثبت می‌شود.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" isLoading={isPurging} onClick={() => void purgePhotos()}>
                اجرای پاک‌سازی منقضی‌ها
              </Button>
              {purgeState ? (
                <span className="text-xs text-slate-600">
                  حذف‌شده: {purgeState.purged.toLocaleString('fa-IR')} · خطا:{' '}
                  {purgeState.failed.toLocaleString('fa-IR')}
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {isAdmin && audit ? (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-slate-900">آخرین رخدادها</h2>
            {audit.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">رخدادی ثبت نشده است.</p>
            ) : (
              <ul className="mt-2 divide-y divide-sand-100 rounded-2xl border border-sand-200 bg-white">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
                    <span className="font-medium text-slate-800">
                      {ACTION_LABELS_FA[entry.action] ?? entry.action}
                      {entry.entityType ? ` · ${entry.entityType}` : ''}
                    </span>
                    <span className="text-slate-500">{formatJalaliDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
