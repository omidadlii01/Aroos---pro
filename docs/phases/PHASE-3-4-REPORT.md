# گزارش فاز ۳ و ۴ (و پایه فاز ۶): مدیریت کارکنان، کاتالوگ لباس، رسانه خصوصی

- **تاریخ:** ۲۰۲۶-۱۱-۰۷
- **شاخه:** `arena/25a9d6ee-aroos-pro`
- **دامنه:** مدیریت نقش‌ها در مزون (فاز ۳)، کاتالوگ لباس و کاتالوگ عمومی (فاز ۴)، پیاده‌سازی پایه رسانه خصوصی با URL امضاشده (پیش‌نیاز فاز ۶)

## ۱) کارهای انجام‌شده

### قراردادهای مشترک (`packages/contracts`)
- `DRESS_STATUSES` (`draft`/`pending_review`/`published`/`archived`) با برچسب فارسی، `DRESS_CATEGORIES` (۷ دسته) و `DRESS_ATTRIBUTE_KEYS` با برچسب فارسی
- `MEDIA_MAX_BYTES` (۸MB)، `MEDIA_ALLOWED_TYPES` (`image/jpeg|png|webp`)
- اسکیماها: `MemberInviteSchema`، `MemberRoleUpdateSchema`، `DressCreateSchema` (قیمت ورودی **تومان**)، `DressUpdateSchema`، `DressListQuerySchema`، `PublicCatalogQuerySchema`
- تبدیل `tomanToRial` و `formatToman` برای نمایش تومان با ارقام فارسی و جداکننده هزارگان

### دیتابیس
- `0003_catalog.sql`: `dresses` (کد یکتا در هر مزون، قیمت `bigint` به ریال، وضعیت با CHECK، `published_at`)، `dress_media` (چکسام SHA256، `rights_attested_at`، حذف نرم)، ستون‌های `invited_at/invited_by/accepted_at/updated_at` در `memberships`
- `0004_rls_catalog.sql`: RLS برای `dresses`/`dress_media` + تابع `app_dress_published`

### API
| ماژول | مسیر | توضیح |
| --- | --- | --- |
| `boutiques/members` | `GET/POST invite/PATCH :userId/DELETE :userId` | فقط مالک می‌نویسد؛ مالک و خودِ کاربر قابل لغو نیست؛ همه شماره‌ها ماسک‌شده؛ `smsSent:false` + یادداشت شفاف |
| `dresses` | list/get/create/update/publish/archive + `POST :id/media` + `DELETE :id/media/:mediaId` | tenant-scoped؛ انتشار فقط مالک؛ الزامات انتشار با پیام فارسی دقیق؛ لباس منتشرشده غیرقابل ویرایش |
| `media` | `GET /media/:id?expires&token` | HMAC-SHA256، TTL پیش‌فرض ۳۰۰s، `Cache-Control: private` |
| `public` | `/public/dresses`, `/public/dresses/:id`, `/public/boutiques/:slug`, `/public/cities` | فقط `published` از مزون `approved` |
| `app-config` | `configureHttp` مشترک main/tests | بدنه خام فقط روی `POST /api/v1/dresses/:id/media` (۸MB) |

### وب (Next.js، RTL)
- `/boutiques` کاتالوگ عمومی با فیلتر واقعی شهر/دسته/جست‌وجو/سقف قیمت، شمارش نتایج، حالت خالی و حالت خطای صریح
- `/dresses/[id]` جزئیات لباس + `/boutiques/[slug]` صفحه مزون
- `/dashboard/dresses`: ثبت لباس، بارگذاری تصویر با تیک تأیید حق انتشار، انتشار، بایگانی، نمایش وضعیت‌ها
- `/dashboard/team`: دعوت کارمند، تغییر نقش، لغو دسترسی، نمایش شماره ماسک‌شده و پیام «پیامک ارسال نشد»
- لینک «کاتالوگ لباس» در هدر و لینک‌های «لباس‌ها»/«کارکنان» در پنل

## ۲) تست‌های واقعاً اجراشده

| مجموعه | تعداد | نتیجه |
| --- | --- | --- |
| `packages/contracts` (vitest) | ۳۸ | ✅ قبول |
| `apps/api` (vitest، ۶ فایل) | ۶۷ | ✅ قبول |
| ↳ `members.test.ts` | ۹ | ✅ قبول |
| ↳ `catalog.test.ts` (جدید) | ۱۹ | ✅ قبول |
| `services/ai` (pytest) | ۶ | ✅ قبول |
| `npm run lint` (ریشه) | — | ✅ بدون خطا |
| `npm run typecheck` (ریشه) | — | ✅ بدون خطا |
| `npm run build` (ریشه) | — | ✅ موفق (۹ مسیر Next) |

پوشش `catalog.test.ts`: CRUD، کد تکراری ۴۰۹، بازه قیمت نامعتبر، جداسازی tenant (خواندن/ویرایش/بارگذاری → ۴۰۴)، رد بارگذاری بدون تأیید حقوق، رد MIME جعلی، حذف EXIF، URL امضا معتبر/دستکاری‌شده/منقضی/بدون توکن، حذف تصویر و بی‌اثر شدن لینک، گیت‌های انتشار (تصویر/مزون تأییدنشده)، حضور در کاتالوگ عمومی و حذف پس از بایگانی، فیلترهای واقعی، ممنوعیت‌های `boutique_staff`.

## ۳) تست دود روی سرورهای واقعی (:4000 و :3000)

