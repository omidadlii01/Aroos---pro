# گزارش فاز ۵: بررسی مزون توسط مدیر پلتفرم

- **تاریخ:** ۲۰۲۶-۱۱-۰۷
- **شاخه:** `arena/25a9d6ee-aroos-pro`
- **هدف فاز:** بستن حلقه اول زنجیره اولویت‌دار — «مزون ثبت می‌شود، ادمین پلتفرم آن را تأیید می‌کند، سپس مزون لباس منتشر می‌کند» — با API واقعی، بدون دستکاری مستقیم دیتابیس.

## ۱) کارهای انجام‌شده

### دیتابیس
- `0005_admin_review.sql`:
  - ستون‌های `reviewed_by_user_id` و `review_reason` در `boutiques`
  - گسترش CHECK وضعیت به `draft | pending_review | approved | rejected | suspended`
  - CHECK طول دلیل (۵ تا ۵۰۰ نویسه)
  - ایندکس `boutiques (status, submitted_at)` و `dresses (status)`

### قراردادها
- وضعیت `rejected` + برچسب فارسی «ردشده» در `BOUTIQUE_STATUSES`
- `BoutiqueRejectSchema`، `AdminBoutiqueListQuerySchema`، `AdminAuditQuerySchema`
- تایپ‌های `AdminBoutiqueView`، `AdminOverview`، `AdminAuditView`

### API (`src/admin/`)
- `PlatformAdminGuard`: نقش را در **هر درخواست** از دیتابیس می‌خواند (توکن قدیمی پس از تغییر نقش بی‌اثر می‌شود)
- `AdminService`: فهرست بررسی (شماره مالک ماسک‌شده)، تأیید، رد، نمای کلی، گزارش رخدادها
- `AdminController`: `/api/v1/admin/{overview, boutiques, boutiques/:id/approve, boutiques/:id/reject, audit}`
- `BoutiquesService`: ارسال دوباره برای بررسی از وضعیت `rejected` مجاز شد؛ `reviewReason` در پاسخ‌های مزون اضافه شد تا مالک دلیل رد را ببیند

### وب
- `/admin`: نمای کلی (در انتظار/تأییدشده/لباس منتشرشده/کاربران)، فهرست مزون‌ها با فیلتر وضعیت، تأیید با یک کلیک، رد با دلیل اجباری، آخرین رخدادها
- `/dashboard`: نمایش دلیل رد + دکمه «ارسال دوباره برای بررسی» + لینک پنل ادمین برای `platform_admin`
- در صورت نبود نقش، صفحه پیام ۴۰۳ می‌دهد و سرور هم مستقل همان را اعمال می‌کند

## ۲) تست‌های واقعاً اجراشده

| مجموعه | تعداد | نتیجه |
| --- | --- | --- |
| `apps/api` (۷ فایل) | ۷۸ | ✅ قبول |
| ↳ `admin.test.ts` (جدید) | ۱۱ | ✅ قبول |
| `packages/contracts` | ۳۸ | ✅ قبول |
| `services/ai` (pytest) | ۶ | ✅ قبول |
| `npm run lint` / `typecheck` / `build` | — | ✅ پاک/پاک/موفق |

پوشش `admin.test.ts`: ۴۰۳ برای مالک مزون و عروس، ۴۰۱ بدون توکن، فهرست در انتظار با شماره ماسک‌شده و بدون لو رفتن شماره کامل، رد بدون دلیل/با دلیل کوتاه → ۴۰۰، تأیید → `approved` + `reviewedAt` + رکورد audit، تأیید دوباره → ۴۰۹، **انتشار لباس پس از تأیید ادمین و نمایش آن در کاتالوگ عمومی**، رد + مشاهده دلیل توسط مالک + ارسال دوباره، ردشده نمی‌تواند منتشر کند، هم‌خوانی شمارش‌های نمای کلی با دیتابیس، فیلتر نامعتبر → ۴۰۰.

## ۳) اجرای واقعی زنجیره اولویت‌دار روی سرورهای :4000 و :3000

