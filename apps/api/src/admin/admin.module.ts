import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PhotosModule } from '../photos/photos.module.js';
import { TryOnModule } from '../tryon/tryon.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Module({
  imports: [AuditModule, AuthModule, PhotosModule, TryOnModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
