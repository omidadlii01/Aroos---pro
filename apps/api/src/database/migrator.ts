import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { SqlRunner } from './sql.js';

export class MigrationChecksumError extends Error {
  constructor(
    readonly migrationId: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `محتوای migration «${migrationId}» پس از اجرا تغییر کرده است (${expected} ≠ ${actual}). ` +
        'migrationهای اجراشده نباید ویرایش شوند؛ یک migration جدید بسازید.',
    );
    this.name = 'MigrationChecksumError';
  }
}

export type MigrationReport = { applied: string[]; alreadyApplied: string[] };

const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;

/**
 * اجرای migrationهای نسخه‌بندی‌شده SQL با ثبت checksum.
 * هر فایل به‌صورت اتمیک (همراه با ثبت در schema_migrations) اجرا می‌شود.
 */
export async function runMigrations(
  runner: SqlRunner,
  options: { dir: string; onLog?: (message: string) => void },
): Promise<MigrationReport> {
  const log = options.onLog ?? (() => undefined);

  await runner.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const entries = await readdir(options.dir);
  const files = entries.filter((name) => MIGRATION_FILE.test(name)).sort();
  if (files.length === 0) {
    throw new Error(`هیچ فایل migration در ${options.dir} یافت نشد`);
  }

  const rows = await runner.query<{ id: string; checksum: string }>(
    'SELECT id, checksum FROM schema_migrations',
  );
  const appliedMap = new Map(rows.map((row) => [row.id, row.checksum]));

  const report: MigrationReport = { applied: [], alreadyApplied: [] };

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const sql = await readFile(path.join(options.dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
    const previous = appliedMap.get(id);

    if (previous !== undefined) {
      if (previous !== checksum) throw new MigrationChecksumError(id, previous, checksum);
      report.alreadyApplied.push(id);
      continue;
    }

    const escapedId = id.replace(/'/g, "''");
    await runner.exec(
      `BEGIN;\n${sql}\nINSERT INTO schema_migrations (id, checksum) VALUES ('${escapedId}', '${checksum}');\nCOMMIT;`,
    );
    report.applied.push(id);
    log(`migration اعمال شد: ${id}`);
  }

  return report;
}
