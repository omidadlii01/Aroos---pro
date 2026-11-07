import { randomBytes } from 'node:crypto';

/**
 * بارگذاری و اعتبارسنجی تنظیمات محیطی.
 *
 * قواعد امنیتی:
 * - در production هیچ مقدار محرمانه‌ای پیش‌فرض یا تولیدشده در لحظه پذیرفته نمی‌شود؛
 *   سرویس بدون آن‌ها بالا نمی‌آید (fail fast).
 * - در local/dev اگر راز تنظیم نشده باشد، مقدار تصادفی موقت ساخته می‌شود و
 *   هشدار صریح ثبت می‌شود؛ بنابراین هیچ راز ثابتی در کد وجود ندارد.
 */

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DbDriver = 'pglite' | 'postgres';

export type AppConfig = {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  appEnv: string;
  logLevel: LogLevel;
  api: {
    port: number;
    host: string;
    origins: string[];
  };
  db: {
    driver: DbDriver;
    pgliteDataDir: string;
    databaseUrl: string | null;
    ssl: boolean;
    /** در local/dev به‌صورت پیش‌فرض فعال است؛ در production فقط با مقدار صریح. */
    autoMigrate: boolean;
  };
  auth: {
    jwtSecret: string;
    jwtTtlSeconds: number;
    otpPepper: string;
    otpTtlSeconds: number;
    otpMaxAttempts: number;
    otpResendCooldownSeconds: number;
    otpMaxPerHour: number;
    devEchoOtp: boolean;
  };
  sms: {
    driver: 'dev';
  };
  media: {
    root: string;
    maxBytes: number;
    signedUrlTtlSeconds: number;
    signingSecret: string;
  };
  photos: {
    /** فاصله اجرای پاک‌سازی عکس‌های منقضی در فرایند API؛ صفر = خاموش (فقط CLI/cron). */
    sweepSeconds: number;
  };
  ai: {
    /** ارائه‌دهنده امتحان مجازی؛ `none` یعنی هیچ سرویسی متصل نیست. */
    tryonProvider: 'none' | 'dev-watermark';
  };
};

