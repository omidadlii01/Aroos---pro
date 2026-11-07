import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { TryOnCreateSchema, type TryOnView } from '@bridalos/contracts';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenPayload } from '../auth/token.service.js';
import { parseWith } from '../common/validation.js';
import { TryOnService } from './tryon.service.js';

/**
 * امتحان مجازی — همیشه پشت احراز هویت و محدود به داده خود کاربر.
 * پاسخ در این فاز وضعیت `blocked` را صریح برمی‌گرداند؛ هیچ نتیجه‌ای جعل نمی‌شود.
 */
@Controller('api/v1/tryon')
@UseGuards(JwtAuthGuard)
export class TryOnController {
  constructor(@Inject(TryOnService) private readonly tryon: TryOnService) {}

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ): Promise<TryOnView> {
    const input = parseWith(TryOnCreateSchema, body);
    return this.tryon.create(user.sub, input as never);
  }

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload): Promise<{ items: TryOnView[] }> {
    return { items: await this.tryon.listMine(user.sub) };
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') requestId: string,
  ): Promise<TryOnView> {
    return this.tryon.getMine(user.sub, requestId);
  }
}
