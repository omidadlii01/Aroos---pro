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

## اعضای مزون (کارکنان)

همه مسیرها نیازمند `Authorization` + توکن مزون‌دار (`TenantGuard`) و محدود به مزون فعال هستند.

| مسیر | دسترسی | توضیح | خطاهای مهم |
| --- | --- | --- | --- |
| `GET /boutiques/active/members` | همه اعضا | فهرست اعضا با شماره ماسک‌شده | `401`، `403` |
| `POST /boutiques/active/members/invite` | فقط `boutique_owner` | ثبت عضویت با شماره موبایل + نقش (`branch_manager`/`boutique_staff`)؛ پاسخ شامل `smsSent: false` و `noteFa` | `403`، `409` (تکراری/مالک)، `400` |
| `PATCH /boutiques/active/members/:userId` | فقط `boutique_owner` | تغییر نقش + ثبت در audit | `403`، `404`، `400` |
| `DELETE /boutiques/active/members/:userId` | فقط `boutique_owner` | لغو دسترسی (نمی‌تواند مالک یا خودش باشد) | `403`، `409` |

نکته امنیتی: پس از لغو، توکن مزون‌دارِ آن کاربر بلافاصله ۴۰۳ می‌گیرد (بررسی عضویت در هر درخواست).

## لباس‌ها (پنل مزون)

| مسیر | دسترسی | توضیح | خطاهای مهم |
| --- | --- | --- | --- |
| `GET /dresses` | اعضای مزون | فهرست با فیلتر وضعیت/دسته/جست‌وجو + صفحه‌بندی | `401`، `403` |
| `POST /dresses` | `boutique_owner`/`branch_manager` | ساخت پیش‌نویس؛ قیمت‌ها از فرم به **تومان** و در DB **ریال** | `409` کد تکراری، `400` |
| `GET /dresses/:id` | اعضای همان مزون | `404` برای مزون دیگر (بدون افشای وجود) | `404` |
| `PATCH /dresses/:id` | `boutique_owner`/`branch_manager` | لباس منتشرشده قابل ویرایش نیست | `409` |
| `POST /dresses/:id/publish` | فقط `boutique_owner` | الزامات: توضیح ≥۲۰ نویسه، قیمت، ≥۱ تصویر، مزون `approved` | `409` با دلیل دقیق فارسی |
| `POST /dresses/:id/archive` | `boutique_owner`/`branch_manager` | حذف از کاتالوگ عمومی | `409` |
| `POST /dresses/:id/media` | `boutique_owner`/`branch_manager` | بدنه خام تصویر (حداکثر ۸MB) + هدر اجباری `x-rights-attested: true` | `400` (MIME/حجم/عدم تأیید حقوق)، `413` |
| `DELETE /dresses/:id/media/:mediaId` | `boutique_owner`/`branch_manager` | حذف نرم + حذف فایل | `404` |

## رسانه خصوصی

| مسیر | توضیح |
| --- | --- |
| `GET /media/:id?expires=<unix>&token=<hmac>` | فقط با URL امضاشده معتبر و منقضی‌نشده؛ `403` برای توکن نامعتبر/منقضی/فایل دیگر، `404` برای فایل حذف‌شده. هدرها: `Cache-Control: private, max-age=…` و `Content-Disposition: inline` |

تصاویر در بارگذاری بازکدگذاری می‌شوند (JPEG کیفیت ۸۴، حداکثر ضلع ۲۰۰۰px) و EXIF/GPS حذف می‌شود؛ `checksum_sha256` برای ردیابی نگه‌داری می‌شود.

## کاتالوگ عمومی (بدون احراز هویت)

| مسیر | توضیح |
| --- | --- |
| `GET /public/dresses?city=&category=&priceMaxToman=&q=&page=` | فقط لباس `published` از مزون `approved`؛ هر تصویر با URL امضاشده کوتاه‌عمر |
| `GET /public/dresses/:id` | جزئیات؛ `404` برای پیش‌نویس/بایگانی/مزون تأییدنشده |
| `GET /public/boutiques/:slug` | صفحه عمومی مزون + لباس‌های منتشرشده |
| `GET /public/cities` | شهرهای دارای مزون تأییدشده و تعداد آن‌ها |

## پنل مدیر پلتفرم (admin)

همه مسیرها با `JwtAuthGuard` + `PlatformAdminGuard` محافظت می‌شوند. نقش از **دیتابیس** خوانده می‌شود، نه از ادعای توکن؛ پس با گرفتن نقش، توکن قبلی هم بی‌اثر می‌شود.

| مسیر | توضیح | خطاهای مهم |
| --- | --- | --- |
| `GET /admin/overview` | شمارش مزون‌ها به تفکیک وضعیت، لباس‌ها، کاربران، لباس منتشرشده | `401`، `403` |
| `GET /admin/boutiques?status=&page=&pageSize=` | فهرست بررسی؛ شماره مالک همیشه ماسک‌شده، تعداد لباس‌ها، زمان ارسال | `400` وضعیت نامعتبر |
| `POST /admin/boutiques/:id/approve` | فقط از `pending_review` → `approved`، ثبت بازبین و زمان | `409` وضعیت دیگر، `404` |
| `POST /admin/boutiques/:id/reject` | بدنه `{ reason }` (۵ تا ۵۰۰ نویسه) → `rejected`؛ دلیل برای مالک نمایش داده می‌شود | `400`، `409`، `404` |
| `GET /admin/audit?limit=` | آخرین رخدادها (بدون شماره تلفن یا داده شخصی) | `400` |

