import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type DynamicModule, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';

import type { AppConfig } from '../config/config.js';
import { runMigrations } from './migrator.js';
import { createSqlRunner, type SqlRunner } from './sql.js';

export const SQL_RUNNER = Symbol('SQL_RUNNER');

export type DatabaseModuleOptions = {
  /** مسیر مطلق پوشه migration؛ در تست‌ها صریح داده می‌شود. */
  migrationsDir?: string;
};

function defaultMigrationsDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
}

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SQL_RUNNER) private readonly runner: SqlRunner) {}

  async onApplicationShutdown(): Promise<void> {
    await this.runner.close();
  }
}

/**
 * اتصال دیتابیس + اجرای migration در boot (در production فقط با DB_AUTO_MIGRATE=true).
 */
@Module({})
export class DatabaseModule {
  static forRoot(config: AppConfig, options: DatabaseModuleOptions = {}): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: SQL_RUNNER,
          useFactory: async (): Promise<SqlRunner> => {
            const runner = await createSqlRunner(config);
            if (config.db.autoMigrate) {
              await runMigrations(runner, {
                dir: options.migrationsDir ?? defaultMigrationsDir(),
              });
            }
            return runner;
          },
        },
        DatabaseLifecycle,
      ],
      exports: [SQL_RUNNER],
    };
  }
}
