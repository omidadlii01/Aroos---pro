import { Inject, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AppError } from '../common/errors.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

/**
 * کنترل دسترسی پنل پلتفرم.
 *
 * نقش از دیتابیس خوانده می‌شود، نه از ادعای توکن؛ اگر نقش کاربر پس از صدور توکن
 * گرفته شود، همان توکن بلافاصله بی‌اثر می‌گردد (مطابق منطق TenantGuard).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@Inject(SQL_RUNNER) private readonly runner: SqlRunner) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth) throw AppError.unauthenticated();

    const rows = await this.runner.query<{ platform_role: string | null }>(
      'SELECT platform_role FROM users WHERE id = $1',
      [auth.sub],
    );
    if (rows[0]?.platform_role !== 'platform_admin') {
      throw AppError.forbidden('این بخش فقط برای مدیر پلتفرم در دسترس است.');
    }

    return true;
  }
}
