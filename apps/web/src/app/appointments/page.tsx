'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  APPOINTMENT_NO_SMS_NOTE_FA,
  APPOINTMENT_STATUS_LABELS_FA,
  formatDateKeyJalaliShort,
  type AppointmentStatus,
  type AppointmentView,
} from '@bridalos/contracts';
import { Alert, Badge, Button } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

const statusTone: Record<AppointmentStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  requested: 'warning',
  confirmed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
  completed: 'brand',
  no_show: 'danger',
};

export default function MyAppointmentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppointmentView[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    setLoadError(null);
    const result = await apiFetch<{ items: AppointmentView[] }>('/api/v1/appointments');
    setLoading(false);
    if (!result.ok) {
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      setLoadError(result.message);
      return;
    }
    setItems(result.data.items);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<AppointmentView>(`/api/v1/appointments/${id}/cancel`, {
      method: 'POST',
    });
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice('نوبت لغو شد.');
    await load();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">نوبت‌های حضوری من</h1>
          <Link href="/boutiques" className="text-sm font-medium text-brand-700 underline">
            انتخاب مزون
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-600">{APPOINTMENT_NO_SMS_NOTE_FA}</p>

        {loadError ? (
          <div className="mt-4">
            <Alert tone="error" title="خواندن نوبت‌ها ناموفق بود">
              {loadError}
            </Alert>
          </div>
        ) : null}
        {actionError ? (
          <div className="mt-4">
            <Alert tone="error" title="عملیات انجام نشد">
              {actionError}
            </Alert>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4">
            <Alert tone="success">{notice}</Alert>
          </div>
        ) : null}

        {isLoading ? <p className="mt-6 text-sm text-slate-500">در حال خواندن…</p> : null}

        {!isLoading && items && items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-8 text-center text-sm text-slate-600">
            هنوز نوبتی ثبت نکرده‌اید. از صفحه هر مزون می‌توانید نوبت حضوری بگیرید.
          </div>
        ) : null}

        {items && items.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {items.map((item) => {
              const canCancel =
                (item.status === 'requested' || item.status === 'confirmed') &&
                new Date(item.startsAt).getTime() > Date.now();
              return (
                <li key={item.id} className="rounded-2xl border border-sand-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.boutique.name} —{' '}
                        <Link
                          href={`/boutiques/${item.boutique.slug}`}
                          className="text-brand-700 underline"
                        >
                          صفحه مزون
                        </Link>
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {formatDateKeyJalaliShort(item.dateKey)}، ساعت {item.timeLabel}
                      </p>
                      {item.dress ? (
                        <p className="mt-1 text-xs text-slate-500">لباس: {item.dress.name}</p>
                      ) : null}
                      {item.note ? (
                        <p className="mt-1 text-xs text-slate-500">یادداشت من: {item.note}</p>
                      ) : null}
                      {item.declineReason ? (
                        <p className="mt-1 text-xs text-rose-600">دلیل رد: {item.declineReason}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={statusTone[item.status]}>
                        {APPOINTMENT_STATUS_LABELS_FA[item.status]}
                      </Badge>
                      {canCancel ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void cancel(item.id)}
                          disabled={busyId === item.id}
                        >
                          {busyId === item.id ? 'در حال لغو…' : 'لغو نوبت'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