قاعده جریان: `draft → pending_review → approved | rejected`؛ مزون `rejected` می‌تواند اصلاح و دوباره `submit-review` شود. انتشار لباس فقط برای مزون `approved` ممکن است.

## عکس شخصی عروس (فاز ۶)

همه مسیرها پشت `JwtAuthGuard` هستند و داده فقط با `user_id` کاربر محدود می‌شود. ذخیره‌سازی همیشه خصوصی است.

| مسیر | توضیح | خطاهای مهم |
| --- | --- | --- |
| `POST /photos` | بدنه خام تصویر (حداکثر ۸MB) + هدرهای اجباری `x-consent-given: true` و `x-consent-version: v1` (یا نسخه جاری `PHOTO_CONSENT_VERSION`). پاسخ شامل `retentionUntil` | `400` بدون رضایت/نسخه نامعتبر/MIME جعلی/حجم، `401` |
| `GET /photos` | فهرست عکس‌های خود کاربر + URL امضاشده کوتاه‌عمر | `401` |
| `DELETE /photos/:id` | حذف کامل (رکورد + فایل فیزیکی)؛ فقط مالک | `404` برای عکس دیگران (بدون افشای وجود) |
| `GET /photos/:id/file?expires=&token=` | خواندن فایل با امضای HMAC؛ `Cache-Control: private` | `403` توکن جعلی/منقضی، `404` پس از حذف |

سیاست داده: نگه‌داری پیش‌فرض **۹۰ روز** (`PHOTO_RETENTION_DAYS`) و ذخیره `retention_until` در هر رکورد؛ رضایت با نسخه و زمان ثبت می‌شود. هیچ مسیر عمومی یا `media` به این عکس‌ها دسترسی ندارد (تست‌شده).

## امتحان مجازی — صف پردازش + آداپتور (فاز ۷)

> ⚠️ **هیچ مدل هوش مصنوعی واقعی متصل نیست.** تنها آداپتور موجود `AI_TRYON_PROVIDER=dev-watermark` است که عکس و تصویر لباس را با `sharp` کنار هم می‌چسباند و واترمارک دائمی «DEV PREVIEW — NOT REAL AI OUTPUT» روی آن می‌گذارد. این خروجی برای سفارش، تأیید تناسب یا تبلیغات معتبر نیست.

| مسیر | توضیح | خطاهای مهم |
| --- | --- | --- |
| `POST /tryon` | بدنه `{ photoId, dressId }`؛ عکس باید متعلق به همان کاربر و لباس باید `published` از مزون `approved` باشد. با provider پیکربندی‌شده → `status: "queued"` + `queuePosition`; با `AI_TRYON_PROVIDER=none` → `status: "blocked"` و `aiConfigured: false` و **هیچ تصویری ساخته نمی‌شود** | `401`، `404` (عکس/لباس)، `400` |
| `GET /tryon` | درخواست‌های خود کاربر (۵۰ مورد آخر) | `401` |
| `GET /tryon/:id` | فقط درخواست خود کاربر؛ درخواست دیگران `404`. شامل `status`, `isDevOutput`, `queuePosition`, و در حالت موفق `result.url`/`result.labelFa` (تعداد تلاش‌ها فقط در دیتابیس ستون `attempts` نگه داشته می‌شود و در پاسخ API نیست) | `401`، `404` |
| `GET /tryon/:id/result?expires=&token=` | **بدون `Authorization`** (برای `<img>`)؛ اعتبارسنجی با توکن HMAC کوتاه‌عمر. `200 image/jpeg` + هدر `x-bridalos-dev-output: true` + `Cache-Control: private, max-age=60` | `403` توکن جعلی/منقضی یا وضعیت ناموفق، `404` فایل حذف‌شده |

وضعیت‌ها: `blocked` (بدون provider) → `queued` → `processing` → `succeeded` یا `failed`. خطای موقت تا `TRYON_MAX_ATTEMPTS` (پیش‌فرض ۲) دوباره در صف می‌ماند؛ پس از آن `failed` با `errorMessage` فارسی.

پردازش: `TryOnWorkerService` هر `TRYON_WORKER_INTERVAL_SECONDS` (پیش‌فرض ۵، صفر=خاموش، در تست خاموش) ردیف‌های `queued` را با `FOR UPDATE SKIP LOCKED` برمی‌دارد، پس چند نمونه API می‌توانند روی یک دیتابیس کار کنند. خروجی در مسیر خصوصی `tryon/<userId>/<id>.jpg` ذخیره می‌شود.

## نوبت‌دهی حضوری (فاز ۸)

