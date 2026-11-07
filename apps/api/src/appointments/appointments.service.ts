import { Inject, Injectable } from '@nestjs/common';

import {
  ACTIVE_APPOINTMENT_STATUSES,
  type AppointmentCreateInput,
  type AppointmentListQuery,
  type AppointmentStatus,
  type AppointmentView,
  type AvailabilityRuleView,
  type AvailabilityUpdateInput,
  type SlotView,
  formatMinuteOfDayFa,
  maskMobile,
  persianWeekdayOfDateKey,
  tehranDateKey,
  tehranDateKeyPlus,
  tehranInstant,
  tehranOffsetMinutes,
} from '@bridalos/contracts';

import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';

type AppointmentRow = {
  id: string;
  user_id: string;
  boutique_id: string;
  dress_id: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: AppointmentStatus;
  note: string | null;
  decline_reason: string | null;
  created_at: Date | string;
  decided_at: Date | string | null;
  boutique_name: string;
  boutique_slug: string;
  boutique_city: string;
  dress_name: string | null;
  bride_name: string | null;
  bride_phone: string | null;
};

type AvailabilityRow = {
  weekday: number;
  starts_minute: number;
  ends_minute: number;
  slot_minutes: number;
  is_active: boolean;
};

const MINUTE = 60_000;

/** دقیقه‌های سپری‌شده از نیمه‌شب تهران برای یک لحظه مشخص. */
function tehranMinuteOfDay(instant: Date): number {
  const dateKey = tehranDateKey(instant);
  const midnight = tehranInstant(dateKey, 0);
  const offsetShare = tehranOffsetMinutes(instant) - tehranOffsetMinutes(midnight);
  return Math.round((instant.getTime() - midnight.getTime()) / MINUTE) - offsetShare;
}

