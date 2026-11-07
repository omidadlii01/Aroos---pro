import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { OtpChallengeResponse } from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { JsonLogger } from '../common/logger.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { SMS_PORT, type SmsPort } from './sms.port.js';

type ChallengeRow = {
  id: string;
  phone: string;
  code_hash: string;
  attempts: number;
  consumed_at: string | Date | null;
  expires_at: string | Date;
  created_at: string | Date;
};

/**
 * کد یکبارمصرف موبایل.
 *
 * تصمیم‌های امنیتی:
 * - کد ۵ رقمی تصادفی رمزنگاری‌شده (crypto.randomInt)؛ ذخیره فقط به‌صورت HMAC-SHA256
 *   با فلفل سرور (`AUTH_OTP_PEPPER`). کد خام هرگز در دیتابیس نیست.
 * - محدودیت نرخ در دو لایه: فاصله ارسال مجدد و سقف ساعتی به تفکیک شماره.
 * - محدودیت تلاش در هر چالش؛ مقایسه هش به‌صورت زمان‌ثابت.
 * - هر چالش یک‌بارمصرف است و انقضای کوتاه دارد.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}

  private hashCode(challengeId: string, code: string): string {
    return createHmac('sha256', this.config.auth.otpPepper)
      .update(`${challengeId}:${code}`)
      .digest('hex');
  }

  async request(phone: string, ipHash: string | null): Promise<OtpChallengeResponse> {
    const { otpResendCooldownSeconds, otpMaxPerHour, otpTtlSeconds } = this.config.auth;

    const lastRows = await this.runner.query<{ seconds_since: number }>(
      `SELECT EXTRACT(EPOCH FROM (now() - created_at))::int AS seconds_since
         FROM otp_challenges
        WHERE phone = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [phone],
    );
    const lastSeconds = lastRows[0]?.seconds_since;
    if (typeof lastSeconds === 'number' && lastSeconds < otpResendCooldownSeconds) {
      const retryAfter = otpResendCooldownSeconds - lastSeconds;
      throw AppError.rateLimited(retryAfter, `برای دریافت کد جدید ${retryAfter} ثانیه صبر کنید.`);
    }

    const hourRows = await this.runner.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM otp_challenges
        WHERE phone = $1 AND created_at > now() - interval '1 hour'`,
      [phone],
    );
    if ((hourRows[0]?.count ?? 0) >= otpMaxPerHour) {
      throw AppError.rateLimited(3600, 'سقف تعداد کد درخواستی در یک ساعت گذشته پر شده است.');
    }

    const challengeId = randomUUID();
    const code = String(randomInt(0, 100_000)).padStart(5, '0');
    const expiresAt = new Date(Date.now() + otpTtlSeconds * 1000);

    await this.runner.query(
      `INSERT INTO otp_challenges (id, phone, code_hash, expires_at, request_ip_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [challengeId, phone, this.hashCode(challengeId, code), expiresAt.toISOString(), ipHash],
    );

    try {
      await this.sms.sendOtp({ phone, code, expiresInSeconds: otpTtlSeconds });
    } catch (error) {
      this.logger.error(
        { reason: error instanceof Error ? error.message : 'unknown' },
        error instanceof Error ? error.stack : undefined,
        'OtpService',
      );
      throw AppError.serviceUnavailable('ارسال کد تأیید ناموفق بود؛ لطفاً دوباره تلاش کنید.');
    }

    const response: OtpChallengeResponse = {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: otpResendCooldownSeconds,
      delivery: this.sms.delivery === 'dev-log' ? 'dev-log' : 'sms',
    };
    if (this.sms.delivery === 'dev-log' && this.config.auth.devEchoOtp) {
      // فقط محیط local/dev — در production اعتبارسنجی تنظیمات اجازه نمی‌دهد.
      response.devCode = code;
    }
    return response;
  }

  /** بررسی کد و بازگشت شناسه کاربر (ایجاد کاربر در صورت اولین ورود). */
  async verify(challengeId: string, code: string): Promise<{ userId: string; isNewUser: boolean }> {
    const rows = await this.runner.query<ChallengeRow>(
      `SELECT id, phone, code_hash, attempts, consumed_at, expires_at, created_at
         FROM otp_challenges
        WHERE id = $1`,
      [challengeId],
    );
    const challenge = rows[0];
    if (!challenge) throw AppError.otpInvalid();
    if (challenge.consumed_at) throw AppError.otpInvalid();
    if (new Date(challenge.expires_at).getTime() <= Date.now()) throw AppError.otpExpired();
    if (challenge.attempts >= this.config.auth.otpMaxAttempts) throw AppError.otpTooManyAttempts();

    const expected = Buffer.from(challenge.code_hash, 'hex');
    const actual = Buffer.from(this.hashCode(challengeId, code), 'hex');
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matches) {
      await this.runner.query(
        'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL',
        [challengeId],
      );
      throw AppError.otpInvalid();
    }

    const consumed = await this.runner.query<{ id: string }>(
      `UPDATE otp_challenges
          SET consumed_at = now(), attempts = attempts + 1
        WHERE id = $1 AND consumed_at IS NULL
        RETURNING id`,
      [challengeId],
    );
    if (consumed.length === 0) throw AppError.otpInvalid();

    const userRows = await this.runner.query<{ id: string; created: boolean }>(
      `INSERT INTO users (phone)
       VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET updated_at = now()
       RETURNING id, (xmax = 0) AS created`,
      [challenge.phone],
    );
    const user = userRows[0];
    if (!user) throw AppError.internal('ثبت کاربر ناموفق بود');
    return { userId: user.id, isNewUser: Boolean(user.created) };
  }
}
