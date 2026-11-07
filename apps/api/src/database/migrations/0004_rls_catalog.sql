-- 0004_rls_catalog.sql — RLS برای کاتالوگ و رسانه (لایه دوم دفاعی)
--
-- همان هشدار 0002_rls معتبر است: با نقش owner/superuser اعمال نمی‌شود.

CREATE OR REPLACE FUNCTION app_dress_published(target_dress uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dresses d
    JOIN boutiques b ON b.id = d.boutique_id
    WHERE d.id = target_dress
      AND d.status = 'published'
      AND b.status = 'approved'
  )
$$;

ALTER TABLE dresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dress_media ENABLE ROW LEVEL SECURITY;

-- خواندن لباس: اعضای مزون یا لباس منتشرشده مزون تأییدشده (کاتالوگ عمومی)
DROP POLICY IF EXISTS dresses_select ON dresses;
CREATE POLICY dresses_select ON dresses FOR SELECT
  USING (app_is_tenant_member(boutique_id) OR app_dress_published(id));

DROP POLICY IF EXISTS dresses_insert ON dresses;
CREATE POLICY dresses_insert ON dresses FOR INSERT
  WITH CHECK (app_is_tenant_member(boutique_id));

DROP POLICY IF EXISTS dresses_update ON dresses;
CREATE POLICY dresses_update ON dresses FOR UPDATE
  USING (app_is_tenant_member(boutique_id))
  WITH CHECK (app_is_tenant_member(boutique_id));

DROP POLICY IF EXISTS dresses_delete ON dresses;
CREATE POLICY dresses_delete ON dresses FOR DELETE
  USING (app_is_tenant_member(boutique_id));

-- رسانه: فقط اعضای مزون یا تصویر لباس منتشرشده
DROP POLICY IF EXISTS dress_media_select ON dress_media;
CREATE POLICY dress_media_select ON dress_media FOR SELECT
  USING (app_is_tenant_member(boutique_id) OR app_dress_published(dress_id));

DROP POLICY IF EXISTS dress_media_write ON dress_media;
CREATE POLICY dress_media_write ON dress_media FOR ALL
  USING (app_is_tenant_member(boutique_id))
  WITH CHECK (app_is_tenant_member(boutique_id));
