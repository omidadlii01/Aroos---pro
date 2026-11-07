'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  APPOINTMENT_NO_SMS_NOTE_FA,
  formatDateKeyJalaliShort,
  tehranDateKeyPlus,
  type AppointmentView,
  type SlotView,
} from '@bridalos/contracts';
import { Alert, Badge, Button } from '@bridalos/ui';

import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

type SlotsResponse = {
  dateKey: string;
  weekday: number;
  boutique: { id: string; name: string; slug: string };
  slots: SlotView[];
  closed: boolean;
  noteFa: string | null;
};

type CreateResponse = { appointment: AppointmentView; smsSent: false; noteFa: string };

const DAYS_TO_SHOW = 10;

/**
 * انتخاب بازه نوبت حضوری روی صفحه عمومی مزون.
 * بازه‌ها از API واقعی می‌آیند؛ اگر مزون ساعتی ثبت نکرده باشد، همان را صادقانه می‌گوید.
 */
export function BookingPanel({ boutiqueId, slug }: { boutiqueId: string; slug: string }) {
  const searchParams = useSearchParams();
  const dressId = searchParams.get('dress');
  const dates = Array.from({ length: DAYS_TO_SHOW }, (_, index) => tehranDateKeyPlus(index));

  const [selectedDate, setSelectedDate] = useState<string>(dates[1] ?? dates[0]!);
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isSending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResponse | null>(null);
  const [note, setNote] = useState('');
  const [isLoggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(Boolean(getToken()));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSelectedSlot(null);
    const result = await apiFetch<SlotsResponse>(
      `/api/v1/public/boutiques/${slug}/slots?date=${selectedDate}`,
      { auth: false },
    );
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.message);
      setData(null);
      return;
    }
    setData(result.data);
  }, [selectedDate, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!selectedSlot) return;
    setSending(true);
    setActionError(null);
    const result = await apiFetch<CreateResponse>('/api/v1/appointments', {
      method: 'POST',
      body: JSON.stringify({
        boutiqueId,
        startsAt: selectedSlot,
        dressId: dressId ?? undefined,
        note: note.trim() ? note.trim() : undefined,
      }),
    });
    setSending(false);
    if (!result.ok) {
      setActionError(result.message);
      void load();
      return;
    }
    setCreated(result.data);
    setNote('');
    void load();
  }

  return (
    <section
      id="booking"
      className="mt-6 rounded-2xl border border-sand-200 bg-white p-6 shadow-card"
      aria-labelledby="booking-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="booking-title" className="text-lg font-bold text-slate-900">
          رزرو نوبت حضوری
        </h2>
        <Badge tone="neutral">بدون پرداخت آنلاین</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        نوبت را انتخاب کنید؛ مزون آن را تأیید یا رد می‌کند. {APPOINTMENT_NO_SMS_NOTE_FA}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="انتخاب روز">
        {dates.map((dateKey) => (
          <button
            key={dateKey}
            type="button"
            onClick={() => setSelectedDate(dateKey)}
            aria-pressed={selectedDate === dateKey}
            className={
              'rounded-xl border px-3 py-2 text-xs font-medium transition ' +
              (selectedDate === dateKey
                ? 'border-brand-500 bg-brand-50 text-brand-800'
                : 'border-sand-200 bg-white text-slate-600 hover:bg-sand-50')
            }
          >
            {formatDateKeyJalaliShort(dateKey)}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-24">
        {isLoading ? <p className="text-sm text-slate-500">در حال خواندن بازه‌ها…</p> : null}
        {loadError ? (
          <Alert tone="error" title="خواندن بازه‌ها ناموفق بود">
            {loadError}
          </Alert>
        ) : null}
        {!isLoading && !loadError && data ? (
          data.closed || data.slots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-sand-200 bg-sand-50 p-4 text-sm text-slate-600">
              {data.noteFa ?? 'برای این روز بازه‌ای ثبت نشده است.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {data.slots.map((slot) => (
                <li key={slot.startsAt}>
                  <button
                    type="button"
                    disabled={!slot.available}
                    aria-pressed={selectedSlot === slot.startsAt}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                    className={
                      'w-full rounded-xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ' +
                      (selectedSlot === slot.startsAt
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-sand-200 bg-white text-slate-700 hover:bg-sand-50')
                    }
                  >
                    {slot.timeLabel}
                    {!slot.available ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-500">پر شده</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {created ? (
        <div className="mt-4">
          <Alert tone="success" title="درخواست نوبت ثبت شد">
            {formatDateKeyJalaliShort(created.appointment.dateKey)} ساعت {created.appointment.timeLabel} — وضعیت:
            در انتظار تأیید مزون. {created.noteFa}{' '}
            <Link href="/appointments" className="font-medium underline">
              پیگیری نوبت‌های من
            </Link>
          </Alert>
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-4">
          <Alert tone="error" title="ثبت نوبت انجام نشد">
            {actionError}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-slate-700">
          یادداشت برای مزون (اختیاری)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={400}
            rows={2}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            placeholder="مثلاً قد ۱۷۰ و تمایل به آستین بلند"
          />
        </label>
        {isLoggedIn ? (
          <Button type="button" onClick={() => void submit()} disabled={!selectedSlot || isSending}>
            {isSending ? 'در حال ثبت…' : 'ثبت درخواست نوبت'}
          </Button>
        ) : (
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-3 text-sm text-slate-700">
            برای ثبت نوبت باید با شماره موبایل وارد شوید.{' '}
            <Link href="/login" className="font-medium text-brand-700 underline">
              ورود / ثبت‌نام
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
