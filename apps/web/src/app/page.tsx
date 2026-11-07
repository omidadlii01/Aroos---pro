import Link from 'next/link';

import { Alert, Badge } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';

type ApiMeta = {
  name: string;
  version: string;
  environment: string;
  otpDelivery: 'sms' | 'dev-log';
  payments: { status: string; reason: string };
  ai: { status: string; reason: string };
  sms: { status: string; reason: string };
};

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/**
 * وضعیت قابلیت‌ها از API خوانده می‌شود؛ هیچ عدد یا وضعیتی در UI جعل نمی‌شود.
 * اگر API در دسترس نباشد، همین وضعیت صادقانه نمایش داده می‌شود.
 */
async function loadMeta(): Promise<{ meta: ApiMeta | null; error: string | null }> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/api/v1/meta`, { cache: 'no-store' });
    if (!response.ok) return { meta: null, error: `پاسخ نامعتبر از API (کد ${response.status})` };
    return { meta: (await response.json()) as ApiMeta, error: null };
  } catch {
    return { meta: null, error: 'ارتباط با API برقرار نشد' };
  }
}

export default async function HomePage() {
  const { meta, error } = await loadMeta();

  const capabilities = [
    {
      title: 'ورود با کد یکبارمصرف موبایل',
      state: 'active' as const,
      description: 'کد ۵ رقمی، محدودیت تلاش و نرخ، هش‌شده در دیتابیس.',
    },
    {
      title: 'ایجاد مزون و عضویت مالک',
      state: 'active' as const,
      description: 'ثبت مزون در حالت پیش‌نویس، ارسال برای بررسی، جداسازی کامل داده مزون‌ها.',
    },
    {
      title: 'پنل مالک مزون',
      state: 'active' as const,
      description: 'ویرایش اطلاعات پایه، مشاهده وضعیت بررسی و انتخاب مزون فعال.',
    },
    {
      title: 'ارسال پیامک واقعی',
      state: 'blocked' as const,
      description: 'نیازمند حساب و کلید سرویس پیامک. فعلاً کد فقط در لاگ/پاسخ محیط توسعه است.',
    },
    {
      title: 'پرو مجازی با هوش مصنوعی',
      state: 'blocked' as const,
      description: 'بدون کلید ارائه‌دهنده AI. سرویس آزمایشی فقط خروجی watermark‌دار تولید می‌کند.',
    },
    {
      title: 'رزرو، پرداخت و اشتراک',
      state: 'pending' as const,
      description: 'در فازهای ۱۰ و ۱۳. هیچ تراکنش مالی در این نسخه انجام نمی‌شود.',
    },
  ];

  const tone = {
    active: { badge: 'success' as const, label: 'فعال و قابل استفاده' },
    blocked: { badge: 'warning' as const, label: 'مسدود به‌علت دسترسی' },
    pending: { badge: 'neutral' as const, label: 'در برنامه توسعه' },
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card sm:p-10">
          <p className="text-sm font-medium text-brand-700">پلتفرم مزون‌های لباس عروس</p>
          <h1 className="mt-2 text-2xl font-bold leading-relaxed text-slate-900 sm:text-3xl">
            BridalOS؛ زیرساخت فارسی برای کشف، پرو و رزرو لباس عروس
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            این نسخه، هسته واقعی سامانه است: هویت با کد یکبارمصرف، ثبت مزون، عضویت و کنترل
            دسترسی چندمستاجری. هر قابلیتی که هنوز آماده نیست، در همین صفحه صریح اعلام می‌شود.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              ورود با شماره موبایل
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              پنل من
            </Link>
          </div>
        </section>

        <section className="mt-6" aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-lg font-bold text-slate-900">
            وضعیت واقعی سامانه
          </h2>
          {error ? (
            <div className="mt-3">
              <Alert tone="warning" title="سرویس API در دسترس نیست">
                {error}. برای اجرای محلی، دستورهای موجود در README را اجرا کنید.
              </Alert>
            </div>
          ) : (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-sand-200 bg-white p-4">
                <dt className="text-slate-500">نسخه API</dt>
                <dd className="mt-1 font-semibold text-slate-900">{meta?.version ?? '—'}</dd>
              </div>
              <div className="rounded-xl border border-sand-200 bg-white p-4">
                <dt className="text-slate-500">محیط اجرا</dt>
                <dd className="mt-1 font-semibold text-slate-900">{meta?.environment ?? '—'}</dd>
              </div>
              <div className="rounded-xl border border-sand-200 bg-white p-4">
                <dt className="text-slate-500">تحویل کد تأیید</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {meta?.otpDelivery === 'dev-log' ? 'لاگ محیط توسعه (بدون پیامک)' : 'پیامک'}
                </dd>
              </div>
              <div className="rounded-xl border border-sand-200 bg-white p-4">
                <dt className="text-slate-500">درگاه پرداخت</dt>
                <dd className="mt-1 font-semibold text-slate-900">غیرفعال</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="mt-8" aria-labelledby="capabilities-heading">
          <h2 id="capabilities-heading" className="text-lg font-bold text-slate-900">
            چه چیزی آماده است و چه چیزی نه
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <li key={item.title} className="rounded-xl border border-sand-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <Badge tone={tone[item.state].badge}>{tone[item.state].label}</Badge>
                </div>
                <p className="mt-1.5 text-xs leading-6 text-slate-600">{item.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t border-sand-200 bg-white/60">
        <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-slate-500">
          BridalOS — نسخه توسعه. تصاویر کاربران، در صورت فعال‌شدن آپلود، خصوصی و کوتاه‌عمر خواهند
          بود؛ خروجی هوش مصنوعی هرگز تضمین سایز یا فیت واقعی نیست.
        </div>
      </footer>
    </div>
  );
}
