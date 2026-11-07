# گزارش فاز ۰ و ۱ (و بخشی از فازهای ۲ و ۳)

- **تاریخ:** ۱۴۰۵/۰۸/۱۶ — 2026-11-07
- **شاخه:** `arena/25a9d6ee-aroos-pro` (از `main@fb86759`)
- **مبنا:** سند `BridalOS_AI_Build_Execution_Plan_FA.docx` + پرامپت مالک
- **خلاصه:** مخزن خالی بود؛ ساختار پیشنهادی سند ساخته شد، ممیزی انجام شد و یک مسیر
  عمودی واقعی (ورود → مزون → عضویت → جداسازی tenant) با تست و شاهد HTTP تحویل شد.

---

## ۱. فاز ۰ — ممیزی و آماده‌سازی

| مورد | نتیجه |
| --- | --- |
| مخزن، branch، README | تنها README ۱۳ بایتی؛ هیچ کد/CI/migration/تست |
| package manager | تعیین شد: npm workspaces (بدون pnpm در محیط) |
| داده واقعی/production | وجود ندارد؛ هیچ migration یا اتصالی روی production اجرا نشد |
| محیط | Node 22 ✅، Python 3.11 ✅، **Docker ❌**، **Postgres server ❌**، Redis ❌ |
| خروجی | `docs/AUDIT_REPORT.md`، `docs/architecture/overview.md`، ۴ ADR، `env.example`، `.gitignore`، CI |

- ✅ سند مرجع خوانده شد (بخش‌های قابل بازیابی از کانکتور)؛ بریدگی بخش ۳ در گزارش ممیزی
  صریحاً ثبت شد.
- ✅ هیچ عملیات مخرب، حذف داده، هزینه یا deploy انجام نشد (هیچ محیطی وجود نداشت).

## ۲. فاز ۱ — تثبیت نیازمندی و UX

- ✅ `docs/product/journeys.md` (J1–J4 با وضعیت واقعی هر گام)
- ✅ `docs/product/route-map.md`، `data-dictionary.md`، `state-inventory.md`، `acceptance-criteria.md`
- ✅ design tokens در `apps/web/src/app/globals.css` (رنگ‌های برند، گردی، سایه، فونت Vazirmatn)
- ✅ اجزای پایه RTL در `packages/ui` (Button/Field/Alert/Badge/StatusDot) با پشتیبانی
  `aria-busy`، `aria-invalid`، `aria-describedby`، `role="alert"`
- ✅ حالت‌های loading/empty/error/success/disabled در `/`، `/login`، `/dashboard`
- ⛔ بازبینی UX با کاربر واقعی مزون: **Blocked** (نیازمند جلسه با مالک)

## ۳. فاز ۲ — Foundation (بخشی)

- ✅ ESLint 9 (flat config) + Prettier + `tsconfig` مشترک؛ lint بدون خطا
- ✅ CI (`.github/workflows/ci.yml`): npm ci → lint → typecheck → test → build؛ job جدا
  برای pytest؛ job سبک اسکن فایل env/کلید
- ✅ لاگ ساخت‌یافته JSON با `requestId` (AsyncLocalStorage) + redaction کلیدهای حساس
- ✅ قالب خطای یکدست `{ error: { code, message, requestId, details? } }`
- ✅ اعتبارسنجی تنظیمات با fail-fast + قواعد production (راز ≥۳۲ نویسه، بدون echo کد،
  فقط `DB_DRIVER=postgres`، CORS فقط https، آداپتور پیامک ناشناس خطا)
- ✅ `/healthz` و `/readyz` با ping واقعی دیتابیس؛ `/api/v1/meta` برای وضعیت شفاف
- ✅ migration نسخه‌دار با checksum (جلوگیری از تغییر migration اجراشده)
- ⛔ Docker/local environment: **Blocked** (Docker در محیط نیست؛ `infra/docker-compose.yml`
  نوشته شد اما اجرا/تأیید نشد)
- 🟡 OpenAPI خودکار: انجام نشده؛ `docs/api/endpoints.md` دستی

## ۴. فاز ۳ — هویت و چندمستاجری (بخشی)

