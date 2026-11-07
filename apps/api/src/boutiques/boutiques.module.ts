import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { BoutiquesController } from './boutiques.controller.js';
import { BoutiquesService } from './boutiques.service.js';

@Module({
  imports: [AuditModule, AuthModule, TenantsModule],
  controllers: [BoutiquesController],
  providers: [BoutiquesService],
  exports: [BoutiquesService],
})
export class BoutiquesModule {}
