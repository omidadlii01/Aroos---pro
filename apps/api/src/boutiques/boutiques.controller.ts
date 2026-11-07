import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { BoutiqueCreateSchema, BoutiqueUpdateSchema } from '@bridalos/contracts';

import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { parseWith } from '../common/validation.js';
import { TenantGuard } from '../tenants/tenant.guard.js';
import { BoutiquesService, type BoutiqueView } from './boutiques.service.js';

@Controller('api/v1/boutiques')
@UseGuards(JwtAuthGuard)
export class BoutiquesController {
  constructor(@Inject(BoutiquesService) private readonly boutiques: BoutiquesService) {}

  /** مزون فعالِ توکن (اثبات کنترل دسترسی مزون در سطح سرور). */
  @Get('active')
  @UseGuards(TenantGuard)
  active(@Req() request: AuthenticatedRequest): { tenant: { boutiqueId: string; role: string } } {
    return { tenant: request.tenant! };
  }

  @Get('mine')
  async listMine(@CurrentUser() user: AccessTokenPayload): Promise<{ items: BoutiqueView[] }> {
    return { items: await this.boutiques.listMine(user.sub) };
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<BoutiqueView> {
    const input = parseWith(BoutiqueCreateSchema, body);
    return this.boutiques.create(user.sub, input as never);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<BoutiqueView> {
    return this.boutiques.getForUser(user.sub, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<BoutiqueView> {
    const input = parseWith(BoutiqueUpdateSchema, body);
    return this.boutiques.updateOwned(user.sub, id, input as never);
  }

  @Post(':id/submit-review')
  @HttpCode(200)
  async submitReview(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<BoutiqueView> {
    return this.boutiques.submitForReview(user.sub, id);
  }
}