function toView(row: AppointmentRow, options: { forStaff: boolean }): AppointmentView {
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  return {
    id: row.id,
    status: row.status,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    dateKey: tehranDateKey(startsAt),
    timeLabel: formatMinuteOfDayFa(tehranMinuteOfDay(startsAt)),
    boutique: {
      id: row.boutique_id,
      name: row.boutique_name,
      slug: row.boutique_slug,
      citySlug: row.boutique_city,
    },
    dress: row.dress_id && row.dress_name ? { id: row.dress_id, name: row.dress_name } : null,
    note: row.note,
    declineReason: row.decline_reason,
    brideName: options.forStaff ? row.bride_name : null,
    bridePhoneMasked: options.forStaff && row.bride_phone ? maskMobile(row.bride_phone) : null,
    createdAt: new Date(row.created_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
  };
}

const BASE_SELECT = `
  SELECT a.id, a.user_id, a.boutique_id, a.dress_id, a.starts_at, a.ends_at, a.status,
         a.note, a.decline_reason, a.created_at, a.decided_at,
         b.name AS boutique_name, b.slug AS boutique_slug, b.city_slug AS boutique_city,
         d.name AS dress_name, u.display_name AS bride_name, u.phone AS bride_phone
    FROM appointments a
    JOIN boutiques b ON b.id = a.boutique_id
    LEFT JOIN dresses d ON d.id = a.dress_id
    JOIN users u ON u.id = a.user_id
`;

/**
 * نوبت‌دهی حضوری مزون.
 *
 * قواعد صریح:
 *  - نوبت فقط روی بازه‌های تعریف‌شده ساعات کاری مزون و هم‌تراز با طول نوبت است.
 *  - هر بازه ظرفیت یک نوبت دارد؛ تداخل با ایندکس یکتای دیتابیس رد می‌شود.
 *  - هیچ پیامکی ارسال نمی‌شود؛ وضعیت در پنل نمایش داده می‌شود.
 *  - حذف فیزیکی وجود ندارد؛ لغو/رد فقط وضعیت را عوض می‌کند.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /* ---------------------------- عروس ---------------------------- */

  async create(userId: string, input: AppointmentCreateInput): Promise<AppointmentView> {
    const boutiques = await this.runner.query<{ id: string; status: string }>(
      'SELECT id, status FROM boutiques WHERE id = $1',
      [input.boutiqueId],
    );
    const boutique = boutiques[0];
    if (!boutique || boutique.status !== 'approved') {
      throw AppError.notFound('مزون یافت نشد یا هنوز تأیید نشده است.');
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw AppError.validation(undefined, 'زمان نوبت معتبر نیست.');
    const now = Date.now();
    const minStart = now + this.config.booking.minLeadMinutes * MINUTE;
    const maxStart = now + this.config.booking.horizonDays * 86400000;
    if (startsAt.getTime() < minStart) {
      throw AppError.validation(
        undefined,
        `زمان نوبت باید حداقل ${this.config.booking.minLeadMinutes} دقیقه بعد از الان باشد.`,
      );
    }
    if (startsAt.getTime() > maxStart) {
      throw AppError.validation(
        undefined,
        `رزرو فقط تا ${this.config.booking.horizonDays} روز آینده ممکن است.`,
      );
    }

    const dateKey = tehranDateKey(startsAt);
    const minuteOfDay = tehranMinuteOfDay(startsAt);
    const rules = await this.runner.query<AvailabilityRow>(
      `SELECT weekday, starts_minute, ends_minute, slot_minutes, is_active
         FROM boutique_availability
        WHERE boutique_id = $1 AND weekday = $2 AND is_active = true`,
      [input.boutiqueId, persianWeekdayOfDateKey(dateKey)],
    );
    const rule = rules[0];
    if (!rule) {
      throw AppError.conflict('مزون برای این روز ساعت کاری فعالی ثبت نکرده است.');
    }
    const aligned =
      minuteOfDay >= rule.starts_minute &&
      minuteOfDay + rule.slot_minutes <= rule.ends_minute &&
      (minuteOfDay - rule.starts_minute) % rule.slot_minutes === 0;
    if (!aligned) {
      throw AppError.conflict(
        'این زمان جزو بازه‌های نوبت‌دهی این مزون نیست؛ یکی از بازه‌های پیشنهادی را انتخاب کنید.',
      );
    }

    if (input.dressId) {
      const dresses = await this.runner.query<{ id: string }>(
        `SELECT id FROM dresses
          WHERE id = $1 AND boutique_id = $2 AND status = 'published'`,
        [input.dressId, input.boutiqueId],
      );
      if (dresses.length === 0) {
        throw AppError.notFound('این لباس متعلق به همین مزون یا منتشرشده نیست.');
      }
    }

    const active = await this.runner.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM appointments
        WHERE user_id = $1 AND status IN ('requested', 'confirmed')`,
      [userId],
    );
    if ((active[0]?.count ?? 0) >= this.config.booking.maxActivePerBride) {
      throw AppError.conflict(
        `هر عروس حداکثر ${this.config.booking.maxActivePerBride} نوبت فعال می‌تواند داشته باشد؛ ابتدا یکی را لغو کنید.`,
      );
    }

    const endsAt = new Date(startsAt.getTime() + rule.slot_minutes * MINUTE);
    let inserted: { id: string };
    try {
      const rows = await this.runner.query<{ id: string }>(
        `INSERT INTO appointments (user_id, boutique_id, dress_id, starts_at, ends_at, status, note)
         VALUES ($1, $2, $3, $4, $5, 'requested', $6)
         RETURNING id`,
        [userId, input.boutiqueId, input.dressId ?? null, startsAt, endsAt, input.note ?? null],
      );
      const row = rows[0];
      if (!row) throw AppError.internal('ثبت نوبت ناموفق بود');
      inserted = row;
    } catch (error) {
      // 23505 = نقض ایندکس یکتا؛ یعنی همین بازه لحظه‌ای پیش گرفته شده است.
      if ((error as { code?: string }).code === '23505') {
        throw AppError.conflict('این بازه همین حالا توسط کاربر دیگری گرفته شد؛ بازه دیگری انتخاب کنید.');
      }
      throw error;
    }

    await this.audit.record({
      action: 'appointment.requested',
      actorUserId: userId,
      tenantId: input.boutiqueId,
      entityType: 'appointment',
      entityId: inserted.id,
    });

    return this.getOwn(userId, inserted.id);
  }

  async listMine(userId: string, limit = 50): Promise<AppointmentView[]> {
    const rows = await this.runner.query<AppointmentRow>(
      `${BASE_SELECT} WHERE a.user_id = $1 ORDER BY a.starts_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => toView(row, { forStaff: false }));
  }

  async getOwn(userId: string, id: string): Promise<AppointmentView> {
    const rows = await this.runner.query<AppointmentRow>(
      `${BASE_SELECT} WHERE a.id = $1 AND a.user_id = $2`,
      [id, userId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('نوبت یافت نشد.');
    return toView(row, { forStaff: false });
  }

  async cancelMine(userId: string, id: string): Promise<AppointmentView> {
    const rows = await this.runner.query<{ status: AppointmentStatus; starts_at: Date | string }>(
      'SELECT status, starts_at FROM appointments WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('نوبت یافت نشد.');
    if (!(ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(row.status)) {
      throw AppError.conflict('این نوبت در وضعیتی نیست که قابل لغو باشد.');
    }
    if (new Date(row.starts_at).getTime() <= Date.now()) {
      throw AppError.conflict('زمان این نوبت گذشته است؛ لغو ممکن نیست.');
    }

    await this.runner.query(
      `UPDATE appointments
          SET status = 'cancelled', cancelled_by = 'bride', updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    await this.audit.record({
      action: 'appointment.cancelled',
      actorUserId: userId,
      entityType: 'appointment',
      entityId: id,
      metadata: { by: 'bride' },
    });
    return this.getOwn(userId, id);
  }

  /* ------------------------ کارکنان مزون ------------------------ */

  async listForBoutique(
    boutiqueId: string,
    query: AppointmentListQuery,
  ): Promise<AppointmentView[]> {
    const conditions: string[] = ['a.boutique_id = $1'];
    const params: unknown[] = [boutiqueId];
    if (query.status) {
      params.push(query.status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (query.from) {
      params.push(tehranInstant(query.from, 0));
      conditions.push(`a.starts_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(tehranInstant(query.to, 1440));
      conditions.push(`a.starts_at < $${params.length}`);
    }
    params.push(100);
    const rows = await this.runner.query<AppointmentRow>(
      `${BASE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY a.starts_at ASC LIMIT $${params.length}`,
      params,
    );
    return rows.map((row) => toView(row, { forStaff: true }));
  }

  async confirm(actorId: string, boutiqueId: string, id: string): Promise<AppointmentView> {
    return this.decide(actorId, boutiqueId, id, 'confirmed');
  }

  async complete(actorId: string, boutiqueId: string, id: string): Promise<AppointmentView> {
    return this.decide(actorId, boutiqueId, id, 'completed');
  }

  async markNoShow(actorId: string, boutiqueId: string, id: string): Promise<AppointmentView> {
    return this.decide(actorId, boutiqueId, id, 'no_show');
  }

  async decline(
    actorId: string,
    boutiqueId: string,
    id: string,
    reason: string,
  ): Promise<AppointmentView> {
    return this.decide(actorId, boutiqueId, id, 'declined', reason);
  }

  private async decide(
    actorId: string,
    boutiqueId: string,
    id: string,
    next: AppointmentStatus,
    reason?: string,
  ): Promise<AppointmentView> {
    const allowedFrom: Record<string, AppointmentStatus[]> = {
      confirmed: ['requested'],
      declined: ['requested'],
      completed: ['confirmed'],
      no_show: ['confirmed'],
    };
    const rows = await this.runner.query<{ status: AppointmentStatus }>(
      'SELECT status FROM appointments WHERE id = $1 AND boutique_id = $2',
      [id, boutiqueId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('نوبت یافت نشد.');
    if (!(allowedFrom[next] ?? []).includes(row.status)) {
      throw AppError.conflict(
        `تغییر وضعیت از «${row.status}» به «${next}» مجاز نیست؛ صفحه را تازه کنید.`,
      );
    }

    await this.runner.query(
      `UPDATE appointments
          SET status = $1,
              decline_reason = $4,
              decided_by = $2,
              decided_at = now(),
              updated_at = now()
        WHERE id = $3 AND boutique_id = $5`,
      [next, actorId, id, next === 'declined' ? (reason ?? null) : null, boutiqueId],
    );
    await this.audit.record({
      action: `appointment.${next}`,
      actorUserId: actorId,
      tenantId: boutiqueId,
      entityType: 'appointment',
      entityId: id,
      metadata: reason ? { reason } : undefined,
    });

    const updated = await this.runner.query<AppointmentRow>(
      `${BASE_SELECT} WHERE a.id = $1 AND a.boutique_id = $2`,
      [id, boutiqueId],
    );
    const fresh = updated[0];
    if (!fresh) throw AppError.notFound('نوبت یافت نشد.');
    return toView(fresh, { forStaff: true });
  }

  /* --------------------- ساعات کاری مزون --------------------- */

  async getAvailability(boutiqueId: string): Promise<{ rules: AvailabilityRuleView[] }> {
    const rows = await this.runner.query<AvailabilityRow>(
      `SELECT weekday, starts_minute, ends_minute, slot_minutes, is_active
         FROM boutique_availability
        WHERE boutique_id = $1
        ORDER BY weekday ASC`,
      [boutiqueId],
    );
    return {
      rules: rows.map((row) => ({
        weekday: row.weekday,
        startsMinute: row.starts_minute,
        endsMinute: row.ends_minute,
        slotMinutes: row.slot_minutes,
        isActive: row.is_active,
      })),
    };
  }

  async setAvailability(
    actorId: string,
    boutiqueId: string,
    input: AvailabilityUpdateInput,
  ): Promise<{ rules: AvailabilityRuleView[] }> {
    const seen = new Set<number>();
    for (const rule of input.rules) {
      if (seen.has(rule.weekday)) {
        throw AppError.validation(undefined, 'برای هر روز هفته فقط یک بازه مجاز است.');
      }
      seen.add(rule.weekday);
      if (rule.endsMinute - rule.startsMinute < rule.slotMinutes) {
        throw AppError.validation(
          undefined,
          'طول بازه کاری کمتر از طول هر نوبت است؛ بازه را بزرگ‌تر کنید.',
        );
      }
    }

    await this.runner.transaction(async (tx) => {
      await tx.query('DELETE FROM boutique_availability WHERE boutique_id = $1', [boutiqueId]);
      for (const rule of input.rules) {
        await tx.query(
          `INSERT INTO boutique_availability
             (boutique_id, weekday, starts_minute, ends_minute, slot_minutes, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            boutiqueId,
            rule.weekday,
            rule.startsMinute,
            rule.endsMinute,
            rule.slotMinutes,
            rule.isActive,
          ],
        );
      }
    });

    await this.audit.record({
      action: 'availability.updated',
      actorUserId: actorId,
      tenantId: boutiqueId,
      entityType: 'boutique',
      entityId: boutiqueId,
      metadata: { ruleCount: input.rules.length },
    });
    return this.getAvailability(boutiqueId);
  }

  /* ------------------- بازه‌های آزاد (عمومی) ------------------- */

  async publicSlots(
    slug: string,
    dateKey: string,
  ): Promise<{
    dateKey: string;
    weekday: number;
    boutique: { id: string; name: string; slug: string };
    slots: SlotView[];
    closed: boolean;
    noteFa: string | null;
  }> {
    const boutiques = await this.runner.query<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM boutiques WHERE slug = $1 AND status = 'approved'`,
      [slug],
    );
    const boutique = boutiques[0];
    if (!boutique) throw AppError.notFound('مزون یافت نشد.');

    const todayKey = tehranDateKey(new Date());
    const firstAllowed = todayKey;
    const lastAllowed = tehranDateKeyPlus(this.config.booking.horizonDays);
    if (dateKey < firstAllowed || dateKey > lastAllowed) {
      throw AppError.validation(
        undefined,
        `فقط تاریخ‌های امروز تا ${this.config.booking.horizonDays} روز آینده قابل مشاهده است.`,
      );
    }

    const weekday = persianWeekdayOfDateKey(dateKey);
    const rules = await this.runner.query<AvailabilityRow>(
      `SELECT weekday, starts_minute, ends_minute, slot_minutes, is_active
         FROM boutique_availability
        WHERE boutique_id = $1 AND weekday = $2 AND is_active = true`,
      [boutique.id, weekday],
    );
    const rule = rules[0];
    if (!rule) {
      return {
        dateKey,
        weekday,
        boutique,
        slots: [],
        closed: true,
        noteFa: 'این مزون برای این روز ساعت کاری ثبت نکرده است.',
      };
    }

    const dayStart = tehranInstant(dateKey, 0);
    const dayEnd = tehranInstant(dateKey, 1440);
    const booked = await this.runner.query<{ starts_at: Date | string }>(
      `SELECT starts_at FROM appointments
        WHERE boutique_id = $1 AND status IN ('requested', 'confirmed')
          AND starts_at >= $2 AND starts_at < $3`,
      [boutique.id, dayStart, dayEnd],
    );
    const bookedMs = new Set(booked.map((row) => new Date(row.starts_at).getTime()));
    const earliest = Date.now() + this.config.booking.minLeadMinutes * MINUTE;

    const slots: SlotView[] = [];
    for (
      let minute = rule.starts_minute;
      minute + rule.slot_minutes <= rule.ends_minute;
      minute += rule.slot_minutes
    ) {
      const startsAt = tehranInstant(dateKey, minute);
      if (startsAt.getTime() < earliest) continue;
      const endsAt = new Date(startsAt.getTime() + rule.slot_minutes * MINUTE);
      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timeLabel: formatMinuteOfDayFa(minute),
        available: !bookedMs.has(startsAt.getTime()),
      });
    }

    return {
      dateKey,
      weekday,
      boutique,
      slots,
      closed: false,
      noteFa:
        slots.length === 0
          ? 'برای این روز بازه آزادی نمانده یا زمان شروع آن گذشته است.'
          : null,
    };
  }
}
