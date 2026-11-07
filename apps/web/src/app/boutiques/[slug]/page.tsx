import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatToman } from '@bridalos/contracts';
import { Badge } from '@bridalos/ui';

import { SiteHeader } from '@/components/site-header';
import { cityLabel } from '@/lib/cities';
import { fetchBoutique } from '@/lib/server-api';

export default async function BoutiquePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchBoutique(slug);
  if (!data) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <header className="rounded-2xl border border-sand-200 bg-white p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{data.boutique.name}</h1>
            <Badge tone="success">مزون تأییدشده</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{cityLabel(data.boutique.citySlug)}</p>
          {data.boutique.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">
              {data.boutique.description}
            </p>
          ) : null}
        </header>

        {data.dresses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sand-200 bg-white p-8 text-center text-sm text-slate-600">
            این مزون هنوز لباسی منتشر نکرده است.
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.dresses.map((dress) => (
              <li
                key={dress.id}
                className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-card"
              >
                <Link href={`/dresses/${dress.id}`}>
                  {dress.media[0] ? (
                    <img
                      src={dress.media[0].url}
                      alt={`تصویر ${dress.name}`}
                      width={dress.media[0].width ?? 640}
                      height={dress.media[0].height ?? 960}
                      className="h-60 w-full bg-sand-100 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-60 place-items-center bg-sand-100 text-xs text-slate-500">
                      تصویری ثبت نشده است
                    </div>
                  )}
                  <div className="p-4">
                    <p className="font-semibold text-slate-900">{dress.name}</p>
                    <p className="mt-1 text-sm text-brand-700">
                      {dress.priceMinRial !== null
                        ? formatToman(dress.priceMinRial)
                        : 'قیمت اعلام نشده'}
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
