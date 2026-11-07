import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  DRESS_ATTRIBUTE_LABELS_FA,
  DRESS_CATEGORY_LABELS_FA,
  formatToman,
} from '@bridalos/contracts';
import { Alert, Badge } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { cityLabel } from '@/lib/cities';
import { fetchDress } from '@/lib/server-api';

export default async function DressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dress = await fetchDress(id);
  if (!dress) notFound();

  const attributes = Object.entries(dress.attributes).filter(([, value]) => Boolean(value));

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link href="/boutiques" className="text-sm text-brand-700 underline">
          بازگشت به کاتالوگ
        </Link>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            {dress.media[0] ? (
              <img
                src={dress.media[0].url}
                alt={`تصویر ${dress.name}`}
                width={dress.media[0].width ?? 720}
                height={dress.media[0].height ?? 1080}
                className="w-full rounded-2xl border border-sand-200 bg-sand-100 object-cover"
              />
            ) : (
              <div className="grid h-80 place-items-center rounded-2xl bg-sand-100 text-sm text-slate-500">
                تصویری ثبت نشده است
              </div>
            )}
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">{dress.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {DRESS_CATEGORY_LABELS_FA[dress.category]} · کد {dress.code}
            </p>

            <p className="mt-4 text-lg font-semibold text-brand-700">
              {dress.priceMinRial !== null ? formatToman(dress.priceMinRial) : 'قیمت اعلام نشده'}
              {dress.priceMaxRial !== null && dress.priceMaxRial !== dress.priceMinRial
                ? ` تا ${formatToman(dress.priceMaxRial)}`
                : ''}
            </p>

            {dress.description ? (
              <p className="mt-4 text-sm leading-7 text-slate-700">{dress.description}</p>
            ) : null}

            {attributes.length > 0 ? (
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {attributes.map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-sand-200 bg-white px-3 py-2">
                    <dt className="text-xs text-slate-500">
                      {DRESS_ATTRIBUTE_LABELS_FA[key as keyof typeof DRESS_ATTRIBUTE_LABELS_FA] ?? key}
                    </dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={dress.sampleAvailable ? 'success' : 'neutral'}>
                {dress.sampleAvailable ? 'نمونه برای پرو موجود است' : 'نمونه پرو موجود نیست'}
              </Badge>
              {dress.orderable ? <Badge tone="brand">قابلیت سفارش سفارشی</Badge> : null}
            </div>

            <div className="mt-6 rounded-2xl border border-sand-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">{dress.boutique.name}</p>
              <p className="mt-1 text-xs text-slate-500">{cityLabel(dress.boutique.citySlug)}</p>
              <Link
                href={`/boutiques/${dress.boutique.slug}`}
                className="mt-3 inline-block rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                صفحه مزون
              </Link>
            </div>

            <div className="mt-4">
              <Alert tone="info" title="رزرو حضوری هنوز فعال نیست">
                امکان رزرو وقت پرو در فاز ۱۰ اضافه می‌شود. تا آن زمان برای هماهنگی با مزون تماس بگیرید.
              </Alert>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
