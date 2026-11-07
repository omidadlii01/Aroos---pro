'use client';

/**
 * نگه‌داری توکن دسترسی در sessionStorage.
 *
 * محدودیت شناخته‌شده (بدهی فنی مستند در docs/security): توکن در حافظه مرورگر
 * نگه‌داری می‌شود و در برابر XSS آسیب‌پذیر است. برای production، انتقال به
 * کوکی HttpOnly + توکن CSRF در فاز سخت‌سازی انجام می‌شود (ADR-0004).
 */
const TOKEN_KEY = 'bridalos.access_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
}
