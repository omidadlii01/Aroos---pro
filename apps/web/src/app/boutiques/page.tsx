import Link from 'next/link';

import { Alert } from '@bridalos/ui';
import {
  DRESS_CATEGORIES,
  DRESS_CATEGORY_LABELS_FA,
  type DressCategory,
  formatToman,
} from '@bridalos/contracts';

import { SiteHeader } from '@/components/site-header';
import { cityLabel, CITY_OPTIONS } from '@/lib/cities';
import { fetchCatalog, fetchCities } from '@/lib/server-api';

export const metadata = {
  title: 'کاتالوگ لباس عروس',
  description: 'جست‌وجوی لباس عروس در مزون‌های تأییدشده BridalOS با فیلتر شهر، دسته و قیمت.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const city = single(params.city);
  const category = single(params.category) as DressCategory | undefined;
  const priceMaxRaw = single(params.priceMaxToman);
  const priceMaxToman =
    priceMaxRaw && /^\d+$/.test(priceMaxRaw) ? Number(priceMaxRaw) : undefined;
  const q = single(params.q);

  const [catalog, cities] = await Promise.all([
    fetchCatalog({ city, category, priceMaxToman, q }),
    fetchCities(),
  ]);

  const activeFilters = [city, category, priceMaxToman, q].filter(Boolean).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">کاتالوگ لباس عروس</h1>
            <p className="mt-1 text-sm text-slate-600">
              فقط لباس‌های منتشرشده از مزون‌های تأییدشده نمایش داده می‌شوند.
            </p>
          </div>
          {catalog ? (
            <p className="text-sm text-slate-500">
              {catalog.total.toLocaleString('fa-IR')} لباس یافت شد
            </p>
          ) : null}
        </div>

        <form method="get" className="mt-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 sm:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="city" className="text-xs font-medium text-slate-600">
              شهر
            </label>
            <select
              id="city"
              name="city"
              defaultValue={city ?? ''}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">همه شهرها</option>
              {CITY_OPTIONS.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                  {cities.find((item) => item.citySlug === option.slug)
                    ? ` (${cities.find((item) => item.citySlug === option.slug)!.boutiqueCount.toLocaleString('fa-IR')} مزون)`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-xs font-medium text-slate-600">
              دسته
            </label>
            <select
              id="category"
              name="category"
              defaultValue={category ?? ''}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">همه دسته‌ها</option>
              {DRESS_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {DRESS_CATEGORY_LABELS_FA[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="q" className="text-xs font-medium text-slate-600">
              جست‌وجو
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q ?? ''}
              placeholder="نام لباس یا مزون"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="priceMaxToman" className="text-xs font-medium text-slate-600">
              حداکثر قیمت (تومان)
            </label>
            <input
              id="priceMaxToman"
              name="priceMaxToman"
              inputMode="numeric"
              defaultValue={priceMaxToman ?? ''}
              placeholder="۵۰٬۰۰۰٬۰۰۰"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              اعمال فیلتر
            </button>
          </div>
        </form>

        {activeFilters > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            {activeFilters.toLocaleString('fa-IR')} فیلتر فعال ·{' '}
            <Link href="/boutiques" className="text-brand-700 underline">
              حذف فیلترها
            </Link>
          </p>
        ) : null}

        {catalog === null ? (
          <div className="mt-6">
            <Alert tone="warning" title="کاتالوگ در دسترس نیست">
              ارتباط با سرویس برقرار نشد. اگر API را محلی اجرا می‌کنید، وضعیت آن را بررسی کنید.
            </Alert>
          </div>
        ) : catalog.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-8 text-center">
            <p className="font-medium text-slate-800">لباسی با این فیلترها پیدا نشد</p>
            <p className="mt-1 text-sm text-slate-600">
              {activeFilters > 0
                ? 'می‌توانید فیلترها را ساده‌تر کنید یا شهر دیگری را انتخاب کنید.'
                : 'هنوز هیچ مزونی لباس منتشر نکرده است. مزون‌داران پس از تأیید می‌توانند لباس منتشر کنند.'}
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              ورود مزون‌داران
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.items.map((dress) => (
              <li key={dress.id} className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-card">
                <Link href={`/dresses/${dress.id}`} className="block">
                  {dress.media[0] ? (
                    // تصویر خصوصی با URL امضاشده کوتاه‌عمر سرو می‌شود
                    <img
                      src={dress.media[0].url}
                      alt={`تصویر ${dress.name}`}
                      width={dress.media[0].width ?? 640}
                      height={dress.media[0].height ?? 960}
                      className="h-64 w-full bg-sand-100 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-64 w-full place-items-center bg-sand-100 text-xs text-slate-500">
                      تصویری ثبت نشده است
                    </div>
                  )}
                  <div className="p-4">
                    <h2 className="font-semibold text-slate-900">{dress.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {dress.boutique.name} · {cityLabel(dress.boutique.citySlug)}
                    </p>
                    <p className="mt-2 text-sm font-medium text-brand-700">
                      {dress.priceMinRial !== null ? formatToman(dress.priceMinRial) : 'قیمت اعلام نشده'}
                      {dress.priceMaxRial !== null && dress.priceMaxRial !== dress.priceMinRial
                        ? ` تا ${formatToman(dress.priceMaxRial)}`
                        : ''}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {dress.sampleAvailable ? 'نمونه برای پرو موجود است' : 'نمونه پرو موجود نیست'}
                      {dress.orderable ? ' · قابلیت سفارش' : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
