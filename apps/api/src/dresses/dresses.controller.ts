import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { DressCreateSchema, DressListQuerySchema, DressUpdateSchema } from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { AppError } from '../common/errors.js';
import { parseWith } from '../common/validation.js';
import { MediaService } from '../media/media.service.js';
import { RequireTenantRole, TenantGuard } from '../tenants/tenant.guard.js';
import { DressesService, type DressView } from './dresses.service.js';

@Controller('api/v1/dresses')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DressesController {
  constructor(
    @Inject(DressesService) private readonly dresses: DressesService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string>,
  ): Promise<{ items: DressView[]; total: number; page: number; pageSize: number }> {
    const parsed = parseWith<{ status?: never; q?: string; page: number; pageSize: number }>(
      DressListQuerySchema,
      query,
    );
    return this.dresses.listForTenant(request.tenant!.boutiqueId, parsed as never);
  }

  @Post()
  @RequireTenantRole('boutique_owner', 'branch_manager')
  async create(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<DressView> {
    const input = parseWith(DressCreateSchema, body);
    return this.dresses.create(request.tenant!.boutiqueId, user.sub, input as never);
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<DressView> {
    return this.dresses.getForTenant(request.tenant!.boutiqueId, id);
  }

  @Patch(':id')
  @RequireTenantRole('boutique_owner', 'branch_manager')
  async update(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DressView> {
    const input = parseWith(DressUpdateSchema, body);
    return this.dresses.update(request.tenant!.boutiqueId, user.sub, id, input as never);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequireTenantRole('boutique_owner')
  async publish(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<DressView> {
    return this.dresses.publish(request.tenant!.boutiqueId, user.sub, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequireTenantRole('boutique_owner', 'branch_manager')
  async archive(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<DressView> {
    return this.dresses.archive(request.tenant!.boutiqueId, user.sub, id);
  }

  /**
   * بارگذاری تصویر لباس (بدنه دودویی، حداکثر ۸ مگابایت).
   * هدر `x-rights-attested: true` الزامی است؛ بدون آن درخواست رد می‌شود.
   */
  @Post(':id/media')
  @RequireTenantRole('boutique_owner', 'branch_manager')
  async uploadMedia(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ media: { id: string; url: string; expiresAt: string; width: number | null; height: number | null } }> {
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw AppError.validation(
        undefined,
        'بدنه درخواست باید محتوای دودویی تصویر با content-type صحیح باشد.',
      );
    }
    const rightsAttested =
      String(request.headers['x-rights-attested'] ?? '').toLowerCase() === 'true';

    const media = await this.media.attach({
      boutiqueId: request.tenant!.boutiqueId,
      dressId: id,
      buffer: body,
      declaredType: String(request.headers['content-type'] ?? ''),
      rightsAttested,
    });
    return { media };
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(200)
  @RequireTenantRole('boutique_owner', 'branch_manager')
  async deleteMedia(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ): Promise<{ deleted: true }> {
    await this.media.removeForTenant(request.tenant!.boutiqueId, id, mediaId);
    return { deleted: true };
  }
}
