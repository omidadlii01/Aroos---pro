import { type DynamicModule, Module } from '@nestjs/common';

import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoutiquesModule } from './boutiques/boutiques.module.js';
import { JsonLogger } from './common/logger.js';
import { LoggerModule } from './common/logger.module.js';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { DressesModule } from './dresses/dresses.module.js';
import { HealthModule } from './health/health.module.js';
import { MediaModule } from './media/media.module.js';
import { PublicModule } from './public/public.module.js';
import { AdminModule } from './admin/admin.module.js';
import { PhotosModule } from './photos/photos.module.js';
import { TryOnModule } from './tryon/tryon.module.js';
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
        MediaModule.forRoot(),
        AuditModule,
        AuthModule,
        TenantsModule,
        BoutiquesModule,
        DressesModule,
        PublicModule,
        AdminModule,
        PhotosModule,
        TryOnModule,
        AppointmentsModule,
        HealthModule,
      ],
    };
  }
}