- ✅ OTP موبایل: کد ۵ رقمی، HMAC-SHA256 با فلفل، انقضا، سقف تلاش، cooldown، سقف ساعتی
- ✅ آداپتور پیامک **توسعه** (`dev-log`) با برچسب صریح؛ `SMS_DRIVER≠dev` → خطای پیکربندی
- ✅ صدور JWT (HS256، ۳۰ دقیقه) با `roles` و `activeBoutiqueId`
- ✅ انتخاب مزون فعال (`POST /auth/tenant`) با بررسی عضویت سمت سرور
- ✅ `TenantGuard` + `@RequireTenantRole` با سلسله‌مراتب نقش
- ✅ `audit_logs` برای ایجاد/ویرایش/ارسال به بررسی مزون با `request_id`
- ✅ تست منفی جداسازی tenant (خواندن/ویرایش/ارسال بررسی مزون دیگر → ۴۰۴ بدون افشای وجود)
- ❌ دعوت کارمند، لغو دسترسی، تغییر نقش → **گام بعد**

## ۵. فایل‌ها و ماژول‌های اصلی

```
packages/contracts/src/{phone,money,jalali,otp,roles,errors,schemas,digits}.ts  (+۴ فایل تست)
packages/ui/src/{button,field,alert,badge,status-dot}.tsx
apps/api/src/config/{config.ts,config.module.ts}
apps/api/src/common/{logger.ts,logger.module.ts,errors.ts,validation.ts,all-exceptions.filter.ts,request-id.middleware.ts}
apps/api/src/database/{sql.ts,migrator.ts,database.module.ts,cli/migrate.ts,cli/seed-dev.ts}
apps/api/src/database/migrations/{0001_init.sql,0002_rls.sql}
apps/api/src/auth/{otp.service,auth.service,token.service,dev-sms.adapter,sms.port,jwt-auth.guard,current-user.decorator,auth.controller,auth.module}.ts
apps/api/src/tenants/{tenant.guard,tenants.module}.ts
apps/api/src/boutiques/{boutiques.service,boutiques.controller,boutiques.module}.ts
apps/api/src/audit/{audit.service,audit.module}.ts
apps/api/src/health/{health.controller,health.module}.ts
apps/api/src/{app.module.ts,main.ts}
apps/api/src/__tests__/{auth,boutiques-tenant,health-and-migrations,config}.test.ts
apps/web/src/app/{layout.tsx,page.tsx,globals.css,login/page.tsx,dashboard/page.tsx}
apps/web/src/{lib/api.ts,lib/session.ts,lib/cities.ts,components/site-header.tsx}
apps/web/{next.config.ts,postcss.config.mjs,public/manifest.webmanifest}
services/ai/app/{main.py,providers/base.py,providers/dev_watermark.py} + tests/test_api.py
infra/docker-compose.yml · infra/postgres/init/01-app-role.sql
docs/* · .github/workflows/ci.yml · env.example · README.md
```

## ۶. migrationها و تغییر دیتابیس

| فایل | محتوا |
| --- | --- |
| `0001_init.sql` | جداول `users`, `boutiques`, `memberships`, `otp_challenges`, `audit_logs` + CHECKها + ایندکس‌ها |
| `0002_rls.sql` | توابع `app_user_id/app_is_tenant_member/app_owns_boutique`، فعال‌سازی RLS روی `boutiques`/`memberships`/`audit_logs` و policyها |

- migrationها **فقط** روی دیتابیس‌های توسعه/تست (pglite) اجرا شدند.
- هیچ migration مخربی وجود ندارد؛ rollback = حذف دیتابیس توسعه (بدون داده واقعی).
- seed نمایشی (`npm run db:seed:dev`) با پیشوند «[داده آزمایشی]» و شماره‌های ۰۹۰۰۰۰۰۰۰۰x
  و ممنوعیت اجرا در production.

## ۷. تست‌های اجراشده (خروجی واقعی)

```
$ npm run lint        → eslint . (بدون خطا)
$ npm run typecheck   → contracts + api + web، بدون خطا
$ npm test
  @bridalos/contracts  Test Files 4 passed | Tests 38 passed
  @bridalos/api        Test Files 4 passed | Tests 39 passed
$ npm run build       → api (tsc) + web (next build، ۵ صفحه، بدون خطا)
$ bash scripts/test-ai.sh → 6 passed (pytest)
```

پوشش رفتاری تست‌های API (روی پستگرس درون‌فرایندی، بدون mock دیتابیس):
OTP request/verify، کد اشتباه، سقف تلاش، کد مصرف‌شده، کد منقضی، هش‌شدن کد، cooldown،
`/me`، توکن دستکاری‌شده، ساخت مزون، audit، «مزون‌های من»، جداسازی tenant (۳ جهت)،
`TENANT_REQUIRED`، انتخاب مزون، چرخه وضعیت، نشانی تکراری، اعتبارسنجی، approved در برابر
draft، health/ready/meta/404، ثبت migration، idempotency، وجود policyها.

