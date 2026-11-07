'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { TRYON_STATUS_LABELS_FA, type BridePhotoView, type TryOnView } from '@bridalos/contracts';
import { Alert, Badge, Button } from '@bridalos/ui';

import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

type State =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'no-photo' }
  | { kind: 'ready'; photoId: string; photoUrl: string }
  | { kind: 'error'; message: string };

/**
 * امتحان مجازی روی عکس خود عروس.
 *
 * این پنل هیچ تصویری نمی‌سازد: سرویس AI متصل نیست، پس پاسخ سرور به‌صورت صریح
 * `blocked` است و همان دلیل نمایش داده می‌شود. دکمه فقط زمانی فعال است که
 * کاربر وارد شده و عکس خصوصی خود را بارگذاری کرده باشد.
 */
export function TryOnPanel({ dressId }: { dressId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [result, setResult] = useState<TryOnView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!getToken()) {
      setState({ kind: 'anonymous' });
      return;
    }
    const photos = await apiFetch<{ items: BridePhotoView[] }>('/api/v1/photos');
    if (!photos.ok) {
      setState(
        photos.status === 401
          ? { kind: 'anonymous' }
          : { kind: 'error', message: photos.message },
      );
      return;
    }
    const first = photos.data.items[0];
    if (!first) {
      setState({ kind: 'no-photo' });
      return;
    }
    setState({ kind: 'ready', photoId: first.id, photoUrl: first.url });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestTryOn(photoId: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await apiFetch<TryOnView>('/api/v1/tryon', {
      method: 'POST',
      body: JSON.stringify({ photoId, dressId }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResult(response.data);
  }

  return (
    <section className="mt-6 rounded-2xl border border-sand-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-900">امتحان مجازی با عکس من</h2>
      <p className="mt-1 text-xs leading-6 text-slate-600">
        عکسی که در بخش «عکس من» بارگذاری کرده‌اید، فقط برای این پیش‌نمایش استفاده می‌شود.
        پیش‌نمایش مجازی تخمین بصری است و تضمین اندازه، جنس پارچه یا نتیجه دوخت نیست؛ سفارش
        قطعی فقط با تأیید حضوری مزون ثبت می‌شود.
      </p>

      {state.kind === 'loading' ? (
        <p className="mt-3 text-xs text-slate-500" aria-busy="true">
          در حال بررسی وضعیت…
        </p>
      ) : null}

      {state.kind === 'anonymous' ? (
        <div className="mt-3 text-sm">
          <p className="text-slate-700">برای امتحان مجازی ابتدا وارد حساب خود شوید.</p>
          <Link href="/login" className="mt-2 inline-block text-brand-700 underline">
            ورود / ثبت‌نام با موبایل
          </Link>
        </div>
      ) : null}

      {state.kind === 'no-photo' ? (
        <div className="mt-3 text-sm">
          <p className="text-slate-700">هنوز عکسی بارگذاری نکرده‌اید.</p>
          <Link
            href="/photos"
            className="mt-2 inline-block rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            بارگذاری عکس با رضایت‌نامه
          </Link>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="mt-3">
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button isLoading={isBusy} onClick={() => void requestTryOn(state.photoId)}>
            امتحان مجازی
          </Button>
          <Link href="/photos" className="text-xs text-brand-700 underline">
            مدیریت عکس‌های من
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3">
          {result.status === 'blocked' ? (
            <Alert tone="warning" title="هیچ تصویری ساخته نشد">
              <span>
                وضعیت درخواست: <Badge tone="danger">{TRYON_STATUS_LABELS_FA[result.status]}</Badge>
              </span>
              <span className="mt-2 block">{result.statusReason}</span>
              <span className="mt-2 block text-xs text-slate-600">
                این درخواست با شناسه {result.id.slice(0, 8)} ثبت شد تا پشتیبانی بتواند وضعیت را
                پیگیری کند؛ هیچ خروجی جعلی نمایش داده نمی‌شود.
              </span>
            </Alert>
          ) : (
            <Alert tone="info" title={`وضعیت: ${TRYON_STATUS_LABELS_FA[result.status]}`}>
              درخواست شما ثبت شد.
            </Alert>
          )}
        </div>
      ) : null}
    </section>
  );
}
