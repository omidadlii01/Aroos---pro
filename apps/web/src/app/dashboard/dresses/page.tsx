'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  BOUTIQUE_STATUS_LABELS_FA,
  DRESS_CATEGORIES,
  DRESS_CATEGORY_LABELS_FA,
  DRESS_STATUS_LABELS_FA,
  formatToman,
  type DressCategory,
  type DressStatus,
} from '@bridalos/contracts';
import { Alert, Badge, Button, Field } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

type Dress = {
  id: string;
  code: string;
  name: string;
  status: DressStatus;
  category: DressCategory;
  priceMinRial: number | null;
  priceMaxRial: number | null;
  media: Array<{ id: string; url: string }>;
};

type Me = {
  activeBoutiqueId: string | null;
  user: { memberships: Array<{ boutiqueId: string; boutiqueName: string; status: string; role: string }> };
};

const statusTone: Record<DressStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending_review: 'warning',
  published: 'success',
  archived: 'danger',
};

export default function DressesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [dresses, setDresses] = useState<Dress[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rights, setRights] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DressCategory>('wedding');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

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
      setDresses([]);
      setLoading(false);
      return;
    }

    const result = await apiFetch<{ items: Dress[] }>('/api/v1/dresses');
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setDresses(result.data.items);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeMembership = me?.user.memberships.find(
    (membership) => membership.boutiqueId === me?.activeBoutiqueId,
  );
  const canEdit = activeMembership?.role === 'boutique_owner' || activeMembership?.role === 'branch_manager';
  const canPublish = activeMembership?.role === 'boutique_owner';

  async function createDress(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);
    setNotice(null);
    setCreating(true);

    const result = await apiFetch<Dress>('/api/v1/dresses', {
      method: 'POST',
      body: JSON.stringify({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        priceMinToman: priceMin ? Number(priceMin.replace(/[^\d]/g, '')) : undefined,
        priceMaxToman: priceMax ? Number(priceMax.replace(/[^\d]/g, '')) : undefined,
      }),
    });
    setCreating(false);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setCode('');
    setName('');
    setDescription('');
    setPriceMin('');
    setPriceMax('');
    setNotice('لباس به‌صورت پیش‌نویس ثبت شد. برای انتشار، تصویر اضافه کنید.');
    await load();
  }

  async function uploadImage(dressId: string, file: File) {
    setActionError(null);
    setNotice(null);

    if (!rights) {
      setActionError('برای بارگذاری تصویر، ابتدا تأیید کنید که حق انتشار آن را دارید.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setActionError('حجم تصویر باید کمتر از ۸ مگابایت باشد.');
      return;
    }

    setBusyId(dressId);
    const token = getToken();
    try {
      const buffer = await file.arrayBuffer();
      const response = await fetch(`/api/v1/dresses/${dressId}/media`, {
        method: 'POST',
        headers: {
          'content-type': file.type,
          'x-rights-attested': 'true',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: buffer,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(body?.error?.message ?? 'بارگذاری تصویر ناموفق بود.');
        return;
      }
      setNotice('تصویر بارگذاری شد؛ متادیتای آن حذف شده و فقط با لینک کوتاه‌عمر قابل مشاهده است.');
      await load();
    } catch {
      setActionError('ارتباط با سرور برقرار نشد.');
    } finally {
      setBusyId(null);
    }
  }

  async function publish(dressId: string) {
    setBusyId(dressId);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<Dress>(`/api/v1/dresses/${dressId}/publish`, { method: 'POST' });
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('لباس منتشر شد و در کاتالوگ عمومی نمایش داده می‌شود.');
    await load();
  }

  async function archive(dressId: string) {
    setBusyId(dressId);
    setActionError(null);
    const result = await apiFetch<Dress>(`/api/v1/dresses/${dressId}/archive`, { method: 'POST' });
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('لباس بایگانی شد و از کاتالوگ عمومی برداشته شد.');
    await load();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">لباس‌های مزون</h1>
          <Link href="/dashboard" className="text-sm text-brand-700 underline">
            بازگشت به پنل
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-24 animate-pulse rounded-xl bg-sand-100" />
            <p className="text-xs text-slate-500">در حال بارگذاری…</p>
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
              برای مدیریت لباس‌ها ابتدا در{' '}
              <Link href="/dashboard" className="underline">
                پنل
              </Link>{' '}
              یک مزون را به‌عنوان مزون فعال انتخاب کنید.
            </Alert>
          </div>
        ) : null}

        {dresses && dresses.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {dresses.map((dress) => (
              <li key={dress.id} className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{dress.name}</span>
                      <Badge tone={statusTone[dress.status]}>{DRESS_STATUS_LABELS_FA[dress.status]}</Badge>
                      <span className="text-xs text-slate-500">کد {dress.code}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {DRESS_CATEGORY_LABELS_FA[dress.category]} ·{' '}
                      {dress.priceMinRial !== null ? formatToman(dress.priceMinRial) : 'بدون قیمت'}
                      {dress.priceMaxRial !== null && dress.priceMaxRial !== dress.priceMinRial
                        ? ` تا ${formatToman(dress.priceMaxRial)}`
                        : ''}
                    </p>
                  </div>
                  {dress.media[0] ? (
                    <img
                      src={dress.media[0].url}
                      alt={`تصویر ${dress.name}`}
                      width={56}
                      height={72}
                      className="h-18 w-14 rounded-lg bg-sand-100 object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-14 place-items-center rounded-lg bg-sand-100 text-[10px] text-slate-500">
                      بدون تصویر
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {dress.status !== 'published' && dress.status !== 'archived' && canEdit ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
                      <span>{busyId === dress.id ? 'در حال بارگذاری…' : 'افزودن تصویر'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={busyId === dress.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadImage(dress.id, file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}

                  {dress.status === 'draft' && canPublish ? (
                    <Button size="sm" isLoading={busyId === dress.id} onClick={() => void publish(dress.id)}>
                      انتشار
                    </Button>
                  ) : null}

                  {dress.status === 'published' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={busyId === dress.id}
                      onClick={() => void archive(dress.id)}
                    >
                      بایگانی
                    </Button>
                  ) : null}

                  {dress.status === 'published' ? (
                    <Link
                      href={`/dresses/${dress.id}`}
                      className="text-xs text-brand-700 underline"
                    >
                      صفحه عمومی
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {dresses && dresses.length === 0 && me?.activeBoutiqueId ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-sm text-slate-600">
            هنوز لباسی ثبت نکرده‌اید. با فرم پایین اولین لباس را اضافه کنید.
          </div>
        ) : null}

        {me?.activeBoutiqueId && canEdit ? (
          <form onSubmit={createDress} className="mt-6 rounded-2xl border border-sand-200 bg-white p-5" noValidate>
            <h2 className="text-sm font-bold text-slate-900">لباس جدید</h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="کد لباس"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="WED-001"
                hint="دو تا ۳۲ نویسه لاتین، رقم یا خط تیره"
                required
              />
              <Field
                label="نام لباس"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="مثال: نیلوفر"
                required
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dressCategory" className="text-sm font-medium text-slate-700">
                  دسته
                </label>
                <select
                  id="dressCategory"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as DressCategory)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base"
                >
                  {DRESS_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {DRESS_CATEGORY_LABELS_FA[option]}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                label="حداقل قیمت (تومان)"
                inputMode="numeric"
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value)}
                placeholder="20000000"
              />
              <Field
                label="حداکثر قیمت (تومان)"
                inputMode="numeric"
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value)}
                placeholder="35000000"
              />
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <label htmlFor="dressDescription" className="text-sm font-medium text-slate-700">
                توضیحات
              </label>
              <textarea
                id="dressDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="جنس پارچه، جزئیات دوخت و نکات مهم برای عروس (برای انتشار حداقل ۲۰ نویسه لازم است)."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
              />
            </div>

            <label className="mt-4 flex items-start gap-2 text-xs leading-6 text-slate-700">
              <input
                type="checkbox"
                checked={rights}
                onChange={(event) => setRights(event.target.checked)}
                className="mt-1"
              />
              <span>
                تأیید می‌کنم حق انتشار تصاویری را که بارگذاری می‌کنم دارم و رضایت مدل/عکاس را گرفته‌ام.
                تصاویر به‌صورت خصوصی ذخیره می‌شوند و فقط با لینک کوتاه‌عمر نمایش داده می‌شوند.
              </span>
            </label>

            <div className="mt-4">
              <Button type="submit" isLoading={isCreating}>
                ثبت لباس
              </Button>
            </div>
          </form>
        ) : null}

        {activeMembership ? (
          <p className="mt-6 text-xs text-slate-500">
            مزون فعال: {activeMembership.boutiqueName} ·{' '}
            {BOUTIQUE_STATUS_LABELS_FA[activeMembership.status as keyof typeof BOUTIQUE_STATUS_LABELS_FA]}
            {!canPublish ? ' · انتشار لباس فقط توسط مالک مزون انجام می‌شود.' : ''}
          </p>
        ) : null}
      </main>
    </div>
  );
}
