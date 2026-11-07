import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';

import {
  AppointmentCreateSchema,
  APPOINTMENT_NO_SMS_NOTE_FA,
  type AppointmentView,
} from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { parseWith } from '../common/validation.js';
import { AppointmentsService } from './appointments.service.js';

/** نوبت‌های عروس (سمت کاربر). */
@Controller('api/v1/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(@Inject(AppointmentsService) private readonly appointments: AppointmentsService) {}

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<{ appointment: AppointmentView; smsSent: false; noteFa: string }> {
    const input = parseWith(AppointmentCreateSchema, body);
    const appointment = await this.appointments.create(user.sub, input as never);
    return { appointment, smsSent: false, noteFa: APPOINTMENT_NO_SMS_NOTE_FA };
  }

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload): Promise<{ items: AppointmentView[] }> {
    return { items: await this.appointments.listMine(user.sub) };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AppointmentView> {
    return this.appointments.getOwn(user.sub, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AppointmentView> {
    return this.appointments.cancelMine(user.sub, id);
  }
}
