import express from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { JsonLogger } from './common/logger.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';
import { MEDIA_ALLOWED_TYPES, MEDIA_MAX_BYTES } from '@bridalos/contracts';

/**
 * پیکربندی مشترک HTTP برای main و تست‌ها (تا تست‌ها رفتار واقعی را بسنجند).
 * ترتیب مهم است: بدنه دودویی تصویر فقط برای مسیر آپلود رسانه فعال می‌شود.
 */
export function configureHttp(
  app: NestExpressApplication,
  options: { logger: JsonLogger; origins?: string[] },
): void {
  app.useLogger(options.logger);
  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);

  app.use(
    '/api/v1/dresses/:id/media',
    express.raw({ type: [...MEDIA_ALLOWED_TYPES], limit: MEDIA_MAX_BYTES }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(options.logger));

  if (options.origins && options.origins.length > 0) {
    app.enableCors({
      origin: options.origins,
      credentials: false,
      allowedHeaders: ['content-type', 'authorization', 'x-request-id', 'x-rights-attested'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }
  app.enableShutdownHooks();
}
