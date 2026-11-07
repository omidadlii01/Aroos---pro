import { Inject, type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLE_LABELS_FA, TENANT_ROLE_RANK, type Role } from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { currentRequestStore } from '../common/logger.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';

export const TENANT_ROLES_KEY = 'tenant_roles';

/** حداقل نقش لازم در مزون فعال را مشخص می‌کند. */
export const RequireTenantRole = (...roles: Role[]) => SetMetadata(TENANT_ROLES_KEY, roles);

/**
 * بررسی سمت سرور عضویت در مزون فعال + سطح نقش.
 *
 * این guard منبع حقیقت کنترل دسترسی مزون است؛ مخفی‌کردن دکمه در UI هیچ‌گاه
 * جای آن را نمی‌گیرد. نبودِ عضویت → ۴۰۳.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth) throw AppError.unauthenticated();

    const boutiqueId = auth.activeBoutiqueId;
    if (!boutiqueId) throw AppError.tenantRequired();

    const rows = await this.runner.query<{ role: Role }>(
      `SELECT role FROM memberships
        WHERE user_id = $1 AND boutique_id = $2 AND revoked_at IS NULL`,
      [auth.sub, boutiqueId],
    );
    const membership = rows[0];
    if (!membership) throw AppError.forbidden('شما عضو این مزون نیستید.');

    request.tenant = { boutiqueId, role: membership.role };
    const store = currentRequestStore();
    if (store) store.tenantId = boutiqueId;

    const required = this.reflector.getAllAndOverride<Role[]>(TENANT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      const userRank = TENANT_ROLE_RANK[membership.role] ?? 0;
      const minimumRank = Math.min(...required.map((role) => TENANT_ROLE_RANK[role] ?? 0));
      if (userRank < minimumRank) {
        throw AppError.forbidden(
          `برای این عملیات نقش ${required.map((role) => ROLE_LABELS_FA[role]).join(' یا ')} لازم است.`,
        );
      }
    }
    return true;
  }
}
