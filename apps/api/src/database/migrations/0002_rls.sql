-- 0002_rls.sql — کنترل دسترسی سطح سطر (defense in depth)
--
-- ⚠️ نکته مهم و صادقانه:
-- RLS فقط وقتی اعمال می‌شود که برنامه با نقشی غیر از owner جدول و غیر از
-- superuser متصل شود. در local/dev با pglite یا postgres محلی معمولاً نقش
-- superuser استفاده می‌شود و RLS عملاً bypass می‌شود؛ بنابراین کنترل اصلی
-- دسترسی در لایه برنامه است (همه کوئری‌ها tenant-scoped هستند) و این فایل
-- لایه دوم دفاعی برای production است. راهنمای نقش برنامه: docs/runbooks/database.md

-- شناسه کاربر جاری که برنامه در هر تراکنش تنظیم می‌کند:
--   SET LOCAL app.user_id = '<uuid>';
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- توابع SECURITY DEFINER برای جلوگیری از بازگشت بی‌پایان policy‌ها روی memberships
CREATE OR REPLACE FUNCTION app_is_tenant_member(target_boutique uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.boutique_id = target_boutique
      AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND m.revoked_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION app_owns_boutique(target_boutique uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM boutiques b
    WHERE b.id = target_boutique
      AND b.owner_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
$$;

ALTER TABLE boutiques ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boutiques_select ON boutiques;
CREATE POLICY boutiques_select ON boutiques FOR SELECT
  USING (
    status = 'approved'                        -- کاتالوگ عمومی
    OR owner_user_id = app_user_id()
    OR app_is_tenant_member(id)
  );

DROP POLICY IF EXISTS boutiques_insert ON boutiques;
CREATE POLICY boutiques_insert ON boutiques FOR INSERT
  WITH CHECK (owner_user_id = app_user_id());

DROP POLICY IF EXISTS boutiques_update ON boutiques;
CREATE POLICY boutiques_update ON boutiques FOR UPDATE
  USING (owner_user_id = app_user_id())
  WITH CHECK (owner_user_id = app_user_id());

DROP POLICY IF EXISTS memberships_select ON memberships;
CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (user_id = app_user_id() OR app_is_tenant_member(boutique_id));

DROP POLICY IF EXISTS memberships_insert ON memberships;
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK (app_owns_boutique(boutique_id) OR app_is_tenant_member(boutique_id));

DROP POLICY IF EXISTS memberships_update ON memberships;
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (app_owns_boutique(boutique_id))
  WITH CHECK (app_owns_boutique(boutique_id));

DROP POLICY IF EXISTS memberships_delete ON memberships;
CREATE POLICY memberships_delete ON memberships FOR DELETE
  USING (app_owns_boutique(boutique_id));

-- audit_logs: نوشتن برای هر جلسه معتبر مجاز است؛ خواندن فقط با نقش سرویس
-- (گزارش‌های پلتفرم) انجام می‌شود و هیچ policy خواندنی برای نقش برنامه ندارد.
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (app_user_id() IS NOT NULL);

-- otp_challenges: پیش از احراز هویت استفاده می‌شود؛ RLS روی آن فعال نیست و
-- دسترسی فقط از طریق لایه سرویس با کوئری‌های پارامتری و محدود انجام می‌شود.
-- TODO(PHASE-3): افزودن policy مبتنی بر هش IP و نقش سرویس پس از راه‌اندازی Redis.
