import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { JsonLogger } from './common/logger.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';
import { ConfigError, loadConfig } from './config/config.js';

async function bootstrap(): Promise<void> {
  let loaded: ReturnType<typeof loadConfig>;
  try {
    loaded = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // خطای تنظیمات باید صریح و بدون افشای مقدار راز باشد.
      console.error(JSON.stringify({ level: 'error', msg: 'config_invalid', issues: error.issues }));
      process.exit(1);
    }
    throw error;
  }

  const { config, warnings } = loaded;
  const logger = new JsonLogger(config.logLevel);
  for (const warning of warnings) logger.warn(warning, 'bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config, {
      logger,
      migrationsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'database', 'migrations'),
    }),
    { logger },
  );

  app.useLogger(logger);
  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableCors({
    origin: config.api.origins,
    credentials: false,
    allowedHeaders: ['content-type', 'authorization', 'x-request-id', 'x-tenant-id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.enableShutdownHooks();

  await app.listen(config.api.port, config.api.host);
  logger.log(
    { msg: 'api_started', port: config.api.port, host: config.api.host, env: config.appEnv, db: config.db.driver },
    'bootstrap',
  );
}

void bootstrap();
