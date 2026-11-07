# BridalOS

پلتفرم فارسی (RTL-first) برای بازار و عملیات مزون‌های لباس عروس: کشف مزون و کالکشن،
پرو مجازی، کمد و مقایسه، رزرو حضوری، CRM و داشبورد مزون.

> **وضعیت صادقانه:** این مخزن در شروع خالی بود و از صفر ساخته شده است. آنچه الان کار
> می‌کند: هویت با کد یکبارمصرف، ثبت مزون، عضویت و جداسازی داده چندمستاجری، پنل مالک
> مزون، سلامت/متریک پایه و آداپتور آزمایشی سرویس AI. آنچه **هنوز کار نمی‌کند**:
> پیامک واقعی، پرداخت، پرو AI واقعی، رزرو، کاتالوگ لباس. هیچ‌کدام از این‌ها در UI
> «فعال» نشان داده نمی‌شوند.

سند مرجع: `BridalOS_AI_Build_Execution_Plan_FA.docx` (در Drive مالک). گزارش ممیزی و
وضعیت فازها: [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) و
[`docs/phases/PHASE-0-1-REPORT.md`](docs/phases/PHASE-0-1-REPORT.md).

## وضعیت قابلیت‌ها (به‌روزشده: ۱۴۰۵/۰۸/۱۶)

| قابلیت | وضعیت | یادداشت |
| --- | --- | --- |
| ورود با OTP موبایل | ✅ کار می‌کند | آداپتور پیامک **توسعه** (کد در لاگ/پاسخ با برچسب آزمایشی) |
| نقش‌ها، عضویت مزون، audit trail | ✅ کار می‌کند | کنترل دسترسی سمت سرور با Guard و کوئری tenant-scoped |
| ثبت مزون، ویرایش، ارسال برای بررسی | ✅ کار می‌کند | وضعیت اولیه `draft`، تأیید نهایی فعلاً دستی است |
| جداسازی داده بین مزون‌ها | ✅ تست منفی دارد | RLS هم در migration هست؛ اعتبارسنجی اجرایی نیازمند Postgres غیر-superuser |
| پنل وب مالک مزون | ✅ کار می‌کند | RTL، حالت‌های loading/empty/error/success |
| سرویس AI | ⛔ مسدود (دسترسی) | فقط آداپتور آزمایشی watermark‌دار، `is_mock: true` |
| پیامک واقعی | ⛔ مسدود (دسترسی) | نیازمند حساب تجاری و کلید؛ `SMS_DRIVER` غیر `dev` خطا می‌دهد |
| پرداخت/اشتراک | ⏳ فاز ۱۳ | هیچ تراکنش مالی‌ای وجود ندارد |
| رزرو، کاتالوگ لباس، White Label | ⏳ فازهای ۴–۱۴ | — |

## ساختار مخزن

```
apps/web          Next.js 16 (App Router) — فارسی/RTL، Tailwind v4، PWA manifest
apps/api          NestJS 12 (ESM، modular monolith) + PostgreSQL
services/ai       FastAPI — قرارداد ارائه‌دهنده + آداپتور آزمایشی watermark
packages/contracts قراردادهای مشترک: zod، پول (ریال/تومان)، تاریخ شمسی، نقش‌ها
packages/ui       اجزای پایه RTL (Button/Field/Alert/Badge/StatusDot)
infra             docker-compose پستگرس/Redis/MinIO + نقش برنامه برای RLS
docs              ممیزی، معماری، ADR، محصول، runbook، امنیت، API
tests/e2e         رزرو شده برای E2E مرورگر (Playwright) — هنوز خالی/در انتظار
```

## اجرای محلی (بدون Docker هم کار می‌کند)

نیاز: Node.js 22+ و Python 3.11+.

```bash
cp env.example .env            # هیچ مقدار محرمانه‌ای در مخزن نیست
npm install
npm run build:contracts        # بسته قراردادها باید یک‌بار build شود

# API — پیش‌فرض DB_DRIVER=pglite (پستگرس واقعی درون‌فرایندی، بدون Docker)
npm run dev:api                # http://localhost:4000/healthz

# وب
npm run dev:web                # http://localhost:3000

# سرویس AI (اختیاری)
python3 -m venv services/ai/.venv
services/ai/.venv/bin/pip install -r services/ai/requirements-dev.txt
services/ai/.venv/bin/uvicorn app.main:app --app-dir services/ai --port 8000
```

ورود: شماره موبایل را در `/login` وارد کنید. در محیط توسعه، کد ۵ رقمی هم در لاگ API و
هم در پاسخ با برچسب «حالت توسعه» نمایش داده می‌شود (در production ممنوع است و
اعتبارسنجی تنظیمات جلوی آن را می‌گیرد).

### پستگرس واقعی (staging/production)

```bash
docker compose -f infra/docker-compose.yml up -d postgres
# در .env:
#   DB_DRIVER=postgres
#   DATABASE_URL=postgresql://bridalos:...@localhost:5432/bridalos
npm run db:migrate
```

## دستورها

| دستور | کار |
| --- | --- |
| `npm run typecheck` | بررسی نوع در همه بسته‌ها |
| `npm test` | تست قراردادها + تست یکپارچه API روی Postgres درون‌فرایندی |
| `npm run lint` | ESLint |
| `npm run build` | build کامل |
| `npm run db:migrate` | اجرای migrationها |
| `npm run db:seed:dev` | داده نمایشی برچسب‌دار (در production ممنوع) |
| `npm run test:ai` | pytest سرویس AI |

## قواعد همیشگی این مخزن

1. هیچ دکمه/صفحه‌ای بدون رفتار واقعی، اعتبارسنجی و پیام خطا ساخته نمی‌شود.
2. هیچ موفقیتی جعل نمی‌شود: تست، API، پیامک، پرداخت و استقرار فقط با شاهد واقعی.
3. راز فقط از متغیر محیطی؛ `env.example` بدون مقدار محرمانه.
4. داده یا migration مخرب، deploy و هزینه بدون تأیید صریح مالک انجام نمی‌شود.
5. تصاویر کاربران приват‌اند؛ URL امضاشده کوتاه‌عمر (فاز ۶).
6. خروجی AI هرگز «تضمین فیت/سایز» نیست و برچسب آن در UI و دیتابیس حفظ می‌شود.
