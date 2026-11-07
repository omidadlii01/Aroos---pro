import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import { ERROR_MESSAGES_FA, type ApiErrorBody, type ErrorCode } from '@bridalos/contracts';

import { AppError } from './errors.js';
import { currentRequestStore, JsonLogger } from './logger.js';

type Mapped = { code: ErrorCode; status: number; message: string; details?: unknown };

function mapException(exception: unknown): Mapped {
  if (exception instanceof AppError) {
    return {
      code: exception.code,
      status: exception.status,
      message: exception.message,
      details: exception.details,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code: ErrorCode =
      status === HttpStatus.UNAUTHORIZED
        ? 'UNAUTHENTICATED'
        : status === HttpStatus.FORBIDDEN
          ? 'FORBIDDEN'
          : status === HttpStatus.NOT_FOUND
            ? 'NOT_FOUND'
            : status === HttpStatus.TOO_MANY_REQUESTS
              ? 'RATE_LIMITED'
              : status >= 500
                ? 'INTERNAL_ERROR'
                : 'VALIDATION_ERROR';
    return { code, status, message: ERROR_MESSAGES_FA[code] };
  }
  return { code: 'INTERNAL_ERROR', status: 500, message: ERROR_MESSAGES_FA.INTERNAL_ERROR };
}

/**
 * همه خطاها به یک قالب ثابت تبدیل می‌شوند و جزئیات فنی (stack) هرگز به کلاینت نمی‌رسد.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = currentRequestStore()?.requestId ?? 'unknown';
    const mapped = mapException(exception);

    if (mapped.status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception : { unexpected: String(exception) },
        exception instanceof Error ? exception.stack : undefined,
        'AllExceptionsFilter',
      );
    } else {
      this.logger.warn(
        { code: mapped.code, status: mapped.status },
        'AllExceptionsFilter',
      );
    }

    const body: ApiErrorBody = {
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId,
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
      },
    };

    if (
      mapped.code === 'RATE_LIMITED' &&
      mapped.details &&
      typeof mapped.details === 'object' &&
      'retryAfterSeconds' in mapped.details
    ) {
      const retryAfter = Number((mapped.details as { retryAfterSeconds: unknown }).retryAfterSeconds);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        response.setHeader('retry-after', String(Math.ceil(retryAfter)));
      }
    }

    response.status(mapped.status).json(body);
  }
}
