# Runbook — اجرای محلی

## پیش‌نیاز
Node 22+، Python 3.11+ (اختیاری برای سرویس AI). Docker اختیاری است.

## گام‌ها

```bash
cp env.example .env
npm install
npm run build:contracts
npm run db:migrate            # روی pglite چون DB_AUTO_MIGRATE هم فعال است
npm run dev:api               # :4000
npm run dev:web               # :3000
```

ورود آزمایشی: هر شماره معتبر `09xxxxxxxxx`. کد در پاسخ `/api/v1/auth/otp/request`
(`devCode`) و در لاگ API دیده می‌شود. برای داده نمایشی: `npm run db:seed:dev`.

## بررسی سلامت

```bash
curl -s localhost:4000/healthz | jq
curl -s localhost:4000/api/v1/meta | jq
```

## مسائل رایج

| نشانه | علت | راه‌حل |
| --- | --- | --- |
| `ConfigError` در استارت | تنظیم نامعتبر/مفقود | پیام خطا را بخوانید؛ در production رازها الزامی‌اند |
| `SMS_DRIVER=... پشتیبانی نمی‌شود` | تلاش برای آداپتور واقعی | فعلاً فقط `SMS_DRIVER=dev`؛ آداپتور واقعی Blocked است |
| پورت اشغال | سرویس قبلی | `API_PORT` / `WEB_PORT` را تغییر دهید |
| «API در دسترس نیست» در صفحه خانه | API بالا نیست | `npm run dev:api` |
| migration checksum error | فایل migration اجراشده ویرایش شده | فایل را برنگردانید؛ migration جدید بسازید |

## پاک‌سازی محیط توسعه

دیتای pglite در `apps/api/.data/pglite` است. حذف آن **داده توسعه را از بین می‌برد**
(همیشه با تأیید و فقط محلی): `rm -rf apps/api/.data/pglite`.
