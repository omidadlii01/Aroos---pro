# Route map

## وب (`apps/web`)

| مسیر | نوع | وضعیت | حالت‌ها |
| --- | --- | --- | --- |
| `/` | Server Component | فعال | وضعیت API از `/api/v1/meta`؛ خطای «API در دسترس نیست» |
| `/login` | Client | فعال | خالی/اعتبارسنجی/خطا/موفق → انتقال به `/dashboard` |
| `/dashboard` | Client | فعال | loading، empty («هنوز مزونی ثبت نکرده‌اید»)، error + تلاش دوباره، success، بدون نشست → `/login` |
| `/boutiques/[slug]` | — | فاز ۵ | — |
| `/dresses/[slug]` | — | فاز ۵ | — |
| `/try-on` | — | فاز ۸ | — |
| `/wardrobe` | — | فاز ۹ | — |
| `/b/[slug]` (White Label) | — | فاز ۱۴ | — |
| `/admin` | — | فاز ۱۵ | — |

## API (`apps/api`)

| متد و مسیر | احراز | وضعیت |
| --- | --- | --- |
| `POST /api/v1/auth/otp/request` | عمومی (rate-limited) | فعال |
| `POST /api/v1/auth/otp/verify` | عمومی | فعال |
| `POST /api/v1/auth/tenant` | JWT | فعال |
| `GET /api/v1/auth/me` | JWT | فعال |
| `GET /api/v1/boutiques/mine` | JWT | فعال |
| `GET /api/v1/boutiques/active` | JWT + TenantGuard | فعال |
| `POST /api/v1/boutiques` | JWT | فعال |
| `GET /api/v1/boutiques/:id` | JWT (عضو یا مزون تأییدشده) | فعال |
| `PATCH /api/v1/boutiques/:id` | JWT + مالک | فعال |
| `POST /api/v1/boutiques/:id/submit-review` | JWT + مالک | فعال |
| `GET /healthz`, `GET /readyz` | عمومی | فعال |
| `GET /api/v1/meta` | عمومی | فعال |

جزئیات قرارداد: [`../api/endpoints.md`](../api/endpoints.md).
