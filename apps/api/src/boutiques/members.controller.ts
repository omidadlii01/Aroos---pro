import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import {
  type BoutiqueMemberView,
  MemberInviteSchema,
  MemberRoleUpdateSchema,
} from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { parseWith } from '../common/validation.js';
import { RequireTenantRole, TenantGuard } from '../tenants/tenant.guard.js';
import { MembersService } from './members.service.js';

@Controller('api/v1/boutiques/active/members')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest): Promise<{ items: BoutiqueMemberView[] }> {
    return { items: await this.members.list(request.tenant!.boutiqueId) };
  }

  @Post('invite')
  @HttpCode(200)
  @RequireTenantRole('boutique_owner')
  async invite(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<Awaited<ReturnType<MembersService['invite']>>> {
    const input = parseWith(MemberInviteSchema, body);
    return this.members.invite(request.tenant!.boutiqueId, user.sub, input as never);
  }

  @Patch(':userId')
  @RequireTenantRole('boutique_owner')
  async updateRole(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<BoutiqueMemberView> {
    const input = parseWith(MemberRoleUpdateSchema, body);
    return this.members.updateRole(
      request.tenant!.boutiqueId,
      user.sub,
      userId,
      (input as { role: BoutiqueMemberView['role'] }).role,
    );
  }

  @Delete(':userId')
  @HttpCode(200)
  @RequireTenantRole('boutique_owner')
  async revoke(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ): Promise<{ revoked: true }> {
    return this.members.revoke(request.tenant!.boutiqueId, user.sub, userId);
  }
}
