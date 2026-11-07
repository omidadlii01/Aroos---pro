import { Inject, Injectable } from '@nestjs/common';

import { currentRequestStore } from '../common/logger.js';
import { SQL_RUNNER } from '../database/database.module.js';
import type { SqlRunner } from '../database/sql.js';

export type AuditEntry = {
  actorUserId: string | null;
  tenantId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * ثبت رخدادهای حساس (ایجاد مزون، دعوت کارمند، لغو دسترسی، تغییر وضعیت).
 * متن رخداد هرگز شامل راز یا داده شخصی حساس نیست.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(SQL_RUNNER) private readonly runner: SqlRunner) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.runner.query(
      `INSERT INTO audit_logs (actor_user_id, tenant_id, action, entity_type, entity_id, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        entry.actorUserId,
        entry.tenantId ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        currentRequestStore()?.requestId ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  }
}
