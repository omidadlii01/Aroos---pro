import { Inject, Injectable } from '@nestjs/common';

import { maskMobile } from '@bridalos/contracts';

import { JsonLogger } from '../common/logger.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import type { SmsPort } from './sms.port.js';

/**
 * آداپتور توسعه پیامک — هیچ پیامکی ارسال نمی‌شود.
 *
 * وضعیت: **مسدود به‌علت دسترسی** — اتصال سرویس پیامک واقعی (کاوه‌نگار/ملی‌پیامک و…)
 * نیازمند حساب تجاری، تأیید کد ارسال و کلید API از مالک است. تا آن زمان این
 * آداپتور کد را فقط در لاگ محیط توسعه ثبت می‌کند و خروجی آن با برچسب
 * «حالت توسعه» در UI نمایش داده می‌شود؛ هرگز به‌عنوان ارسال واقعی گزارش نمی‌شود.
 */
@Injectable()
export class DevSmsAdapter implements SmsPort {
  readonly delivery = 'dev-log' as const;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {
    if (this.config.isProduction) {
      throw new Error('DevSmsAdapter در production مجاز نیست؛ آداپتور پیامک واقعی پیکربندی نشده است.');
    }
  }

  async sendOtp(input: { phone: string; code: string; expiresInSeconds: number }): Promise<void> {
    this.logger.warn(
      {
        channel: 'dev-log',
        phoneMasked: maskMobile(input.phone),
        devDeliveryText: `کد آزمایشی ${input.code} (اعتبار ${input.expiresInSeconds} ثانیه)`,
        note: 'پیامک واقعی ارسال نشد؛ AUTH_DEV_ECHO_OTP=true برای تست دستی فعال است.',
      },
      'DevSmsAdapter',
    );
  }
}
