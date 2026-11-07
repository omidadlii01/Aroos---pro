/**
 * پاک‌سازی عکس‌های منقضی برای cron در محیط واقعی.
 * نمونه crontab: `0 * * * * cd /srv/api && npm run photos:sweep`
 */
import { loadConfig } from '../../config/config.js';
import { runMigrations } from '../migrator.js';
import { createSqlRunner } from '../sql.js';
import { LocalMediaStorage } from '../../media/local-storage.js';
import { PhotosRetentionService } from '../../photos/photos-retention.service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const { config } = loadConfig(process.env);
  const runner = await createSqlRunner(config);
  try {
    await runMigrations(runner, {
      dir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations'),
    });
    const storage = new LocalMediaStorage(config);
    const service = new PhotosRetentionService(runner, storage, config);
    const result = await service.purgeExpired();
    console.log(`[PHOTOS SWEEP] حذف‌شده: ${result.purged} | خطا: ${result.failed}`);
  } finally {
    await runner.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
