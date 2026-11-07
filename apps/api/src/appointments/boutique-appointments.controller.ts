import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  AppointmentDeclineSchema,
  AppointmentListQuerySchema,
  AvailabilityUpdateSchema,
  type AppointmentListQuery,
  type AppointmentView,
  type AvailabilityRuleView,
  type AvailabilityUpdateInput,
} from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { parseWith } from '../common/validation.js';
import { RequireTenantRole, TenantGuard } from '../tenants/tenant.guard.js';
import { AppointmentsService } from './appointments.service.js';

/** مدیریت نوبت‌ها و ساعات کاری توسط کارکنان مزون فعال. */
@Controller('api/v1/boutiques/active')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BoutiqueAppointmentsController {
  constructor(@Inject(AppointmentsService) private readonly appointments: AppointmentsService) {}

  @Get('appointments')
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string>,
  ): Promise<{ items: AppointmentView[] }> {
    const parsed = parseWith<AppointmentListQuery>(AppointmentListQuerySchema, query);
    return { items: await this.appointments.listForBoutique(request.tenant!.boutiqueId, parsed) };
  }

  @Post('appointments/:id/confirm')
  @HttpCode(200)
  async confirm(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AppointmentView> {
    return this.appointments.confirm(user.sub, request.tenant!.boutiqueId, id);
  }

  @Post('appointments/:id/decline')
  @HttpCode(200)
  async decline(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AppointmentView> {
    const input = parseWith<{ reason: string }>(AppointmentDeclineSchema, body);
    return this.appointments.decline(user.sub, request.tenant!.boutiqueId, id, input.reason);
  }

  @Post('appointments/:id/complete')
  @HttpCode(200)
  async complete(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AppointmentView> {
    return this.appointments.complete(user.sub, request.tenant!.boutiqueId, id);
  }

  @Post('appointments/:id/no-show')
  @HttpCode(200)
  async noShow(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AppointmentView> {
    return this.appointments.markNoShow(user.sub, request.tenant!.boutiqueId, id);
  }

  @Get('availability')
  async availability(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ rules: AvailabilityRuleView[] }> {
    return this.appointments.getAvailability(request.tenant!.boutiqueId);
  }

  @Put('availability')
  @RequireTenantRole('boutique_owner', 'branch_manager')
  async setAvailability(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<{ rules: AvailabilityRuleView[] }> {
    const input = parseWith<AvailabilityUpdateInput>(AvailabilityUpdateSchema, body);
    return this.appointments.setAvailability(user.sub, request.tenant!.boutiqueId, input);
  }
}
