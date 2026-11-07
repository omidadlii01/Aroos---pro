-- فاز ۵: بررسی مزون توسط ادمین پلتفرم
-- افزودن وضعیت «ردشده»، ثبت بازبین و دلیل بررسی.
-- دلیل رد برای مالک مزون قابل مشاهده است؛ داده شخصی اضافه‌ای ذخیره نمی‌شود.

ALTER TABLE boutiques
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid REFERENCES users (id),
  ADD COLUMN IF NOT EXISTS review_reason text;

ALTER TABLE boutiques DROP CONSTRAINT IF EXISTS boutiques_status_check;
ALTER TABLE boutiques
  ADD CONSTRAINT boutiques_status_check
  CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'suspended'));

ALTER TABLE boutiques DROP CONSTRAINT IF EXISTS boutiques_review_reason_len;
ALTER TABLE boutiques
  ADD CONSTRAINT boutiques_review_reason_len
  CHECK (review_reason IS NULL OR char_length(review_reason) BETWEEN 5 AND 500);

CREATE INDEX IF NOT EXISTS boutiques_status_submitted_idx
  ON boutiques (status, submitted_at);

CREATE INDEX IF NOT EXISTS dresses_status_idx
  ON dresses (status);
