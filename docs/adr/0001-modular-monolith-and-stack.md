# ADR-0001 — Modular monolith با NestJS/Next و تفکیک سرویس AI

- **وضعیت:** پذیرفته‌شده (2026-11-07)
- **زمینه:** مخزن خالی بود؛ سند مرجع، پشته Next.js + NestJS + FastAPI + Postgres را
  پیش‌فرض گذاشته و صریحاً «Microservices کامل نساز» گفته است.
- **تصمیم:** `apps/web` (Next.js 16)، `apps/api` (NestJS 12, ESM، ماژول‌های دامنه‌ای)،
  `services/ai` (FastAPI مستقل)، `packages/contracts` (نوع/اعتبارسنجی مشترک)،
  `packages/ui` (اجزای RTL).
- **دلیل:** یک تیم کوچک؛ تراکنش‌های مالی/رزرو در آینده نیاز به اتمیک بودن دارد و تقسیم
  زودهنگام مانع می‌شود. سرویس AI ماهیت CPU/GPU-bound و وابسته به ارائه‌دهنده بیرونی دارد.
- **پیامدها:** Nest 12 فقط ESM است → `"type": "module"` و `module: nodenext`.
  DI با توکن صریح (`@Inject`) انجام می‌شود تا به `emitDecoratorMetadata` وابسته نباشد
  (tsx/esbuild آن را تولید نمی‌کند).
- **جایگزین‌های رد‌شده:** Fastify تنها (فاصله از سند)، میکروسرویس کامل (پیچیدگی بی‌بازده).
