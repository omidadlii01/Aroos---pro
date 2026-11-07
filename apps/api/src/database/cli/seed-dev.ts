/**
 * داده نمایشی محیط توسعه — با برچسب صریح.
 *
 * این اسکریپت هرگز در production اجرا نمی‌شود و همه رکوردهای آن قابل شناسایی‌اند:
 * شماره‌ها با پیش‌شماره ۰۹۰۰۰۰۰ و نام مزون‌ها با پیشوند «[داده آزمایشی]».
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../../config/config.js';
import { runMigrations } from '../migrator.js';
import { createSqlRunner, type SqlClient } from '../sql.js';

const SEED_USERS = [
  { phone: '09000000001', name: 'مدیر پلتفرم (نمونه)', platformRole: 'platform_admin' },
  { phone: '09000000002', name: 'مالک مزون نمونه', platformRole: null },
  { phone: '09000000003', name: 'عروس نمونه', platformRole: null },
];

const SEED_BOUTIQUES = [
  {
    slug: 'namune-tehran',
    name: '[داده آزمایشی] مزون نمونه تهران',
    citySlug: 'tehran',
    description: 'این رکورد داده نمایشی محیط توسعه است و در production وجود ندارد.',
    ownerPhone: '09000000002',
  },
];

async function seed(runner: SqlClient): Promise<void> {
  const userIds = new Map<string, string>();

  for (const user of SEED_USERS) {
    const rows = await runner.query<{ id: string }>(
      `INSERT INTO users (phone, display_name, platform_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [user.phone, user.name, user.platformRole],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error(`ساخت کاربر آزمایشی ناموفق بود: ${user.phone}`);
    userIds.set(user.phone, id);
  }

  for (const boutique of SEED_BOUTIQUES) {
    const ownerId = userIds.get(boutique.ownerPhone);
    if (!ownerId) throw new Error('کاربر مالک برای مزون آزمایشی یافت نشد');

    const rows = await runner.query<{ id: string }>(
      `INSERT INTO boutiques (slug, name, city_slug, description, status, owner_user_id)
       VALUES ($1, $2, $3, $4, 'approved', $5)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [boutique.slug, boutique.name, boutique.citySlug, boutique.description, ownerId],
    );
    const boutiqueId = rows[0]?.id;
    if (!boutiqueId) throw new Error('ساخت مزون آزمایشی ناموفق بود');

    await runner.query(
      `INSERT INTO memberships (user_id, boutique_id, role)
       VALUES ($1, $2, 'boutique_owner')
       ON CONFLICT (user_id, boutique_id) DO NOTHING`,
      [ownerId, boutiqueId],
    );
  }
}

async function main(): Promise<void> {
  const { config } = loadConfig(process.env);
  if (config.isProduction) {
    throw new Error('اجرای seed داده آزمایشی در production ممنوع است');
  }

  const runner = await createSqlRunner(config);
  try {
    await runMigrations(runner, { dir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations') });
    await runner.transaction(async (tx) => {
      await seed(tx);
    });
    console.log('[DEV SEED] داده نمایشی محیط توسعه با موفقیت درج شد (شماره‌ها: ۰۹۰۰۰۰۰۰۰۰۱ تا ۰۹۰۰۰۰۰۰۰۰۳).');
  } finally {
    await runner.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
