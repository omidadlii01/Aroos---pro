import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../../config/config.js';
import { runMigrations } from '../migrator.js';
import { createSqlRunner } from '../sql.js';

/** اجرای دستی migrationها: npm run db:migrate -w @bridalos/api */
async function main(): Promise<void> {
  const { config, warnings } = loadConfig(process.env);
  for (const warning of warnings) console.warn(`[config] ${warning}`);

  const runner = await createSqlRunner(config);
  try {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
    const report = await runMigrations(runner, { dir, onLog: (message) => console.log(message) });
    console.log(
      `اعمال‌شده: ${report.applied.length} | از قبل موجود: ${report.alreadyApplied.length} | درایور: ${runner.driver}`,
    );
  } finally {
    await runner.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
