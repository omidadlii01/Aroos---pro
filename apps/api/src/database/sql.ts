import { mkdir } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import pgDriver from 'pg';
import type { PoolClient } from 'pg';

const { Pool } = pgDriver;

import type { AppConfig, DbDriver } from '../config/config.js';

/** کمینه‌ی لازم برای اجرای کوئری پارامتری و تراکنش. */
export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface SqlRunner extends SqlClient {
  readonly driver: DbDriver;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * پشتیبانی از دو درایور با یک قرارداد:
 * - `pglite`: پستگرس واقعی (WASM) درون‌فرایندی برای local و تست‌ها؛ بدون Docker.
 * - `postgres`: پستگرس واقعی در staging/production.
 * SQL یکسانی برای هر دو اجرا می‌شود؛ از dialect اختصاصی استفاده نمی‌شود.
 */
export async function createSqlRunner(config: AppConfig): Promise<SqlRunner> {
  if (config.db.driver === 'postgres') {
    if (!config.db.databaseUrl) throw new Error('DATABASE_URL برای درایور postgres الزامی است');
    const pool = new Pool({
      connectionString: config.db.databaseUrl,
      ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: 'bridalos-api',
    });

    return {
      driver: 'postgres',
      async query<T>(sql: string, params: readonly unknown[] = []) {
        const result = await pool.query(sql, params as unknown[]);
        return result.rows as T[];
      },
      async exec(sql: string) {
        await pool.query(sql);
      },
      async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
        const client: PoolClient = await pool.connect();
        const tx: SqlClient = {
          async query<U>(sql: string, params: readonly unknown[] = []) {
            const result = await client.query(sql, params as unknown[]);
            return result.rows as U[];
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        };
        try {
          await client.query('BEGIN');
          const value = await fn(tx);
          await client.query('COMMIT');
          return value;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async ping() {
        try {
          await pool.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  // pglite: dataDir می‌تواند مسیر دیسک یا 'memory://' باشد
  if (!config.db.pgliteDataDir.startsWith('memory://')) {
    await mkdir(config.db.pgliteDataDir, { recursive: true });
  }
  const pglite = await PGlite.create(config.db.pgliteDataDir);
  return {
    driver: 'pglite',
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const result = await pglite.query<T>(sql, params as unknown[]);
      return result.rows;
    },
    async exec(sql: string) {
      await pglite.exec(sql);
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      return pglite.transaction(async (trx) =>
        fn({
          async query<U>(sql: string, params: readonly unknown[] = []) {
            const result = await trx.query<U>(sql, params as unknown[]);
            return result.rows;
          },
          async exec(sql: string) {
            await trx.exec(sql);
          },
        }),
      );
    },
    async ping() {
      try {
        await pglite.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await pglite.close();
    },
  };
}
