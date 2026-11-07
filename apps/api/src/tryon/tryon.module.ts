import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { TryOnController } from './tryon.controller.js';
import { TryOnService } from './tryon.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TryOnController],
  providers: [TryOnService],
  exports: [TryOnService],
})
export class TryOnModule {}
