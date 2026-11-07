import { ERROR_MESSAGES_FA, type ErrorCode } from '@bridalos/contracts';

/**
 * خطای دامنه با کد یکدست، پیام فارسی و وضعیت HTTP.
 * متن پیام هرگز برای تصمیم امنیتی استفاده نمی‌شود؛ کد خطا مرجع است.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_MESSAGES_FA[code]);
    this.name = 'AppError';
  }

  static validation(details?: unknown, message?: string): AppError {
    return new AppError('VALIDATION_ERROR', 400, message, details);
  }
  static unauthenticated(message?: string): AppError {
    return new AppError('UNAUTHENTICATED', 401, message);
  }
  static forbidden(message?: string): AppError {
    return new AppError('FORBIDDEN', 403, message);
  }
  static notFound(message?: string): AppError {
    return new AppError('NOT_FOUND', 404, message);
  }
  static conflict(message?: string): AppError {
    return new AppError('CONFLICT', 409, message);
  }
  static rateLimited(retryAfterSeconds: number, message?: string): AppError {
    return new AppError('RATE_LIMITED', 429, message, { retryAfterSeconds });
  }
  static otpExpired(): AppError {
    return new AppError('OTP_EXPIRED', 401);
  }
  static otpInvalid(): AppError {
    return new AppError('OTP_INVALID', 401);
  }
  static otpTooManyAttempts(): AppError {
    return new AppError('OTP_TOO_MANY_ATTEMPTS', 429);
  }
  static tenantRequired(): AppError {
    return new AppError('TENANT_REQUIRED', 400);
  }
  static serviceUnavailable(message?: string): AppError {
    return new AppError('SERVICE_UNAVAILABLE', 503, message);
  }
  static internal(message?: string): AppError {
    return new AppError('INTERNAL_ERROR', 500, message);
  }
}
