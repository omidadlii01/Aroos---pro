import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { Role } from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { currentRequestStore } from '../common/logger.js';
import { TokenService, type AccessTokenPayload } from './token.service.js';

export type AuthenticatedRequest = Request & {
  auth: AccessTokenPayload;
  tenant?: { boutiqueId: string; role: Role };
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppError.unauthenticated();

    const payload = await this.tokens.verify(header.slice('Bearer '.length).trim());
    request.auth = payload;

    const store = currentRequestStore();
    if (store) store.userId = payload.sub;
    return true;
  }
}
