import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { Role } from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';

export type AccessTokenPayload = {
  sub: string;
  roles: Role[];
  /** مزون فعال انتخاب‌شده توسط کاربر؛ بدون آن endpointهای مزون در دسترس نیستند. */
  activeBoutiqueId: string | null;
  iat?: number;
  exp?: number;
};

@Injectable()
export class TokenService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(params: { userId: string; roles: Role[]; activeBoutiqueId: string | null }): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const accessToken = await this.jwt.signAsync(
      { sub: params.userId, roles: params.roles, activeBoutiqueId: params.activeBoutiqueId },
      { expiresIn: this.config.auth.jwtTtlSeconds },
    );
    return { accessToken, expiresIn: this.config.auth.jwtTtlSeconds };
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string') throw new Error('بدون شناسه کاربر');
      return payload;
    } catch {
      throw AppError.unauthenticated('نشست شما منقضی شده است؛ دوباره وارد شوید.');
    }
  }
}
