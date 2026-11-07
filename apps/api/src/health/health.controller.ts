import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';

import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';

const startedAt = Date.now();

export type HealthReport = {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  checks: {
    database: { status: 'ok' | 'error'; driver: string; latencyMs: number | null };
  };
};

@Controller()
export class HealthController {
  constructor(
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('healthz')
  async health(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const database = await this.checkDatabase();
    const status: HealthReport['status'] = database.status === 'ok' ? 'ok' : 'degraded';
    response.status(status === 'ok' ? 200 : 503);
    return {
      status,
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks: { database },
    };
  }

  @Get('readyz')
  @Header('cache-control', 'no-store')
  async ready(@Res({ passthrough: true }) response: Response): Promise<{ ready: boolean }> {
    const database = await this.checkDatabase();
    const ready = database.status === 'ok';
    response.status(ready ? 200 : 503);
    return { ready };
  }

  /** وضعیت شفاف قابلیت‌ها برای UI — هیچ قابلیت غیرفعالی «فعال» نشان داده نمی‌شود. */
  @Get('api/v1/meta')
  meta(): Record<string, unknown> {
    return {
      name: 'BridalOS API',
      version: process.env.npm_package_version ?? '0.1.0',
      environment: this.config.appEnv,
      otpDelivery: this.config.sms.driver === 'dev' ? 'dev-log' : 'sms',
      devEchoOtp: this.config.auth.devEchoOtp,
      payments: { status: 'disabled', reason: 'بدون درگاه پرداخت و تأیید مالک؛ فقط آداپتور sandbox در فاز ۱۳' },
      ai: {
        status: 'not-configured',
        provider: this.config.ai.tryonProvider,
        reason: 'هیچ provider واقعی متصل نیست؛ درخواست‌های امتحان مجازی با وضعیت blocked ثبت می‌شوند',
      },
      sms: { status: 'blocked', reason: 'آداپتور پیامک واقعی نیازمند کلید و تأیید مالک است' },
    };
  }

  private async checkDatabase(): Promise<HealthReport['checks']['database']> {
    const started = Date.now();
    const ok = await this.runner.ping();
    return {
      status: ok ? 'ok' : 'error',
      driver: this.runner.driver,
      latencyMs: ok ? Date.now() - started : null,
    };
  }
}
