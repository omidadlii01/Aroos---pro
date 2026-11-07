# API — قرارداد مسیرهای موجود

مسیر پایه: `/api/v1`. همه پاسخ‌های خطا یک قالب دارند:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "اطلاعات ارسالی معتبر نیست.", "requestId": "…", "details": [ … ] } }
```

> ⚠️ این سند **دستی** و همگام با شواهد اجرایی تست/curl است. تولید خودکار OpenAPI
> (`@nestjs/swagger`) بدهی فاز ۲ است و تا آن زمان این فایل مرجع قرارداد است.

## Auth

### `POST /auth/otp/request`

ورودی: `{ "phone": "۰۹۱۲۱۲۳۴۵۶۷" }` (ارقام فارسی پذیرفته می‌شود)

پاسخ ۲۰۰:

```json
{ "challengeId": "uuid", "expiresAt": "2026-11-07T18:02:29.795Z",
  "resendAfterSeconds": 60, "delivery": "dev-log", "devCode": "81270" }
```

`devCode` فقط در محیط غیر production و با `AUTH_DEV_ECHO_OTP=true` برمی‌گردد.
خطاها: `400 VALIDATION_ERROR`، `429 RATE_LIMITED` (با هدر `Retry-After`).

### `POST /auth/otp/verify`

ورودی: `{ "challengeId": "uuid", "code": "۱۲۳۴۵" }`
پاسخ ۲۰۰: `{ accessToken, expiresIn, user, activeBoutiqueId }`
خطاها: `401 OTP_INVALID`، `401 OTP_EXPIRED`، `429 OTP_TOO_MANY_ATTEMPTS`.

### `POST /auth/tenant` (نیازمند توکن)

ورودی: `{ "boutiqueId": "uuid" }` → توکن تازه با `activeBoutiqueId`.
خطاها: `403 FORBIDDEN` برای غیرعضو (بدون افشای وجود مزون).

### `GET /auth/me`

پاسخ: `{ user: { id, phone, displayName, roles[], memberships[] }, activeBoutiqueId }`

## Boutiques

| مسیر | توضیح | خطاهای مهم |
| --- | --- | --- |
| `POST /boutiques` | ساخت مزون (تراکنشی) + عضویت مالک | `409 CONFLICT` نشانی تکراری، `400` اعتبارسنجی |
| `GET /boutiques/mine` | مزون‌های کاربر | `401` |
| `GET /boutiques/active` | نیازمند `TenantGuard` | `400 TENANT_REQUIRED`، `403 FORBIDDEN` |
| `GET /boutiques/:id` | عضو یا مزون `approved` | `404 NOT_FOUND` (بدون افشای وجود) |
| `PATCH /boutiques/:id` | فقط مالک | `404` اگر مالک نباشد |
| `POST /boutiques/:id/submit-review` | `draft` → `pending_review` | `409 CONFLICT` در وضعیت دیگر |

## سلامت و وضعیت

| مسیر | پاسخ |
| --- | --- |
| `GET /healthz` | `{ status, version, uptimeSeconds, checks: { database: { status, driver, latencyMs } } }` (۵۰۳ اگر DB خطا) |
| `GET /readyz` | `{ ready: boolean }` |
| `GET /api/v1/meta` | وضعیت صریح `payments`/`ai`/`sms`/`otpDelivery` |

## کدهای خطا

`VALIDATION_ERROR` `UNAUTHENTICATED` `FORBIDDEN` `NOT_FOUND` `CONFLICT` `RATE_LIMITED`
`OTP_EXPIRED` `OTP_INVALID` `OTP_TOO_MANY_ATTEMPTS` `TENANT_REQUIRED` `INTERNAL_ERROR`
`SERVICE_UNAVAILABLE` `PROVIDER_UNAVAILABLE` — متن فارسی هر کد در
`packages/contracts/src/errors.ts`.
