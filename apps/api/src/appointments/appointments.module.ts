import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';

import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { BoutiqueAppointmentsController } from './boutique-appointments.controller.js';
import { PublicSlotsController } from './public-slots.controller.js';

/** نوبت‌دهی مزون (فاز ۸). Audit برای ثبت تغییر وضعیت‌ها لازم است. */
@Module({
  imports: [AuditModule, AuthModule, TenantsModule],
  controllers: [
    AppointmentsController,
    BoutiqueAppointmentsController,
    PublicSlotsController,
  ],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
