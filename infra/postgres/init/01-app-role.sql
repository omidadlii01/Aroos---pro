-- نقش برنامه برای production/staging: غیر از owner جدول‌ها تا RLS اعمال شود.
-- ⚠️ رمز باید از متغیر محیطی/مدیریت راز تأمین شود و در مخزن نباشد.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bridalos_app') THEN
    CREATE ROLE bridalos_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO bridalos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bridalos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bridalos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bridalos_app;
