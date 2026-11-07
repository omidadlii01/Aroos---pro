# Runbook — دیتابیس و migration

## درایورها

| درایور | استفاده | نکته |
| --- | --- | --- |
| `pglite` | local/dev/test | پستگرس واقعی WASM درون‌فرایندی؛ داده در `PGLITE_DATA_DIR` |
| `postgres` | staging/production | `DATABASE_URL` لازم؛ در production فقط این مجاز است |

## migrationها

- فایل‌ها: `apps/api/src/database/migrations/NNNN_name.sql` (ترتیب شماره‌ای).
- هر فایل با `BEGIN…COMMIT` و ثبت checksum در `schema_migrations` اجرا می‌شود.
- **قاعده:** فایل اجراشده هرگز ویرایش نشود؛ تغییر جدید = فایل جدید.
- اجرا: `npm run db:migrate` (یا خودکار در boot با `DB_AUTO_MIGRATE=true`؛ در production
  پیش‌فرض خاموش است).

## نقش برنامه و RLS (production)

1. مالک جدول‌ها با نقش مهاجر (`bridalos`) می‌سازد.
2. برنامه با نقش `bridalos_app` (`NOSUPERUSER NOBYPASSRLS`) وصل می‌شود — بدون این شرط،
   RLS عملاً اعمال نمی‌شود.
3. در هر تراکنش، برنامه باید `SET LOCAL app.user_id = '<uuid>'` را تنظیم کند تا policyها
   کار کنند (توابع `app_user_id`, `app_is_tenant_member`, `app_owns_boutique`).
   > بدهی: تنظیم خودکار `SET LOCAL` در `SqlRunner` فاز بعد اضافه می‌شود؛ تا آن زمان
   > کنترل اصلی دسترسی همان لایه برنامه است و RLS لایه دوم دفاعی است.

### اعتبارسنجی RLS (نیازمند Docker — در محیط ساخت انجام نشد)

```bash
docker compose -f infra/docker-compose.yml up -d postgres
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('boutiques','memberships','audit_logs')"
# سپس با نقش bridalos_app و app.user_id یک کاربر مزون A، تلاش خواندن مزون B باید ۰ ردیف بدهد
```

## backup/restore

در این فاز انجام نشده (بدون محیط پایدار). حداقل قبل از staging:
`pg_dump --format=custom` روزانه + drill بازیابی مستند در `docs/runbooks/restore-drill.md`.
