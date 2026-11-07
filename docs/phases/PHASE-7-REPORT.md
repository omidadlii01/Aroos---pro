# گزارش فاز ۷: صف پردازش واقعی + لایه آداپتور provider

- **تاریخ:** ۲۰۲۶-۱۱-۰۷
- **شاخه:** `arena/25a9d6ee-aroos-pro`
- **هدف:** امتحان مجازی از «همیشه blocked» به یک **خط لوله واقعی** تبدیل شود: صف پایدار، worker با برداشت اتمی، تلاش مجدد، ذخیره خروجی و تحویل امضاشده — با یک آداپتور **آزمایشی** که خودش را جای هوش مصنوعی جا نمی‌زند.

> ## ⚠️ صریح‌ترین جمله این گزارش
> **هنوز هیچ هوش مصنوعی واقعی در BridalOS وجود ندارد.** آداپتور `dev-watermark` فقط عکس عروس و تصویر لباس را با `sharp` کنار هم می‌گذارد و یک واترمارک دائمی «DEV PREVIEW — NOT REAL AI OUTPUT» بالای تصویر می‌گذارد. این تصویر نه تناسب لباس را نشان می‌دهد، نه برای سفارش یا تأیید مزون معتبر است. کل ارزش این فاز **زیرساخت** است: هر provider واقعی که بعداً وصل شود، از همین صف، همین سیاست تلاش مجدد و همین مسیر تحویل استفاده می‌کند.
>
> نمونه واقعی خروجی این فاز (فایل ذخیره‌شده، بدون تغییر): `docs/phases/assets/phase7-dev-preview-sample.jpg`

## ۱) کارهای انجام‌شده

### دیتابیس — `0008_tryon_queue.sql`
- ستون‌های جدید روی `tryon_requests`: `attempts`, `claimed_at`, `started_at`, `completed_at`, `result_storage_key`, `result_content_type`, `error_message`, `is_dev_output`.
- ایندکس جزئی برای صف (`status = 'queued'` روی `created_at`) و ایندکس جزئی برای خروجی‌های آماده.
- وضعیت اعمال: `npm run db:migrate` → «۱ مورد جدید / ۷ مورد موجود».

### لایه آداپتور — `apps/api/src/tryon/providers/`
- `TryOnProvider` (اینترفیس) با قرارداد صریح: `name`، `producesRealOutput`، `render(input)`.
- `DevWatermarkProvider`: چسباندن دو تصویر + نوار واترمارک فارسی/انگلیسی، خروجی JPEG، `isDevOutput: true`، `producesRealOutput: false`.
- انتخاب provider فقط از env: `AI_TRYON_PROVIDER=none|dev-watermark`. مقدار `none` مسیر قبلی `blocked` را حفظ می‌کند تا رفتار فاز ۶ بی‌صدا عوض نشود.
- ثبت provider با توکن `TRYON_PROVIDER` در `TryOnModule` — جای provider واقعی از همین‌جا عوض می‌شود، بدون دست‌زدن به سرویس یا کنترلر.

### Worker — `TryOnWorkerService`
- برداشت اتمی با `SELECT … FOR UPDATE SKIP LOCKED` روی `status = 'queued'` به ترتیب `created_at`؛ یعنی چند نمونه API می‌توانند بدون دوباره‌کاری روی یک دیتابیس کار کنند.
- چرخه: `queued → processing → succeeded` یا بازگشت به `queued` تا `TRYON_MAX_ATTEMPTS` (پیش‌فرض ۲) و در نهایت `failed` با `error_message` فارسی.
- خروجی در فضای خصوصی `tryon/<userId>/<id>.jpg` نوشته می‌شود؛ هیچ مسیر عمومی به آن دسترسی ندارد.
- اجرای دوره‌ای با `TRYON_WORKER_INTERVAL_SECONDS` (پیش‌فرض ۵ ثانیه، صفر = خاموش، در `NODE_ENV=test` همیشه خاموش) + توقف تمیز با `OnApplicationShutdown`.
- اجرای دستی یک دور: `POST /api/v1/admin/maintenance/tryon-drain?limit=1..20` با پاسخ `{claimed, succeeded, failed, requeued}` و audit `tryon.queue_drained`.

