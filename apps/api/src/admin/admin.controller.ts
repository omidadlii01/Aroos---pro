import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  AdminAuditQuerySchema,
  AdminBoutiqueListQuerySchema,
  BoutiqueRejectSchema,
  type AdminAuditView,
  type AdminBoutiqueView,
  type AdminOverview,
} from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { parseWith } from '../common/validation.js';
import { AdminService } from './admin.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

/**
 * پنل مدیر پلتفرم.
 *
 * تمام مسیرها با JwtAuthGuard + PlatformAdminGuard محافظت می‌شوند؛ نقش از
 * دیتابیس بررسی می‌شود و توکن مزون‌دار یا عروس در این بخش ۴۰۳ می‌گیرد.
 */
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('overview')
  async overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  @Get('boutiques')
  async boutiques(
    @Query() query: Record<string, unknown>,
  ): Promise<{ items: AdminBoutiqueView[]; total: number; page: number; pageSize: number }> {
    const parsed = parseWith(AdminBoutiqueListQuerySchema, query);
    return this.admin.listBoutiques(parsed as never);
  }

  @Post('boutiques/:id/approve')
  async approve(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') boutiqueId: string,
  ): Promise<AdminBoutiqueView> {
    return this.admin.approve(user.sub, boutiqueId);
  }

  @Post('boutiques/:id/reject')
  async reject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') boutiqueId: string,
    @Body() body: unknown,
  ): Promise<AdminBoutiqueView> {
    const input = parseWith(BoutiqueRejectSchema, body);
    return this.admin.reject(user.sub, boutiqueId, input as never);
  }

  @Get('audit')
  async audit(@Query() query: Record<string, unknown>): Promise<{ items: AdminAuditView[] }> {
    const parsed = parseWith(AdminAuditQuerySchema, query);
    return { items: await this.admin.auditLog((parsed as { limit: number }).limit) };
  }
}
