import { AppError } from './errors.js';

export type Issue = { path: string; message: string };

export function extractIssues(error: unknown): Issue[] {
  const issues =
    (error as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues ?? [];
  return issues.map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join('.') : '',
    message: issue.message ?? 'مقدار نامعتبر',
  }));
}

type SafeParsable = {
  safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown };
};

/** اعتبارسنجی ورودی با پیام‌های فارسی و جزئیات ساخت‌یافته در پاسخ خطا. */
export function parseWith<T>(schema: SafeParsable, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(extractIssues(result.error));
  }
  return result.data as T;
}
