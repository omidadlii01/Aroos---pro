import { type DynamicModule, Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoutiquesModule } from './boutiques/boutiques.module.js';
import { JsonLogger } from './common/logger.js';
import { LoggerModule } from './common/logger.module.js';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';

export type AppModuleOptions = {
  logger?: JsonLogger;
  migrationsDir?: string;
};

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot(options.logger ?? new JsonLogger(config.logLevel)),
        DatabaseModule.forRoot(config, { migrationsDir: options.migrationsDir }),
        AuditModule,
        AuthModule,
        TenantsModule,
        BoutiquesModule,
        HealthModule,
      ],
    };
  }
}
