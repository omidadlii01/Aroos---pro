-- 0006_bride_photos.sql — عکس شخصی عروس (فاز ۶)
--
-- قواعد محصول:
-- ۱) عکس عروس هرگز در فضای عمومی سرو نمی‌شود؛ فقط مالک با URL امضاشده کوتاه‌عمر.
-- ۲) بارگذاری بدون رضایت صریح و نسخه‌دار انجام نمی‌شود (consent_version).
-- ۳) تاریخ حذف خودکار (retention_until) در هر رکورد ذخیره می‌شود تا سیاست نگه‌داری
--    قابل اجرا و قابل حسابرسی باشد.
-- ۴) حذف توسط کاربر همیشه ممکن است و فایل فیزیکی هم پاک می‌شود.

CREATE TABLE IF NOT EXISTS bride_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  content_type varchar(40) NOT NULL,
  byte_size integer NOT NULL,
  width integer,
  height integer,
  checksum_sha256 char(64) NOT NULL,
  consent_version varchar(16) NOT NULL,
  consent_given_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bride_photos_size_positive CHECK (byte_size > 0),
  CONSTRAINT bride_photos_consent_version CHECK (consent_version ~ '^v[0-9]+$'),
  CONSTRAINT bride_photos_retention_after_consent CHECK (retention_until > consent_given_at)
);

CREATE INDEX IF NOT EXISTS bride_photos_user_idx
  ON bride_photos (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bride_photos_retention_idx
  ON bride_photos (retention_until)
  WHERE deleted_at IS NULL;

ALTER TABLE bride_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bride_photos_owner_select ON bride_photos;
CREATE POLICY bride_photos_owner_select ON bride_photos FOR SELECT
  USING (user_id = app_user_id());

DROP POLICY IF EXISTS bride_photos_owner_write ON bride_photos;
CREATE POLICY bride_photos_owner_write ON bride_photos FOR ALL
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
