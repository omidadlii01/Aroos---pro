-- 0003_catalog.sql — کاتالوگ لباس، رسانه خصوصی و مدیریت کارکنان مزون

-- ۱) افزودن ردیابی دعوت/پذیرش به عضویت‌ها (بدون حذف داده موجود)
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ۲) لباس کاتالوگ مزون
CREATE TABLE IF NOT EXISTS dresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES boutiques (id) ON DELETE CASCADE,
  code varchar(32) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'wedding',
  silhouette varchar(40),
  neckline varchar(40),
  sleeve varchar(40),
  skirt varchar(40),
  fabric varchar(40),
  embellishment varchar(40),
  color varchar(40),
  -- مبالغ همیشه به ریال و به‌صورت عدد صحیح ذخیره می‌شوند
  price_min_rial bigint,
  price_max_rial bigint,
  sample_available boolean NOT NULL DEFAULT true,
  orderable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dresses_code_format CHECK (code ~ '^[A-Za-z0-9-]{2,32}$'),
  CONSTRAINT dresses_name_len CHECK (char_length(name) BETWEEN 2 AND 120),
  CONSTRAINT dresses_category_check CHECK (category IN ('wedding', 'evening', 'engagement', 'other')),
  CONSTRAINT dresses_status_check CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  CONSTRAINT dresses_price_nonneg CHECK (
    coalesce(price_min_rial, 0) >= 0 AND coalesce(price_max_rial, 0) >= 0
  ),
  CONSTRAINT dresses_price_range CHECK (
    price_min_rial IS NULL OR price_max_rial IS NULL OR price_max_rial >= price_min_rial
  ),
  CONSTRAINT dresses_code_unique_per_boutique UNIQUE (boutique_id, code)
);

-- ۳) رسانه لباس — همیشه خصوصی؛ دسترسی فقط با URL امضاشده کوتاه‌عمر
CREATE TABLE IF NOT EXISTS dress_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES boutiques (id) ON DELETE CASCADE,
  dress_id uuid NOT NULL REFERENCES dresses (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  content_type varchar(40) NOT NULL,
  byte_size integer NOT NULL,
  width integer,
  height integer,
  checksum_sha256 char(64) NOT NULL,
  -- تأیید حقوق انتشار تصویر توسط مزون (الزام محصول)
  rights_attested_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT dress_media_size_positive CHECK (byte_size > 0)
);

CREATE INDEX IF NOT EXISTS dresses_tenant_idx ON dresses (boutique_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dresses_public_idx ON dresses (status, category, price_max_rial)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS dress_media_dress_idx ON dress_media (dress_id) WHERE deleted_at IS NULL;
