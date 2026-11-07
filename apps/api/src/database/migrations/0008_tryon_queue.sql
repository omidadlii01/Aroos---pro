-- 0008_tryon_queue.sql — صف واقعی امتحان مجازی (فاز ۷)
--
-- در این فاز provider تجاری وجود ندارد؛ آداپتور `dev-watermark` خروجی
-- آب‌دار (واترمارک) می‌سازد که در DB با `is_dev_output = true` علامت‌گذاری
-- می‌شود و هیچ‌گاه به‌عنوان خروجی واقعی AI به کاربر ارائه نمی‌شود.

ALTER TABLE tryon_requests
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_storage_key text,
  ADD COLUMN IF NOT EXISTS result_content_type varchar(40),
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS is_dev_output boolean NOT NULL DEFAULT false;

ALTER TABLE tryon_requests DROP CONSTRAINT IF EXISTS tryon_attempts_check;
ALTER TABLE tryon_requests
  ADD CONSTRAINT tryon_attempts_check CHECK (attempts >= 0);

ALTER TABLE tryon_requests DROP CONSTRAINT IF EXISTS tryon_error_len;
ALTER TABLE tryon_requests
  ADD CONSTRAINT tryon_error_len
  CHECK (error_message IS NULL OR char_length(error_message) <= 400);

-- صف: فقط درخواست‌های در انتظار، به ترتیب ورود
CREATE INDEX IF NOT EXISTS tryon_queue_idx
  ON tryon_requests (created_at)
  WHERE status = 'queued';

-- نتیجه فقط با کلید ذخیره‌سازی و برچسب dev قابل بازیابی است
CREATE INDEX IF NOT EXISTS tryon_result_idx
  ON tryon_requests (id)
  WHERE result_storage_key IS NOT NULL;