شاهد HTTP دستی (سرور واقعی روی :4000): `/healthz` → `{"status":"ok",...}`،
`/api/v1/meta` → `payments:disabled`, `ai:not-configured`, `sms:blocked`،
چرخه OTP → توکن → ساخت مزون → `mine` (هر سه با ۲۰۰).

## ۸. معیارهای پذیرش

| معیار | وضعیت |
| --- | --- |
| رفتار از UI و API قابل اجرا | ✅ Pass (ورود، ساخت مزون، انتخاب مزون، ارسال برای بررسی) |
| validation + حالت‌های UI | ✅ Pass |
| مجوز و مرز tenant سمت سرور | ✅ Pass (تست منفی دارد) |
| migration و seed نسخه‌دار | ✅ Pass |
| تست متناسب اجراشده | ✅ Pass (۸۳ تست) |
| typecheck/lint/build | ✅ Pass |
| لاگ/متریک و مدیریت خطا | ✅ Pass (healthz، لاگ ساخت‌یافته، فیلتر خطا) |
| مستندات | ✅ Pass (ممیزی، ADR، محصول، runbook، API) |
| بدون secret/PII در کد و لاگ | ✅ Pass (redaction، ماسک شماره، اسکن سبک CI) |
| فارسی/RTL در اندازه موبایل | ✅ Pass (طراحی موبایل‌اول؛ بازبینی چشمی با اسکرین‌شات انجام نشده) |
| شاهد تست واقعی | ✅ Pass (خروجی بالا) |
| Docker/Postgres واقعی | ⛔ **Blocked** (ابزار در محیط نیست) |
| RLS اجرایی | ⛔ **Blocked** (نقش superuser در pglite؛ تأییدیه policyها Pass است) |
| پیامک واقعی / AI واقعی / پرداخت | ⛔ **Blocked** (بدون کلید و تأیید مالک) |
| E2E مرورگر (Playwright) | ❌ Fail (انجام نشده؛ `tests/e2e` رزرو شده) |
| OpenAPI خودکار | ❌ Fail (سند دستی) |

## ۹. ریسک‌ها و بدهی فنی

1. توکن در `sessionStorage` → انتقال به کوکی HttpOnly + CSRF (ADR-0004، فاز ۱۶).
2. RLS بدون `SET LOCAL app.user_id` خودکار؛ لایه برنامه فعلاً کنترل اصلی است.
3. rate limit درون‌دیتابیسی (بدون Redis) — برای تک‌نمونه کافی.
4. نبود E2E مرورگر و تست دسترس‌پذیری خودکار.
5. `cities` فهرست ثابت در وب است (بدون جدول/SEO).
6. jobs پاک‌سازی رکوردهای OTP منقضی تعریف نشده.
7. `tests/e2e` خالی است و Playwright نصب نشده.

## ۱۰. دسترسی‌ها/کلیدهای لازم از مالک

- پیامک: حساب تجاری، الگوی تأییدشده، کلید API.
- AI: ارائه‌دهنده + کلید + مجوز تجاری + سیاست داده (برای benchmark فاز ۷).
- ذخیره‌سازی S3/MinIO در محیط پایدار و قواعد نگه‌داری/حذف تصویر.
- دامنه و میزبان staging برای اجرای Docker و اعتبارسنجی RLS.
- درگاه پرداخت sandbox (فاز ۱۳).

## ۱۱. تصمیم‌های نیازمند تأیید انسانی

1. تأیید ADR-0001..0004 (Nest ESM، SQL-first + PGlite، مدل OTP/tenant، نگه‌داری توکن).
2. سیاست نگه‌داری داده: مدت نگه‌داری `otp_challenges`/`audit_logs`.
3. متن و نسخه رضایت‌نامه تصویر (فاز ۶) — باید با مشاور حقوقی بررسی شود.
4. آیا «تأیید مزون» در فاز بعد دستی توسط ادمین انجام شود یا endpoint + UI ادمین ساخته شود.
5. اولویت: فاز ۴ (کاتالوگ + آپلود) یا فاز ۳ (دعوت کارمند/نقش‌ها)؟

## ۱۲. پیشنهاد گام بعد

1. **فاز ۳ تکمیلی:** دعوت کارمند، لغو دسترسی، تغییر نقش + تست‌های منفی RBAC
   (کوچک، پرریسک‌کم، همین زیرساخت).
2. **فاز ۴:** CRUD لباس + آپلود خصوصی تصویر با presigned URL و consent نسخه‌دار
   (پیش‌نیاز مستقیم مسیر عمودی «مزون → لباس → پرو → رزرو»).
3. اجرای `infra/docker-compose.yml` روی ماشین دارای Docker + اعتبارسنجی RLS با نقش
   `bridalos_app` به‌عنوان گیت قبل از staging.
