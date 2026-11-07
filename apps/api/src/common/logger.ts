import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { LoggerService } from '@nestjs/common';
import type { LogLevel } from '../config/config.js';

export type RequestStore = {
  requestId: string;
  userId?: string;
  tenantId?: string;
};

/** زمینه درخواست جاری برای لاگ ساخت‌یافته بدون پاس‌دادن دستی پارامترها. */
export const requestStorage = new AsyncLocalStorage<RequestStore>();

export function currentRequestStore(): RequestStore | undefined {
  return requestStorage.getStore();
}

export function newRequestId(): string {
  return randomUUID();
}

const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'code',
  'otp',
  'codehash',
  'phone',
  'apikey',
  'api_key',
];

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * لاگ ساخت‌یافته JSON. هیچ راز یا شماره کامل موبایل در لاگ نوشته نمی‌شود.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly minLevel: LogLevel = 'info') {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  private write(level: LogLevel, message: unknown, context?: string, trace?: string): void {
    if ((LEVEL_WEIGHT[level] ?? 0) < (LEVEL_WEIGHT[this.minLevel] ?? 0)) return;
    const store = currentRequestStore();
    const payload: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      msg: typeof message === 'string' ? message : redact(message),
    };
    if (context) payload['context'] = context;
    if (store?.requestId) payload['requestId'] = store.requestId;
    if (store?.userId) payload['userId'] = store.userId;
    if (store?.tenantId) payload['tenantId'] = store.tenantId;
    if (trace) payload['trace'] = trace;

    const line = JSON.stringify(payload);
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }
}

/** حذف/ماسک مقادیر حساس در لاگ (عمق محدود برای جلوگیری از حلقه). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((needle) => key.toLowerCase().includes(needle))) {
        output[key] = '[redacted]';
      } else {
        output[key] = redact(item, depth + 1);
      }
    }
    return output;
  }
  return value;
}
