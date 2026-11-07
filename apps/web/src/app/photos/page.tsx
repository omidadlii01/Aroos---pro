'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  PHOTO_CONSENT_TEXT_FA,
  PHOTO_CONSENT_VERSION,
  PHOTO_RETENTION_DAYS,
  formatJalaliDate,
  type BridePhotoView,
} from '@bridalos/contracts';
import { Alert, Button } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

export default function PhotosPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<BridePhotoView[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [consent, setConsent] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    const result = await apiFetch<{ items: BridePhotoView[] }>('/api/v1/photos');
    setLoading(false);
    if (!result.ok) {
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      setError(result.message);
      return;
    }
    setPhotos(result.data.items);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setError(null);
    setNotice(null);

    if (!consent) {
      setError('برای بارگذاری عکس، ابتدا متن رضایت‌نامه را تأیید کنید.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('حجم تصویر باید کمتر از ۸ مگابایت باشد.');
      return;
    }

    setUploading(true);
    const token = getToken();
    try {
      const response = await fetch('/api/v1/photos', {
        method: 'POST',
        headers: {
          'content-type': file.type,
          'x-consent-given': 'true',
          'x-consent-version': PHOTO_CONSENT_VERSION,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: await file.arrayBuffer(),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'بارگذاری عکس ناموفق بود.');
        return;
      }
      setNotice(
        `عکس به‌صورت خصوصی ذخیره شد و در تاریخ ${formatJalaliDate(body.retentionUntil)} به‌صورت خودکار حذف می‌شود.`,
      );
      await load();
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setUploading(false);
    }
  }

  async function remove(photoId: string) {
    setBusyId(photoId);
    setError(null);
    setNotice(null);
    const result = await apiFetch<{ deleted: boolean }>(`/api/v1/photos/${photoId}`, {
      method: 'DELETE',
    });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice('عکس حذف شد؛ فایل ذخیره‌شده هم پاک شد و لینک قبلی دیگر کار نمی‌کند.');
    await load();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">عکس من برای پرو مجازی</h1>
          <Link href="/dashboard" className="text-sm text-brand-700 underline">
            پنل من
          </Link>
        </div>

        <p className="mt-2 text-sm leading-7 text-slate-600">
          این عکس فقط برای پیش‌نمایش مجازی لباس استفاده می‌شود. تصویر در فضای خصوصی ذخیره می‌شود،
          در کاتالوگ عمومی یا شبکه اجتماعی نمایش داده نمی‌شود و لینک آن کوتاه‌عمر است. هر زمان
          می‌توانید آن را حذف کنید.
        </p>

        <div className="mt-4">
          <Alert tone="warning" title="پیش‌نمایش مجازی هنوز فعال نشده است">
            سرویس هوش مصنوعی در این نسخه پیکربندی نشده است؛ بارگذاری عکس برای آماده‌سازی و
            آزمایش حریم خصوصی فعال است، اما هیچ خروجی پرو مجازی ساخته نمی‌شود. تا زمان اتصال
            سرویس واقعی، هیچ نتیجه‌ای به‌عنوان «پرو لباس» نمایش داده نمی‌شود.
          </Alert>
        </div>

        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4">
            <Alert tone="success">{notice}</Alert>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-sand-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">بارگذاری عکس جدید</h2>

          <label className="mt-3 flex items-start gap-2 rounded-xl bg-sand-50 p-3 text-xs leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
            />
            <span>{PHOTO_CONSENT_TEXT_FA}</span>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 aria-disabled:opacity-60">
              <span>{isUploading ? 'در حال بارگذاری…' : 'انتخاب و بارگذاری عکس'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={isUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = '';
                }}
              />
            </label>
            <span className="text-xs text-slate-500">
              حداکثر ۸ مگابایت · نگه‌داری خودکار {PHOTO_RETENTION_DAYS.toLocaleString('fa-IR')} روز
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            نسخه رضایت‌نامه: {PHOTO_CONSENT_VERSION} — هر تغییر در متن رضایت نسخه جدید می‌گیرد.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-bold text-slate-900">عکس‌های من</h2>

          {isLoading ? (
            <div className="mt-3" aria-busy="true">
              <div className="h-24 animate-pulse rounded-xl bg-sand-100" />
              <p className="mt-2 text-xs text-slate-500">در حال بارگذاری…</p>
            </div>
          ) : null}

          {!isLoading && photos && photos.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-sand-200 bg-white p-6 text-sm text-slate-600">
              هنوز عکسی بارگذاری نکرده‌اید.
            </div>
          ) : null}

          {photos && photos.length > 0 ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {photos.map((photo) => (
                <li key={photo.id} className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
                  <img
                    src={photo.url}
                    alt="عکس خصوصی من"
                    width={photo.width ?? 240}
                    height={photo.height ?? 360}
                    className="h-48 w-full bg-sand-100 object-cover"
                  />
                  <div className="p-3">
                    <p className="text-xs text-slate-600">
                      ثبت: {formatJalaliDate(photo.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      حذف خودکار: {formatJalaliDate(photo.retentionUntil)}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={busyId === photo.id}
                        onClick={() => void remove(photo.id)}
                      >
                        حذف عکس
                      </Button>
                      <span className="text-[11px] text-slate-500">
                        {(photo.byteSize / 1024).toFixed(0)} کیلوبایت
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  );
}
