import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  type AuthSessionResponse,
  OtpRequestSchema,
  OtpVerifySchema,
  type SessionUser,
  SelectTenantSchema,
} from '@bridalos/contracts';

import { parseWith } from '../common/validation.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AccessTokenPayload } from './token.service.js';

@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body() body: unknown, @Req() request: Request): Promise<unknown> {
    const parsed = parseWith<{ phone: string }>(OtpRequestSchema, body);
    return this.auth.requestOtp(parsed.phone, request.ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() body: unknown): Promise<AuthSessionResponse> {
    const parsed = parseWith<{ challengeId: string; code: string }>(OtpVerifySchema, body);
    return this.auth.verifyOtp(parsed.challengeId, parsed.code);
  }

  @Post('tenant')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async selectTenant(
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AuthSessionResponse> {
    const parsed = parseWith<{ boutiqueId: string }>(SelectTenantSchema, body);
    return this.auth.selectTenant(user.sub, parsed.boutiqueId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AccessTokenPayload): Promise<{ user: SessionUser; activeBoutiqueId: string | null }> {
    const sessionUser = await this.auth.getSessionUser(user.sub);
    return { user: sessionUser, activeBoutiqueId: user.activeBoutiqueId };
  }
}