### API و تحویل تصویر
- `POST /api/v1/tryon`: با provider پیکربندی‌شده → `status: "queued"` + `queuePosition`؛ با `none` → `blocked` (رفتار فاز ۶).
- `GET /api/v1/tryon/:id`: `status`, `isDevOutput`, `queuePosition`, و در حالت موفق `result.url` + `result.labelFa`.
- `GET /api/v1/tryon/:id/result?expires=&token=`: **بدون `Authorization`** در کنترلر جداگانه (`tryon-result.controller.ts`)، چون `<img>` مرورگر هدر توکن نمی‌فرستد. اعتبار با توکن HMAC کوتاه‌عمر است؛ هدر `x-bridalos-dev-output: true` و `Cache-Control: private, max-age=60`.
- `GET /api/v1/meta`: بلوک `ai` حالا `realOutput: false` و با آداپتور آزمایشی `experimentalAdapter: true` برمی‌گرداند و متن دلیل هم با همان provider هم‌خوان است (قبلاً می‌گفت «درخواست‌ها blocked ثبت می‌شوند» که با `dev-watermark` نادرست بود).

### UI
- `TryOnPanel` بازنویسی شد: ارسال درخواست، سپس polling تا رسیدن به وضعیت پایانی. چهار بلوک متفاوت برای `queued` (با جایگاه صف), `processing`, `failed` (دلیل) و `succeeded`.
- در حالت `succeeded` تصویر نمایش داده می‌شود اما **همیشه** همراه با برچسب `DEV_TRYON_LABEL_FA`:
  «خروجی آزمایشی (واترمارک‌دار) — این تصویر خروجی واقعی هوش مصنوعی نیست و برای سفارش یا تأیید تناسب معتبر نیست.»
- متن وضعیت `blocked` هم دست‌نخورده ماند تا وقتی provider خاموش است، کاربر هیچ تصویری نبیند.

## ۲) تست‌های واقعاً اجراشده

| مجموعه | تعداد | نتیجه |
| --- | --- | --- |
| `apps/api` (۱۰ فایل) | **۱۰۵** | ✅ قبول |
| ↳ `tryon-queue.test.ts` (جدید) | ۷ | ✅ قبول |
| `packages/contracts` | ۳۸ | ✅ قبول |
| `services/ai` (pytest) | ۶ | ✅ قبول |
| `npm run lint` / `typecheck` / `build` | — | ✅ پاک/پاک/موفق |

پوشش `tryon-queue.test.ts`: ثبت `queued` + `queuePosition`، برداشت واقعی توسط drain، تولید فایل واقعی با واترمارک و `isDevOutput: true`، رد توکن جعلی/منقضی با ۴۰۳، رفتار شکست (عکس بین ثبت و پردازش حذف می‌شود → requeue یا failed، بدون فیلد نتیجه)، ۴۰۳ برای drain توسط غیرادمین، و صریح بودن بلوک `ai` در `meta`.

## ۳) شواهد اجرای واقعی روی :4000 و :3000

```
create: queued | provider: dev-watermark | aiConfigured: true | queue: 1
second request:                              queue: 2
poll 1 (≈۲ ثانیه بعد): succeeded
final: succeeded | isDevOutput: true
label: خروجی آزمایشی (واترمارکدار) — این تصویر…
result file: 200 image/jpeg | x-bridalos-dev-output: true | 1200x980 | 14874 بایت
forged token: 403
my requests: 1 | statuses: succeeded
drain بدون توکن ادمین: 401
meta ai: {"status":"not-configured","provider":"dev-watermark","realOutput":false,
          "experimentalAdapter":true,"reason":"فقط آداپتور آزمایشی dev-watermark متصل است…"}
web /dresses/[id]: 200 | پنل امتحان مجازی: موجود
```