| مسیر | توضیح | خطاهای مهم |
| --- | --- | --- |
| `GET /public/boutiques/:slug/slots?date=YYYY-MM-DD` | بازه‌های آزاد یک روز برای مزون تأییدشده؛ فقط ساعت‌ها، بدون هیچ داده شخصی. فقط از امروز تا `BOOKING_HORIZON_DAYS` | `400` تاریخ نامعتبر/خارج از بازه، `404` مزون ناشناس |
| `POST /appointments` | بدنه `{ boutiqueId, startsAt, dressId?, note? }`؛ `startsAt` باید ISO-8601 با منطقه زمانی و دقیقاً یکی از بازه‌های ساعات کاری باشد. پاسخ `{ appointment, smsSent: false, noteFa }` با وضعیت `requested` | `400` زمان نامعتبر/کمتر از `BOOKING_MIN_LEAD_MINUTES`/بیش از افق، `404` مزون تأییدنشده یا لباس مزون دیگر، `409` بازه غیرمجاز/پرشده/سقف نوبت فعال |
| `GET /appointments` | نوبت‌های خود عروس (۵۰ مورد آخر) | `401` |
| `GET /appointments/:id` | فقط نوبت خود عروس؛ دیگران `404` | `401`، `404` |
| `POST /appointments/:id/cancel` | لغو توسط عروس فقط برای `requested`/`confirmed` و پیش از شروع | `409` وضعیت/زمان گذشته، `404` |
| `GET /boutiques/active/appointments?status=&from=&to=` | فهرست نوبت‌های مزون فعال با نام نمایشی و شماره ماسک‌شده عروس | `401`، `400`، `403` |
| `POST /boutiques/active/appointments/:id/confirm` | `requested → confirmed` | `409`، `404` |
| `POST /boutiques/active/appointments/:id/decline` | بدنه `{ reason }` (۵ تا ۴۰۰ نویسه) → `declined`؛ دلیل به عروس نمایش داده می‌شود | `400`، `409`، `404` |
| `POST /boutiques/active/appointments/:id/complete` | `confirmed → completed` | `409`، `404` |
| `POST /boutiques/active/appointments/:id/no-show` | `confirmed → no_show` | `409`، `404` |
| `GET /boutiques/active/availability` | ساعات کاری هفتگی مزون | `401`، `403` |
| `PUT /boutiques/active/availability` | بدنه `{ rules: [{ weekday, startsMinute, endsMinute, slotMinutes, isActive }] }`؛ فقط `boutique_owner` و `branch_manager` | `400` روز تکراری/بازه کوتاه‌تر از نوبت، `403` |

قواعد: ساعت‌ها به **دقیقه از نیمه‌شب تهران** ذخیره می‌شوند (`weekday` ۰=شنبه … ۶=جمعه)؛ هر روز فقط یک بازه. هر بازه ظرفیت **یک نوبت** دارد و با ایندکس یکتای دیتابیس تضمین می‌شود، پس دو درخواست هم‌زمان یکی `409` می‌گیرد. هیچ نوبتی حذف نمی‌شود؛ لغو/رد وضعیت را عوض می‌کند. **هیچ پیامکی ارسال نمی‌شود** و پاسخ `smsSent: false` است.

## نگه‌داری و پاک‌سازی داده

| مسیر/فرمان | توضیح |
| --- | --- |
| interval درون API | هر `PHOTO_RETENTION_SWEEP_SECONDS` (پیش‌فرض ۳۶۰۰، صفر=خاموش، در تست خاموش) عکس‌های گذشته از `retention_until` را حذف می‌کند |
| `npm run photos:sweep` | همان منطق برای cron در محیط واقعی (migration + حذف رکورد و فایل) |
| `POST /admin/maintenance/photos-purge` | اجرای دستی توسط `platform_admin`؛ نتیجه در audit با اکشن `photos.retention_purged` ثبت می‌شود |
| `POST /admin/maintenance/tryon-drain?limit=1..20` | اجرای دستی یک دور صف امتحان مجازی (پیش‌فرض ۵)؛ پاسخ `{claimed, succeeded, failed, requeued}` و audit با اکشن `tryon.queue_drained` |

## سلامت و وضعیت

| مسیر | پاسخ |
| --- | --- |
| `GET /healthz` | `{ status, version, uptimeSeconds, checks: { database: { status, driver, latencyMs } } }` (۵۰۳ اگر DB خطا) |
| `GET /readyz` | `{ ready: boolean }` |
| `GET /api/v1/meta` | وضعیت صریح `payments`/`ai`/`sms`/`otpDelivery`؛ بلوک `ai` همیشه `realOutput: false` دارد و با آداپتور آزمایشی `experimentalAdapter: true` برمی‌گرداند |

## کدهای خطا

`VALIDATION_ERROR` `UNAUTHENTICATED` `FORBIDDEN` `NOT_FOUND` `CONFLICT` `RATE_LIMITED`
`OTP_EXPIRED` `OTP_INVALID` `OTP_TOO_MANY_ATTEMPTS` `TENANT_REQUIRED` `INTERNAL_ERROR`
`SERVICE_UNAVAILABLE` `PROVIDER_UNAVAILABLE` — متن فارسی هر کد در
`packages/contracts/src/errors.ts`.
