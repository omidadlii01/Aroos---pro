'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  APPOINTMENT_STATUS_LABELS_FA,
  PERSIAN_WEEKDAYS_FA,
  formatDateKeyJalaliShort,
  formatMinuteOfDayFa,
  type AppointmentStatus,
  type AppointmentView,
  type AvailabilityRuleView,
} from '@bridalos/contracts';
import { Alert, Badge, Button, Field } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';

type Me = {
  activeBoutiqueId: string | null;
  user: { memberships: Array<{ boutiqueId: string; boutiqueName: string; role: string }> };
};

const statusTone: Record<AppointmentStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  requested: 'warning',
  confirmed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
  completed: 'brand',
  no_show: 'danger',
};

type RuleDraft = {
  enabled: boolean;
  start: string;
  end: string;
  slotMinutes: number;
};

const DEFAULT_START = '10:00';
const DEFAULT_END = '18:00';

function minuteFromTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function timeFromMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export default function DashboardAppointmentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<AppointmentView[] | null>(null);
  const [drafts, setDrafts] = useState<RuleDraft[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isSavingRules, setSavingRules] = useState(false);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');

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
      setItems([]);
      setLoading(false);
      return;
    }

    const [listResult, availabilityResult] = await Promise.all([
      apiFetch<{ items: AppointmentView[] }>('/api/v1/boutiques/active/appointments'),
      apiFetch<{ rules: AvailabilityRuleView[] }>('/api/v1/boutiques/active/availability'),
    ]);
    setLoading(false);
    if (!listResult.ok) {
      setLoadError(listResult.message);
      return;
    }
    setItems(listResult.data.items);

    if (availabilityResult.ok) {
      const byWeekday = new Map(availabilityResult.data.rules.map((rule) => [rule.weekday, rule]));
      setDrafts(
        Array.from({ length: 7 }, (_, weekday) => {
          const rule = byWeekday.get(weekday);
          return {
            enabled: Boolean(rule?.isActive),
            start: rule ? timeFromMinute(rule.startsMinute) : DEFAULT_START,
            end: rule ? timeFromMinute(rule.endsMinute) : DEFAULT_END,
            slotMinutes: rule?.slotMinutes ?? 60,
          };
        }),
      );
    } else {
      setDrafts(
        Array.from({ length: 7 }, () => ({
          enabled: false,
          start: DEFAULT_START,
          end: DEFAULT_END,
          slotMinutes: 60,
        })),
      );
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeMembership = me?.user.memberships.find(
    (membership) => membership.boutiqueId === me.activeBoutiqueId,
  );
  const canEditRules =
    activeMembership?.role === 'boutique_owner' || activeMembership?.role === 'branch_manager';

  async function decide(id: string, action: 'confirm' | 'complete' | 'no-show') {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<AppointmentView>(
      `/api/v1/boutiques/active/appointments/${id}/${action}`,
      { method: 'POST' },
    );
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice(`وضعیت نوبت به «${APPOINTMENT_STATUS_LABELS_FA[result.data.status]}» تغییر کرد.`);
    await load();
  }

  async function decline(id: string) {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    const result = await apiFetch<AppointmentView>(
      `/api/v1/boutiques/active/appointments/${id}/decline`,
      { method: 'POST', body: JSON.stringify({ reason: declineReason.trim() }) },
    );
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setDeclineFor(null);
    setDeclineReason('');
    setNotice('نوبت رد شد و دلیل برای عروس نمایش داده می‌شود.');
    await load();
  }

  async function saveRules() {
    if (!drafts) return;
    setSavingRules(true);
    setActionError(null);
    setNotice(null);
    const rules = drafts
      .map((draft, weekday) => ({
        weekday,
        startsMinute: minuteFromTime(draft.start),
        endsMinute: minuteFromTime(draft.end),
        slotMinutes: draft.slotMinutes,
        isActive: draft.enabled,
      }))
      .filter((rule) => rule.isActive);

    const result = await apiFetch<{ rules: AvailabilityRuleView[] }>(
      '/api/v1/boutiques/active/availability',
      { method: 'PUT', body: JSON.stringify({ rules }) },
    );
    setSavingRules(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setNotice(`ساعات کاری ذخیره شد (${result.data.rules.length} روز فعال).`);
    await load();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">نوبت‌های مزون</h1>
          <Link href="/dashboard" className="text-sm font-medium text-brand-700 underline">
            بازگشت به پنل
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          تأیید نوبت در همین صفحه انجام می‌شود؛ پیامکی ارسال نمی‌شود و عروس وضعیت را در صفحه
          «نوبت‌های من» می‌بیند.
        </p>

        {loadError ? (
          <div className="mt-4">
            <Alert tone="error" title="خواندن داده‌ها ناموفق بود">
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

        {!me?.activeBoutiqueId ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-8 text-center text-sm text-slate-600">
            ابتدا در پنل، یک مزون را فعال کنید.
          </div>
        ) : null}

        {isLoading ? <p className="mt-6 text-sm text-slate-500">در حال خواندن…</p> : null}

        {me?.activeBoutiqueId && items && items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-8 text-center text-sm text-slate-600">
            هنوز نوبتی ثبت نشده است.
          </div>
        ) : null}

        {items && items.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-sand-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {formatDateKeyJalaliShort(item.dateKey)}، ساعت {item.timeLabel}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      عروس: {item.brideName ?? 'بدون نام'} — {item.bridePhoneMasked ?? '—'}
                    </p>
                    {item.dress ? (
                      <p className="mt-1 text-xs text-slate-500">لباس: {item.dress.name}</p>
                    ) : null}
                    {item.note ? (
                      <p className="mt-1 text-xs text-slate-500">یادداشت عروس: {item.note}</p>
                    ) : null}
                    {item.declineReason ? (
                      <p className="mt-1 text-xs text-rose-600">دلیل رد: {item.declineReason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={statusTone[item.status]}>
                      {APPOINTMENT_STATUS_LABELS_FA[item.status]}
                    </Badge>
                    <div className="flex flex-wrap justify-end gap-2">
                      {item.status === 'requested' ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void decide(item.id, 'confirm')}
                            disabled={busyId === item.id}
                          >
                            تأیید
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setDeclineFor(item.id);
                              setDeclineReason('');
                            }}
                          >
                            رد
                          </Button>
                        </>
                      ) : null}
                      {item.status === 'confirmed' ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void decide(item.id, 'complete')}
                            disabled={busyId === item.id}
                          >
                            انجام شد
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void decide(item.id, 'no-show')}
                            disabled={busyId === item.id}
                          >
                            عدم حضور
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {declineFor === item.id ? (
                  <div className="mt-3 rounded-xl border border-sand-200 bg-sand-50 p-3">
                    <Field
                      label="دلیل رد نوبت (برای عروس نمایش داده می‌شود)"
                      value={declineReason}
                      onChange={(event) => setDeclineReason(event.target.value)}
                      maxLength={400}
                      hint="حداقل ۵ نویسه"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void decline(item.id)}
                        disabled={declineReason.trim().length < 5 || busyId === item.id}
                      >
                        ثبت دلیل و رد نوبت
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeclineFor(null)}>
                        انصراف
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {me?.activeBoutiqueId && drafts ? (
          <section className="mt-8 rounded-2xl border border-sand-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">ساعات کاری هفتگی</h2>
            <p className="mt-1 text-sm text-slate-600">
              هر روز فقط یک بازه. طول هر نوبت باید کمتر از طول بازه باشد. زمان‌ها به وقت تهران است.
            </p>
            {!canEditRules ? (
              <p className="mt-2 text-xs text-amber-700">
                ویرایش ساعات کاری فقط برای مالک مزون و مدیر شعبه مجاز است.
              </p>
            ) : null}
            <div className="mt-4 space-y-2">
              {drafts.map((draft, weekday) => (
                <div
                  key={weekday}
                  className="grid grid-cols-2 items-end gap-2 rounded-xl border border-sand-100 p-2 sm:grid-cols-5"
                >
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={!canEditRules}
                      onChange={(event) =>
                        setDrafts((current) =>
                          (current ?? []).map((item, index) =>
                            index === weekday ? { ...item, enabled: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                    {PERSIAN_WEEKDAYS_FA[weekday]}
                  </label>
                  <Field
                    label="از"
                    type="time"
                    value={draft.start}
                    disabled={!canEditRules || !draft.enabled}
                    onChange={(event) =>
                      setDrafts((current) =>
                        (current ?? []).map((item, index) =>
                          index === weekday ? { ...item, start: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Field
                    label="تا"
                    type="time"
                    value={draft.end}
                    disabled={!canEditRules || !draft.enabled}
                    onChange={(event) =>
                      setDrafts((current) =>
                        (current ?? []).map((item, index) =>
                          index === weekday ? { ...item, end: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Field
                    label="طول هر نوبت (دقیقه)"
                    inputMode="numeric"
                    value={String(draft.slotMinutes)}
                    disabled={!canEditRules || !draft.enabled}
                    onChange={(event) => {
                      const parsed = Number(event.target.value.replace(/[^\d]/g, ''));
                      setDrafts((current) =>
                        (current ?? []).map((item, index) =>
                          index === weekday
                            ? { ...item, slotMinutes: Number.isFinite(parsed) ? parsed : 60 }
                            : item,
                        ),
                      );
                    }}
                  />
                  <p className="pb-2 text-xs text-slate-500">
                    {draft.enabled
                      ? `نمونه: ${formatMinuteOfDayFa(minuteFromTime(draft.start))} تا ${formatMinuteOfDayFa(minuteFromTime(draft.end))}`
                      : 'تعطیل'}
                  </p>
                </div>
              ))}
            </div>
            {canEditRules ? (
              <div className="mt-4">
                <Button onClick={() => void saveRules()} disabled={isSavingRules}>
                  {isSavingRules ? 'در حال ذخیره…' : 'ذخیره ساعات کاری'}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
