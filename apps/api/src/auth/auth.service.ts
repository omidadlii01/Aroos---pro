import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthSessionResponse,
  MembershipSummary,
  OtpChallengeResponse,
  Role,
  SessionUser,
} from '@bridalos/contracts';

import { AppError } from '../common/errors.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

type UserRow = {
  id: string;
  phone: string;
  display_name: string | null;
  platform_role: Role | null;
};

type MembershipRow = {
  boutique_id: string;
  boutique_name: string;
  role: Role;
  status: MembershipSummary['status'];
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SQL_RUNNER) private readonly runner: SqlRunner,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async requestOtp(phone: string, ip: string | undefined): Promise<OtpChallengeResponse> {
    // IP فقط به‌صورت هش‌شده ذخیره می‌شود (برای محدودیت نرخ)، نه خام.
    const ipHash = ip
      ? createHmac('sha256', this.config.auth.otpPepper).update(ip).digest('hex').slice(0, 32)
      : null;
    return this.otp.request(phone, ipHash);
  }

  async verifyOtp(challengeId: string, code: string): Promise<AuthSessionResponse> {
    const { userId } = await this.otp.verify(challengeId, code);
    return this.buildSession(userId, null);
  }

  async selectTenant(userId: string, boutiqueId: string): Promise<AuthSessionResponse> {
    return this.buildSession(userId, boutiqueId, { requireMembership: true });
  }

  async getSessionUser(userId: string): Promise<SessionUser> {
    const { user } = await this.loadUser(userId);
    return user;
  }

  private async loadUser(
    userId: string,
  ): Promise<{ user: SessionUser; memberships: MembershipRow[]; platformRole: Role | null }> {
    const userRows = await this.runner.query<UserRow>(
      'SELECT id, phone, display_name, platform_role FROM users WHERE id = $1',
      [userId],
    );
    const row = userRows[0];
    if (!row) throw AppError.unauthenticated('حساب کاربری یافت نشد.');

    const memberships = await this.runner.query<MembershipRow>(
      `SELECT m.boutique_id, b.name AS boutique_name, m.role, b.status
         FROM memberships m
         JOIN boutiques b ON b.id = m.boutique_id
        WHERE m.user_id = $1 AND m.revoked_at IS NULL
        ORDER BY b.name ASC`,
      [userId],
    );

    const membershipRoles = memberships.map((membership) => membership.role);
    const roles: Role[] = [
      ...(row.platform_role ? [row.platform_role] : []),
      ...membershipRoles,
    ];
    if (roles.length === 0) roles.push('bride');

    const user: SessionUser = {
      id: row.id,
      phone: row.phone,
      displayName: row.display_name,
      roles,
      memberships: memberships.map((membership) => ({
        boutiqueId: membership.boutique_id,
        boutiqueName: membership.boutique_name,
        role: membership.role,
        status: membership.status,
      })),
    };
    return { user, memberships, platformRole: row.platform_role };
  }

  private async buildSession(
    userId: string,
    requestedBoutiqueId: string | null,
    options: { requireMembership?: boolean } = {},
  ): Promise<AuthSessionResponse> {
    const { user, memberships } = await this.loadUser(userId);

    let activeBoutiqueId: string | null = null;
    if (requestedBoutiqueId) {
      const membership = memberships.find((item) => item.boutique_id === requestedBoutiqueId);
      if (!membership) {
        // پیام عمومی است تا وجود یا نبود مزون لو نرود.
        throw AppError.forbidden('شما عضو این مزون نیستید.');
      }
      activeBoutiqueId = membership.boutique_id;
    } else if (!options.requireMembership && memberships.length === 1) {
      // اگر کاربر تنها یک عضویت دارد، همان به‌عنوان مزون فعال انتخاب می‌شود.
      activeBoutiqueId = memberships[0]?.boutique_id ?? null;
    }

    const token = await this.tokens.issue({
      userId: user.id,
      roles: user.roles,
      activeBoutiqueId,
    });

    return {
      accessToken: token.accessToken,
      expiresIn: token.expiresIn,
      user,
      activeBoutiqueId,
    };
  }
}