export type ConfigLoadResult = { config: AppConfig; warnings: string[] };

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`تنظیمات محیطی معتبر نیست:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env): ConfigLoadResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const nodeEnvRaw = (env.NODE_ENV ?? 'development').trim();
  if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
    issues.push(`NODE_ENV باید یکی از development/test/production باشد؛ دریافت: ${nodeEnvRaw}`);
  }
  const nodeEnv = (['development', 'test', 'production'] as const).includes(nodeEnvRaw as NodeEnv)
    ? (nodeEnvRaw as NodeEnv)
    : 'development';
  const isProduction = nodeEnv === 'production';

  const int = (key: string, fallback: number, min: number, max: number): number => {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      issues.push(`${key} باید عدد صحیح بین ${min} و ${max} باشد؛ دریافت: ${raw}`);
      return fallback;
    }
    return parsed;
  };

  const bool = (key: string, fallback: boolean): boolean => {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') return fallback;
    if (['1', 'true', 'yes'].includes(raw.trim().toLowerCase())) return true;
    if (['0', 'false', 'no'].includes(raw.trim().toLowerCase())) return false;
    issues.push(`${key} باید true یا false باشد؛ دریافت: ${raw}`);
    return fallback;
  };

  const secret = (key: string, minLength: number): string => {
    const raw = (env[key] ?? '').trim();
    if (raw.length >= minLength) return raw;
    if (raw.length > 0) {
      issues.push(`${key} باید حداقل ${minLength} نویسه باشد`);
      return raw;
    }
    if (isProduction) {
      issues.push(`${key} در محیط production الزامی است`);
      return '';
    }
    warnings.push(`${key} تنظیم نشده است؛ یک مقدار تصادفی موقت برای محیط غیر production ساخته شد.`);
    return randomBytes(48).toString('base64url');
  };

  const driver = ((env.DB_DRIVER ?? 'pglite').trim() || 'pglite') as DbDriver;
  if (!['pglite', 'postgres'].includes(driver)) {
    issues.push(`DB_DRIVER باید pglite یا postgres باشد؛ دریافت: ${driver}`);
  }

  const databaseUrl = (env.DATABASE_URL ?? '').trim() || null;
  if (driver === 'postgres' && databaseUrl === null) {
    issues.push('وقتی DB_DRIVER=postgres است، DATABASE_URL الزامی است');
  }
  if (driver === 'pglite' && isProduction) {
    issues.push('DB_DRIVER=pglite فقط برای local/dev/test مجاز است و در production پذیرفته نمی‌شود');
  }

  const origins = (env.API_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (isProduction) {
    if (origins.includes('*')) issues.push('API_ORIGINS در production نباید * باشد');
    for (const origin of origins) {
      if (!origin.startsWith('https://')) {
        issues.push(`API_ORIGINS در production باید https باشد؛ دریافت: ${origin}`);
      }
    }
    if (origins.length === 0) issues.push('API_ORIGINS در production الزامی است');
  }

  const devEchoOtp = bool('AUTH_DEV_ECHO_OTP', !isProduction);
  if (isProduction && devEchoOtp) {
    issues.push('AUTH_DEV_ECHO_OTP در production باید false باشد (کد یکبارمصرف نباید در پاسخ API باشد)');
  }

  const smsDriver = (env.SMS_DRIVER ?? 'dev').trim();
  if (smsDriver !== 'dev') {
    issues.push(
      `SMS_DRIVER=${smsDriver} پشتیبانی نمی‌شود. تنها آداپتور پیاده‌سازی‌شده «dev» است؛ اتصال سرویس پیامک واقعی نیازمند کلید است و فعلاً Blocked است.`,
    );
  }
  if (isProduction) {
    issues.push(
      'در production هنوز آداپتور پیامک واقعی فعال نشده است؛ راه‌اندازی production تا تأمین دسترسی سرویس پیامک مسدود است.',
    );
  }

  const logLevel = (env.LOG_LEVEL ?? 'info').trim();
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    issues.push(`LOG_LEVEL باید debug/info/warn/error باشد؛ دریافت: ${logLevel}`);
  }

  const config: AppConfig = {
    nodeEnv,
    isProduction,
    appEnv: (env.APP_ENV ?? (nodeEnv === 'production' ? 'production' : 'local')).trim(),
    logLevel: logLevel as AppConfig['logLevel'],
    api: {
      port: int('API_PORT', 4000, 1, 65535),
      host: (env.API_HOST ?? '0.0.0.0').trim(),
      origins,
    },
    db: {
      driver,
      pgliteDataDir: (env.PGLITE_DATA_DIR ?? '.data/pglite').trim(),
      databaseUrl,
      ssl: bool('DATABASE_SSL', isProduction),
      autoMigrate: bool('DB_AUTO_MIGRATE', !isProduction),
    },
    auth: {
      jwtSecret: secret('AUTH_JWT_SECRET', 32),
      jwtTtlSeconds: int('AUTH_JWT_TTL_SECONDS', 1800, 60, 60 * 60 * 24 * 7),
      otpPepper: secret('AUTH_OTP_PEPPER', 32),
      otpTtlSeconds: int('AUTH_OTP_TTL_SECONDS', 120, 30, 900),
      otpMaxAttempts: int('AUTH_OTP_MAX_ATTEMPTS', 5, 1, 10),
      otpResendCooldownSeconds: int('AUTH_OTP_RESEND_COOLDOWN_SECONDS', 60, 10, 600),
      otpMaxPerHour: int('AUTH_OTP_MAX_PER_HOUR', 5, 1, 30),
      devEchoOtp,
    },
    sms: { driver: 'dev' },
    media: {
      root: (env.MEDIA_ROOT ?? '.data/media').trim(),
      maxBytes: 8 * 1024 * 1024,
      signedUrlTtlSeconds: int('MEDIA_SIGNED_URL_TTL_SECONDS', 300, 30, 3600),
      signingSecret: secret('MEDIA_SIGNING_SECRET', 32),
    },
    photos: {
      sweepSeconds: int('PHOTO_RETENTION_SWEEP_SECONDS', 3600, 0, 86_400),
    },
    ai: {
      tryonProvider: env.AI_TRYON_PROVIDER === 'dev-watermark' ? 'dev-watermark' : 'none',
    },
  };

  if (nodeEnvRaw === 'test' && config.photos.sweepSeconds !== 0) {
    // در تست‌ها پاک‌سازی خودکار نباید بی‌خبر اجرا شود؛ تست، سرویس را مستقیم صدا می‌زند.
    config.photos.sweepSeconds = 0;
  }

  if (issues.length > 0) throw new ConfigError(issues);
  return { config, warnings };
}
