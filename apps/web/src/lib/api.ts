'use client';

import { getToken } from './session';

export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const GENERIC_ERROR = 'ارتباط با سرور برقرار نشد. اتصال شبکه یا وضعیت سرویس را بررسی کنید.';

/**
 * فراخوانی API از مرورگر؛ همیشه با مسیر نسبی تا از مبدأ مشترک استفاده شود.
 * خطاها به شکل ساخت‌یافته با پیام فارسی برمی‌گردند و هیچ‌گاه بی‌صدا رد نمی‌شوند.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  if (init.auth !== false) {
    const token = getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: 'no-store' });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK_ERROR', message: GENERIC_ERROR };
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? 'UNKNOWN',
      message: error?.message ?? GENERIC_ERROR,
      details: error?.details,
    };
  }

  return { ok: true, data: payload as T };
}
