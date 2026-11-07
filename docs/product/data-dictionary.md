# Data dictionary (فاز ۱)

قواعد عمومی: زمان‌ها `timestamptz` (UTC)؛ نمایش شمسی در UI. مبلغ پول: عدد صحیح **ریال**
(`bigint` در آینده برای مبالغ بزرگ؛ فعلاً `integer` کافی است و در فاز ۱۳ بازبینی می‌شود).

## users

| ستون | نوع | قاعده |
| --- | --- | --- |
| `id` | uuid | PK، `gen_random_uuid()` |
| `phone` | varchar(11) | یکتا؛ الگوی `^09[0-9]{9}$`؛ همیشه نرمال‌شده |
| `display_name` | text | اختیاری، ۱–۸۰ نویسه |
| `platform_role` | text | `platform_admin` \| `support_agent` \| NULL |
| `created_at` / `updated_at` | timestamptz | پیش‌فرض `now()` |

## boutiques

| ستون | نوع | قاعده |
| --- | --- | --- |
| `id` | uuid | PK |
| `slug` | varchar(48) | یکتا، لاتین `a-z0-9-` |
| `name` | varchar(80) | ۲–۸۰ نویسه |
| `city_slug` | varchar(31) | شناسه شهر (فعلاً فهرست ثابت در وب) |
| `description` | text | ≤ ۲۰۰۰ نویسه |
| `public_phone` | varchar(20) | تلفن ثابت |
| `status` | text | `draft` → `pending_review` → `approved` \| `suspended` |
| `owner_user_id` | uuid | FK users، `ON DELETE RESTRICT` |
| `submitted_at` / `reviewed_at` | timestamptz | رخداد چرخه بررسی |

## memberships

| ستون | نوع | قاعده |
| --- | --- | --- |
| `user_id` + `boutique_id` | uuid | یکتای مرکب |
| `role` | text | `boutique_owner` \| `branch_manager` \| `boutique_staff` |
| `revoked_at` | timestamptz | لغو دسترسی بدون حذف تاریخچه |

## otp_challenges

| ستون | نوع | قاعده |
| --- | --- | --- |
| `phone` | varchar(11) | شماره درخواست‌کننده |
| `code_hash` | text | `HMAC-SHA256(pepper, id:code)` — کد خام ذخیره نمی‌شود |
| `attempts` | integer | ≤ `AUTH_OTP_MAX_ATTEMPTS` |
| `expires_at` | timestamptz | پیش‌فرض ۱۲۰ ثانیه |
| `consumed_at` | timestamptz | یک‌بارمصرف |
| `request_ip_hash` | text | هش IP (PII نیست، اما حذف دوره‌ای در فاز ۱۶) |

## audit_logs

| ستون | نوع | قاعده |
| --- | --- | --- |
| `actor_user_id` | uuid | `ON DELETE SET NULL` (تاریخچه حفظ می‌شود) |
| `tenant_id` | uuid | مزون مرتبط |
| `action` | text | مثل `boutique.created` |
| `entity_type` / `entity_id` | text | موضوع رخداد |
| `request_id` | text | اتصال به لاگ ساخت‌یافته |
| `metadata` | jsonb | فقط فیلدهای غیرحساس |

## انواع مشترک (`packages/contracts`)

- `Role`، `TENANT_ROLES`، `BOUTIQUE_STATUSES`، `DRESS_STATUSES`
- `parseIranianMobile` → `09xxxxxxxxx` + E.164
- `formatToman(rial)` / `parseTomanInput` (ریال ⇄ تومان، بدون float)
- `formatJalaliDate/DateTime`، `parseJalaliInputToDateKey`، `tehranDateKey`
