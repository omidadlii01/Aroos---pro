-- 0009_appointments.sql — نوبت‌دهی حضوری مزون (فاز ۸)
--
-- قواعد:
--  ۱) ساعات کاری هفتگی در `boutique_availability` با «دقیقه‌های روز به وقت تهران»
--     نگه داشته می‌شود؛ هیچ تاریخ شمسی در دیتابیس ذخیره نمی‌شود.
--  ۲) هر نوبت یک بازه مشخص `starts_at`/`ends_at` با `timestamptz` است؛ تاریخ شمسی
--     فقط لایه نمایش است.
--  ۳) ظرفیت هر بازه یک نوبت است و با ایندکس یکتای جزئی به‌صورت اتمی تضمین می‌شود؛
--     بنابراین دو درخواست هم‌زمان نمی‌توانند یک بازه را بگیرند.
--  ۴) هیچ نوبتی حذف نمی‌شود؛ لغو/رد با تغییر وضعیت ثبت می‌شود تا سابقه بماند.

CREATE TABLE IF NOT EXISTS boutique_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES boutiques (id) ON DELETE CASCADE,
  -- 0 = شنبه … 6 = جمعه (هفته ایرانی)
  weekday smallint NOT NULL,
  starts_minute smallint NOT NULL,
  ends_minute smallint NOT NULL,
  slot_minutes smallint NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT availability_minutes_check CHECK (
    starts_minute >= 0 AND ends_minute <= 1440 AND ends_minute - starts_minute >= 15
  ),
  CONSTRAINT availability_slot_check CHECK (slot_minutes BETWEEN 15 AND 240),
  CONSTRAINT availability_unique_day UNIQUE (boutique_id, weekday)
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  boutique_id uuid NOT NULL REFERENCES boutiques (id) ON DELETE CASCADE,
  dress_id uuid REFERENCES dresses (id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  note text,
  decline_reason text,
  decided_by uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  cancelled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_status_check CHECK (
    status IN ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')
  ),
  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at),
  CONSTRAINT appointments_note_len CHECK (
    note IS NULL OR char_length(note) BETWEEN 1 AND 400
  ),
  CONSTRAINT appointments_decline_len CHECK (
    decline_reason IS NULL OR char_length(decline_reason) BETWEEN 5 AND 400
  ),
  CONSTRAINT appointments_cancelled_by_check CHECK (
    cancelled_by IS NULL OR cancelled_by IN ('bride', 'boutique')
  )
);

-- ظرفیت ۱ برای هر بازه: رزرو تکراری در سطح دیتابیس غیرممکن می‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_unique
  ON appointments (boutique_id, starts_at)
  WHERE status IN ('requested', 'confirmed');

CREATE INDEX IF NOT EXISTS appointments_user_idx ON appointments (user_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS appointments_boutique_idx ON appointments (boutique_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS appointments_boutique_day_idx
  ON appointments (boutique_id, starts_at)
  WHERE status IN ('requested', 'confirmed');

ALTER TABLE boutique_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- ساعات کاری: کارکنان مزون همه را می‌بینند؛ عموم فقط ساعات مزون تأییدشده.
DROP POLICY IF EXISTS availability_select ON boutique_availability;
CREATE POLICY availability_select ON boutique_availability FOR SELECT
  USING (
    app_is_tenant_member(boutique_id)
    OR EXISTS (SELECT 1 FROM boutiques b WHERE b.id = boutique_id AND b.status = 'approved')
  );

DROP POLICY IF EXISTS availability_write ON boutique_availability;
CREATE POLICY availability_write ON boutique_availability FOR ALL
  USING (app_is_tenant_member(boutique_id))
  WITH CHECK (app_is_tenant_member(boutique_id));

-- نوبت‌ها: عروس فقط نوبت خودش، کارکنان مزون همه نوبت‌های مزون خودشان.
DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (user_id = app_user_id() OR app_is_tenant_member(boutique_id));

DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (user_id = app_user_id() OR app_is_tenant_member(boutique_id))
  WITH CHECK (user_id = app_user_id() OR app_is_tenant_member(boutique_id));
