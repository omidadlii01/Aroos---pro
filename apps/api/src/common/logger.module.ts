import { type DynamicModule, Global, Module } from '@nestjs/common';

import { JsonLogger } from './logger.js';

/** لاگر ساخت‌یافته به‌صورت سراسری در دسترس همه ماژول‌هاست. */
@Global()
@Module({})
export class LoggerModule {
  static forRoot(logger: JsonLogger): DynamicModule {
    return {
      module: LoggerModule,
      providers: [{ provide: JsonLogger, useValue: logger }],
      exports: [JsonLogger],
    };
  }
}
