import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AppError } from '../common/errors.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import type { AccessTokenPayload } from './token.service.js';

/** اطلاعات نشست جاری (فقط بعد از JwtAuthGuard معتبر است). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw AppError.unauthenticated();
    return request.auth;
  },
);
