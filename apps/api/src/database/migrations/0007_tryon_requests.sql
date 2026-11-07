-- 0007_tryon_requests.sql — درخواست امتحان مجازی (فاز ۶)
--
-- در این فاز سرویس هوش مصنوعی پیکربندی نشده است؛ بنابراین هر درخواست با وضعیت
-- صریح `blocked` ثبت می‌شود تا (۱) هیچ خروجی جعلی نمایش داده نشود و (۲) رفتار
-- کاربر و دلیل مسدود بودن برای پشتیبانی قابل حسابرسی باشد.
-- ستون‌های `provider` و `status` برای اتصال provider واقعی در فاز ۷ آماده‌اند.

CREATE TABLE IF NOT EXISTS tryon_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  photo_id uuid REFERENCES bride_photos (id) ON DELETE SET NULL,
  dress_id uuid NOT NULL REFERENCES dresses (id) ON DELETE CASCADE,
  status text NOT NULL,
  status_reason text,
  provider text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tryon_status_check CHECK (
    status IN ('blocked', 'queued', 'processing', 'succeeded', 'failed')
  ),
  CONSTRAINT tryon_reason_len CHECK (
    status_reason IS NULL OR char_length(status_reason) BETWEEN 5 AND 400
  )
);

CREATE INDEX IF NOT EXISTS tryon_user_idx
  ON tryon_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tryon_status_idx
  ON tryon_requests (status, created_at DESC);

ALTER TABLE tryon_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tryon_owner_select ON tryon_requests;
CREATE POLICY tryon_owner_select ON tryon_requests FOR SELECT
  USING (user_id = app_user_id());

DROP POLICY IF EXISTS tryon_owner_write ON tryon_requests;
CREATE POLICY tryon_owner_write ON tryon_requests FOR ALL
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