فایل دانلودشده و بازبینی‌شده از همان خروجی، در `docs/phases/assets/phase7-dev-preview-sample.jpg` نگه داشته شد: نوار بالای تصویر با متن «DEV PREVIEW — NOT REAL AI OUTPUT» به‌وضوح خوانا است. این تصویر عمداً **شبیه عکس واقعی عروس روی لباس نیست**؛ دو تصویر کنار هم هستند.

## ۴) آنچه این فاز **انجام نداد** (بدهی صریح)

1. **هیچ مدل هوش مصنوعی واقعی وصل نشد.** خروجی `dev-watermark` برای هیچ تصمیم تجاری، سفارش یا تبلیغات قابل استفاده نیست.
2. **محدودیت مصرف/اعتبار برای عروس وجود ندارد.** هر کاربر تأییدشده می‌تواند بی‌نهایت درخواست در صف بگذارد؛ سقف روزانه یا اعتبار پیش‌پرداخت لازم است (تصمیم مالک).
3. **سیاست نگه‌داری برای `tryon_requests` و تصاویر نتیجه تعریف نشده است.** عکس عروس ۹۰ روز پاک می‌شود، اما خروجی واترمارک‌دار و رکورد درخواست بی‌پایان می‌مانند.
4. **تعداد تلاش‌ها (`attempts`) در پاسخ API نیست**؛ فقط در دیتابیس است و فعلاً ابزار پشتیبانی برای دیدن آن وجود ندارد.
5. **worker درون همان پروسه API است** (با `SKIP LOCKED` برای چند نمونه امن است، اما صف مرده/DLQ، متریک و هشدار ندارد).
6. **benchmark ۳۰ تا ۵۰ لباس انجام نشده** — بدون provider واقعی، معیار کیفیت وجود ندارد.
7. **آداپتور واقعی باید بررسی کند که در تصویر chehra/اندام عروس بازسازی نشود؟** این یک تصمیم حقوقی/اخلاقی است که فقط مالک می‌تواند بگیرد؛ ساختار فعلی برای هر provider واقعی هم همان `isDevOutput`/`realOutput` را اجباری می‌کند.

## ۵) تصمیم‌های لازم از مالک (بدون این‌ها فاز بعدی جلو نمی‌رود)

| # | تصمیم | چرا الان |
| --- | --- | --- |
| ۱ | کدام provider تجاری واقعی (با توجه به تحریم، جغرافیا و هزینه) | تنها راه تبدیل این صف به قابلیت واقعی |
| ۲ | سقف امتحان مجازی برای هر عروس (مثلاً ۳ در ماه) و پاک‌سازی خودکار درخواست‌ها | جلوگیری از هزینه و سوءاستفاده |
| ۳ | نگه‌داری `tryon_requests` و تصاویر نتیجه: ۳۰/۹۰/۱۸۰ روز | الزام حقوقی/حجم ذخیره‌سازی |
| ۴ | حذف نرم یا سخت عکس و خروجی؛ ثبت audit برای حذف توسط عروس | پاسخ‌گویی و بازرسی |
| ۵ | تعلیق/فعال‌سازی مجدد مزون | در فازهای قبل باز ماند |

## ۶) گام بعدی پیشنهادی
اگر مالک provider را انتخاب کند: اتصال آداپتور واقعی + محدودیت مصرف + benchmark ۳۰ تا ۵۰ لباس + سناریوی شکست provider (timeout، هزینه، خروجی نامعتبر). اگر انتخاب provider به تأخیر بیفتد، فاز بعدی مسیر **رزرو نوبت و مدیریت درخواست مزون** است که به هوش مصنوعی وابسته نیست.
