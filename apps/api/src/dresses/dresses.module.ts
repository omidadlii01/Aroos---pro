import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { DressesController } from './dresses.controller.js';
import { DressesService } from './dresses.service.js';

@Module({
  imports: [AuditModule, AuthModule, TenantsModule],
  controllers: [DressesController],
  providers: [DressesService],
  exports: [DressesService],
})
export class DressesModule {}
