import { Controller, Get, Inject, Param, Query } from '@nestjs/common';

import { SlotQuerySchema } from '@bridalos/contracts';

import { parseWith } from '../common/validation.js';
import { AppointmentsService } from './appointments.service.js';

/**
 * بازه‌های آزاد نوبت — عمومی (بدون ورود).
 * هیچ داده شخصی برنمی‌گردد: فقط ساعت‌های آزاد/اشغال یک مزون تأییدشده.
 */
@Controller('api/v1/public/boutiques')
export class PublicSlotsController {
  constructor(@Inject(AppointmentsService) private readonly appointments: AppointmentsService) {}

  @Get(':slug/slots')
  async slots(
    @Param('slug') slug: string,
    @Query() query: Record<string, string>,
  ): Promise<Awaited<ReturnType<AppointmentsService['publicSlots']>>> {
    const parsed = parseWith<{ date: string }>(SlotQuerySchema, query);
    return this.appointments.publicSlots(slug, parsed.date);
  }
}
