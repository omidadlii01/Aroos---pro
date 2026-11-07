import type { DressCategory, PublicCatalogQuery } from '@bridalos/contracts';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

export type PublicMedia = { id: string; url: string; expiresAt: string; width: number | null; height: number | null };

export type PublicDress = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: DressCategory;
  attributes: Record<string, string | null>;
  priceMinRial: number | null;
  priceMaxRial: number | null;
  sampleAvailable: boolean;
  orderable: boolean;
  publishedAt: string | null;
  boutique: { id: string; name: string; slug: string; citySlug: string };
  media: PublicMedia[];
};

export type CatalogPage = {
  items: PublicDress[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * خواندن کاتالوگ عمومی در سمت سرور (بدون کش).
 * خطای شبکه به‌صورت `null` برمی‌گردد تا صفحه، حالت خطای صادقانه نشان دهد.
 */
export async function fetchCatalog(query: Partial<PublicCatalogQuery>): Promise<CatalogPage | null> {
  const params = new URLSearchParams();
  if (query.city) params.set('city', query.city);
  if (query.category) params.set('category', query.category);
  if (query.priceMaxToman !== undefined) params.set('priceMaxToman', String(query.priceMaxToman));
  if (query.q) params.set('q', query.q);
  if (query.page) params.set('page', String(query.page));

  try {
    const response = await fetch(`${API_INTERNAL_URL}/api/v1/public/dresses?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as CatalogPage;
  } catch {
    return null;
  }
}

export async function fetchDress(id: string): Promise<PublicDress | null> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/api/v1/public/dresses/${id}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicDress;
  } catch {
    return null;
  }
}

export async function fetchBoutique(slug: string): Promise<{
  boutique: { id: string; name: string; slug: string; citySlug: string; description: string | null };
  dresses: PublicDress[];
} | null> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/api/v1/public/boutiques/${slug}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      boutique: { id: string; name: string; slug: string; citySlug: string; description: string | null };
      dresses: PublicDress[];
    };
  } catch {
    return null;
  }
}

export async function fetchCities(): Promise<Array<{ citySlug: string; boutiqueCount: number }>> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/api/v1/public/cities`, { cache: 'no-store' });
    if (!response.ok) return [];
    const body = (await response.json()) as { items: Array<{ citySlug: string; boutiqueCount: number }> };
    return body.items;
  } catch {
    return [];
  }
}