```
owner login roles: bride
boutique created+submitted: draft → pending_review
admin login roles: platform_admin
owner hits /admin/overview: 403
admin sees pending: true | owner phone masked: 0900***30
approve: 201 approved | reviewedAt: true
create dress: 201 CHAIN-05648
upload media: 201 true
publish after admin approval: 200 published
public catalog: 3 dresses | contains new dress: true
signed media: 200 image/jpeg
reject: 201 rejected | reason stored: true
owner sees reason: تصاویر مجوز انتشار ن…
overview: {"draft":2,"pending_review":0,"approved":3,"rejected":1,"suspended":0} | users: 7 | publishedDresses: 3
audit actions: boutique.rejected, boutique.submitted_for_review, boutique.created, dress.published
audit leaks phone: false
web /admin: 200
web /boutiques: 200 | has new dress: true
```

## ۴) معیارهای پذیرش

| معیار | وضعیت | شاهد |
| --- | --- | --- |
| فقط `platform_admin` به پنل ادمین دسترسی دارد | ✅ Pass | ۴۰۳ برای مالک/عروس، بررسی نقش در دیتابیس |
| ادمین می‌تواند مزون در انتظار را تأیید کند | ✅ Pass | تست + اجرای واقعی |
| رد مزون نیازمند دلیل است و دلیل به مالک نشان داده می‌شود | ✅ Pass | ۴۰۰ بدون دلیل؛ `reviewReason` در `/boutiques/mine` |
| تأیید/رد در audit ثبت می‌شود | ✅ Pass | `boutique.approved` / `boutique.rejected` |
| مالک فقط پس از تأیید می‌تواند لباس منتشر کند | ✅ Pass | انتشار ۲۰۰ پس از تأیید؛ ۴۰۹ برای ردشده |
| داده شخصی در پاسخ ادمین و audit لو نمی‌رود | ✅ Pass | شماره ماسک‌شده + تست regex |
| مزون ردشده می‌تواند اصلاح و دوباره ارسال کند | ✅ Pass | تست ارسال دوباره |
| تعلیق مزون (`suspended`) از طریق API | ⛔ انجام‌نشده | وضعیت در DB آماده است؛ endpoint و UI تعلیق در فاز ۱۲ (پنل ادمین کامل) |
| فهرست کاربران/پشتیبانی زمان‌دار (`support_agent`) | ⛔ انجام‌نشده | فاز ۱۲ |

## ۵) ریسک‌ها و بدهی فنی

1. **تعلیق و بازگردانی مزون** پیاده نشده؛ اگر مزون تأییدشده تخلف کند، ادمین فعلاً راه رسمی برای توقف انتشار ندارد (فقط بایگانی لباس توسط مالک).
2. **نبود صفحه‌بندی در UI ادمین:** API صفحه‌بندی دارد اما UI فقط ۲۰ مورد اول را نشان می‌دهد.
3. **`review_reason` فقط برای رد استفاده می‌شود**؛ برای تعلیق باید همان فیلد یا فیلد جداگانه با سیاست نمایش مشخص شود.
4. **audit فقط entity/action را برمی‌گرداند** (بدون نام مزون) تا داده شخصی لو نرود؛ ادمین برای جزئیات باید از فهرست مزون‌ها استفاده کند.
5. اندازهٔ `audit_logs` بدون سیاست نگه‌داری رشد می‌کند؛ در فاز ۱۶ نیاز به job پاک‌سازی/آرشیو دارد.

## ۶) دسترسی‌های موردنیاز

هیچ کلید جدیدی لازم نشد. برای محیط واقعی: کاربر `platform_admin` باید خارج از مسیر خودکار ساخته شود (اسکریپت bootstrap یا seed مدیریتی) — تصمیم نیازمند تأیید مالک.

## ۷) تصمیم‌های نیازمند تأیید مالک

1. آیا ادمین باید بتواند مزون را **تعلیق/فعال** کند (با دلیل) در فاز بعد؟
2. سیاست نگه‌داری `audit_logs` (مثلاً ۱۲ ماه) و نیاز به خروجی CSV برای حسابرسی؟
3. آیا دلیل رد باید قابل ویرایش توسط ادمین پس از ثبت باشد؟

## ۸) گام بعدی پیشنهادی

**فاز ۶: عکس عروس + رضایت‌نامه + کارتابل کاربر** (پیش‌نیاز امتحان مجازی): آپلود خصوصی عکس با رضایت صریح، حذف کامل داده، و آماده‌سازی اتصال به سرویس AI با آداپتور توسعه (بدون ادعای خروجی واقعی).
