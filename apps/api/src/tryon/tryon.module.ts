import { Module } from '@nestjs/common';

import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { AuthModule } from '../auth/auth.module.js';
import { createProvider, TRYON_PROVIDER } from './providers/tryon-provider.js';
import { TryOnController } from './tryon.controller.js';
import { TryOnResultController } from './tryon-result.controller.js';
import { TryOnService } from './tryon.service.js';
import { TryOnWorkerService } from './tryon-worker.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TryOnController, TryOnResultController],
  providers: [
    TryOnService,
    TryOnWorkerService,
    {
      provide: TRYON_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createProvider(config.ai.tryonProvider),
    },
  ],
  exports: [TryOnService, TryOnWorkerService],
})
export class TryOnModule {}