اجرای واقعی روی PGlite با داده نمایشی برچسب‌خورده:

```
otp.request: 200 | devCode: true | challenge: true
otp.verify: 200 09000000010
boutique: [داده آزمایشی] مزون اسموک | status: approved
create dress: 201 SMOKE-51635
upload: 201 url ok
publish: 200 published
public catalog total: 2 | contains new dress: true
signed media fetch: 200 image/jpeg bytes: 1339
anon dresses list: 401
web /boutiques: 200 | has dress name: true | has signed media: true
web /dresses/[id]: 200
```

همچنین: `/boutiques/smoke-approved` → ۲۰۰، `/dashboard/dresses` → ۲۰۰، `/dashboard/team` → ۲۰۰، و فیلتر `priceMaxToman=1000` حالت خالی را نشان می‌دهد.

## ۴) معیارهای پذیرش

| معیار | وضعیت | توضیح |
| --- | --- | --- |
| مالک می‌تواند کارمند دعوت/تغییر نقش/لغو کند و همه در audit ثبت شود | ✅ Pass | ۹ تست؛ audit برای تغییر نقش و لغو |
| کارمند به داده مزون دسترسی دارد و پس از لغو ۴۰۳ می‌گیرد | ✅ Pass | تست «لغو دسترسی…» با توکن مزون‌دار قبلی |
| شماره کامل موبایل در هیچ پاسخ عضویت لو نمی‌رود | ✅ Pass | `maskMobile` + تست |
| CRUD لباس با جداسازی tenant | ✅ Pass | ۱۹ تست |
| انتشار با گیت‌های کامل (توضیح، قیمت، تصویر، تأیید مزون) | ✅ Pass | پیام فارسی دقیق برای هر گیت |
| تصاویر خصوصی و فقط با URL کوتاه‌عمر | ✅ Pass | HMAC + TTL + تست دستکاری/انقضا |
| EXIF/GPS حذف می‌شود و MIME جعلی رد می‌شود | ✅ Pass | بازکدگذاری `sharp` |
| کاتالوگ عمومی فقط published+approved | ✅ Pass | API و صفحه واقعی |
| UI و API هر دو موجود و متصل اند | ✅ Pass | صفحات وب + تست دود |
| تأیید مزون توسط ادمین از طریق API | ⛔ Blocked | ماژول admin در فاز ۵ ساخته می‌شود؛ در تست‌ها از runner مستقیم استفاده شده |
| ذخیره‌سازی S3/MinIO | ⛔ Blocked by access | نیازمند حساب/کلید؛ آداپتور `MediaStorage` آماده جایگزینی |
| ارسال پیامک دعوت | ⛔ Blocked by access | آداپتور dev؛ پاسخ صریح `smsSent:false` |
| تست E2E خودکار مرورگر (Playwright) | ⛔ انجام‌نشده | فقط تست دود HTTP؛ در فاز ۱۶ |

## ۵) ریسک‌ها و بدهی فنی

1. **بدون آداپتور ابری رسانه:** `LocalMediaStorage` در production خطا می‌دهد (طراحی‌شده). استقرار واقعی تا پیاده‌سازی S3 ممکن نیست.
2. **کش تصویر:** لینک‌های کوتاه‌عمر با کش CDN ناسازگارند؛ در استقرار باید `private` بماند یا CDN با همان امضا یکپارچه شود.
3. **`sharp` در محیط تست:** هر فایل تست PGlite جدا می‌سازد؛ نبود `abortOnError:false` باعث SIGABRT گمراه‌کننده می‌شد — اکنون در helper تنظیم شده (ورک‌های vitest هنوز هر فایل را جدا اجرا می‌کنند و مصرف حافظه باید در CI پایش شود).
4. **ویرایش لباس منتشرشده ممنوع است** (تصمیم آگاهانه برای حفظ تاریخچه)؛ اگر مالک بخواهد قیمت را تغییر دهد، مسیر «بایگانی + نسخه جدید» است. UI این را توضیح نمی‌دهد و باید در فاز بعد پیام راهنما اضافه شود.
5. **کارکنان صفحه اختصاصی ندارند:** کارمند با توکن مزون‌دار وارد می‌شود اما UI تفاوت نقش را فقط با غیرفعال کردن دکمه‌ها نشان می‌دهد؛ سرور مرجع نهایی است.

## ۶) دسترسی‌ها/کلیدهای موردنیاز

- `MEDIA_SIGNING_SECRET` (≥۳۲ نویسه) برای استقرار — فعلاً موقت تصادفی
- اعتبار S3/MinIO برای فعال‌سازی آداپتور ابری
- اعتبار پنل پیامک برای دعوت کارکنان و OTP واقعی

## ۷) تصمیم‌های نیازمند تأیید مالک

1. آیا ویرایش لباس منتشرشده باید همیشه ممنوع بماند (نسخه‌بندی) یا ویرایش قیمت مجاز باشد؟
2. سیاست نگه‌داری تصاویر بایگانی‌شده: چند روز فایل فیزیکی نگه داشته شود؟
3. تأیید می‌کنید که نسخه‌بندی لباس (نسخه جدید از لباس بایگانی‌شده) در فاز ۵ انجام شود؟

## ۸) گام بعدی پیشنهادی

فاز ۵ (پنل ادمین پلتفرم): تأیید/رد مزون، فهرست مزون‌های در انتظار، گزارش فعالیت — تا زنجیره اولویت‌دار E2E («مزون ساخته و توسط ادمین تأیید می‌شود») از طریق API واقعی کامل شود.
