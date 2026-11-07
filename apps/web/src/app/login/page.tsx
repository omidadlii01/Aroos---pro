'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

import { formatMobileFa, isValidOtpCode, parseIranianMobile } from '@bridalos/contracts';
import { Alert, Button, Field } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/session';

type Challenge = {
  challengeId: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: 'sms' | 'dev-log';
  devCode?: string;
};

type Session = {
  accessToken: string;
  activeBoutiqueId: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isRequesting, setRequesting] = useState(false);
  const [isVerifying, setVerifying] = useState(false);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setPhoneError(null);
    setFormError(null);

    const parsed = parseIranianMobile(phone);
    if (!parsed.ok) {
      setPhoneError(
        parsed.reason === 'empty'
          ? 'شماره موبایل را وارد کنید'
          : parsed.reason === 'invalid_prefix'
            ? 'شماره باید با ۰۹ شروع شود'
            : 'شماره موبایل معتبر نیست',
      );
      return;
    }

    setRequesting(true);
    const result = await apiFetch<Challenge>('/api/v1/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: parsed.value }),
      auth: false,
    });
    setRequesting(false);

    if (!result.ok) {
      setFormError(
        result.code === 'RATE_LIMITED'
          ? result.message
          : `${result.message} (کد خطا: ${result.code})`,
      );
      return;
    }
    setChallenge(result.data);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setCodeError(null);
    setFormError(null);

    if (!challenge) return;
    if (!isValidOtpCode(code)) {
      setCodeError('کد تأیید ۵ رقمی است');
      return;
    }

    setVerifying(true);
    const result = await apiFetch<Session>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: challenge.challengeId, code }),
      auth: false,
    });
    setVerifying(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setToken(result.data.accessToken);
    router.push('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold text-slate-900">ورود به BridalOS</h1>
          <p className="mt-1 text-sm text-slate-600">
            با شماره موبایل وارد شوید؛ برای هر شماره یک کد یکبارمصرف ارسال می‌شود.
          </p>

          {!challenge ? (
            <form onSubmit={requestCode} className="mt-6 flex flex-col gap-4" noValidate>
              <Field
                label="شماره موبایل"
                name="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="09121234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                hint="مثال: ۰۹۱۲۱۲۳۴۵۶۷ — ارقام فارسی هم پذیرفته می‌شود."
                error={phoneError}
                required
              />
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              <Button type="submit" isLoading={isRequesting}>
                دریافت کد تأیید
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-4" noValidate>
              <Alert tone="info" title={`کد برای ${formatMobileFa(phone.length === 11 ? phone : '')} ارسال شد`}>
                <span className="block">
                  {challenge.delivery === 'dev-log' ? (
                    <>
                      حالت توسعه: پیامک واقعی ارسال نشده است. کد در لاگ سرور ثبت می‌شود و در پاسخ
                      API با برچسب آزمایشی برگردانده می‌شود.
                    </>
                  ) : (
                    <>پیامک از طریق سرویس پیامک ارسال شد.</>
                  )}
                </span>
                {challenge.devCode ? (
                  <span className="mt-2 block rounded-lg bg-white/70 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-slate-900">
                    {challenge.devCode}
                  </span>
                ) : null}
              </Alert>

              <Field
                label="کد تأیید"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="۱۲۳۴۵"
                maxLength={5}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                error={codeError}
                required
              />
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              <Button type="submit" isLoading={isVerifying}>
                ورود
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setChallenge(null);
                  setCode('');
                  setFormError(null);
                }}
              >
                تغییر شماره موبایل
              </Button>
            </form>
          )}

          <p className="mt-6 text-xs text-slate-500">
            بدون حساب هم می‌توانید{' '}
            <Link href="/" className="text-brand-700 underline">
              صفحه اصلی
            </Link>{' '}
            را ببینید.
          </p>
        </div>
      </main>
    </div>
  );
}
