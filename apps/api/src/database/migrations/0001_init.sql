-- 0001_init.sql — هسته هویت و چندمستاجری BridalOS
-- همه زمان‌ها timestamptz (UTC) هستند؛ نمایش شمسی در لایه UI انجام می‌شود.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(11) NOT NULL UNIQUE,
  display_name text,
  -- نقش سراسری (پلتفرم)؛ نقش‌های مزون در جدول memberships نگه‌داری می‌شوند
  platform_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_phone_format CHECK (phone ~ '^09[0-9]{9}$'),
  CONSTRAINT users_platform_role_check CHECK (
    platform_role IS NULL OR platform_role IN ('platform_admin', 'support_agent')
  ),
  CONSTRAINT users_display_name_len CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS boutiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(48) NOT NULL UNIQUE,
  name varchar(80) NOT NULL,
  city_slug varchar(31) NOT NULL,
  description text,
  public_phone varchar(20),
  status text NOT NULL DEFAULT 'draft',
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  CONSTRAINT boutiques_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  CONSTRAINT boutiques_status_check CHECK (status IN ('draft', 'pending_review', 'approved', 'suspended')),
  CONSTRAINT boutiques_name_len CHECK (char_length(name) BETWEEN 2 AND 80)
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  boutique_id uuid NOT NULL REFERENCES boutiques (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT memberships_role_check CHECK (role IN ('boutique_owner', 'branch_manager', 'boutique_staff')),
  CONSTRAINT memberships_unique UNIQUE (user_id, boutique_id)
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(11) NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  request_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_attempts_check CHECK (attempts >= 0)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES boutiques (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS memberships_boutique_idx ON memberships (boutique_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS otp_challenges_phone_created_idx ON otp_challenges (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_challenges_expires_idx ON otp_challenges (expires_at);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_created_idx ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS boutiques_status_idx ON boutiques (status);
