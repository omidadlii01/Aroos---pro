import { type DynamicModule, Inject, Injectable, Module } from '@nestjs/common';

import { type AppConfig, loadConfig } from './config.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Injectable()
export class ConfigService {
  constructor(@Inject(APP_CONFIG) readonly config: AppConfig) {}

  get isProduction(): boolean {
    return this.config.isProduction;
  }

  get nodeEnv(): AppConfig['nodeEnv'] {
    return this.config.nodeEnv;
  }
}

@Module({})
export class ConfigModule {
  /** تنظیمات از قبل اعتبارسنجی‌شده تزریق می‌شود (fail fast در main). */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }, ConfigService],
      exports: [APP_CONFIG, ConfigService],
    };
  }

  /** برای تست‌ها: ساخت تنظیمات از env با مقادیر پیش‌فرض امن. */
  static fromEnv(env: Record<string, string | undefined>): { config: AppConfig; warnings: string[] } {
    return loadConfig(env);
  }
}
