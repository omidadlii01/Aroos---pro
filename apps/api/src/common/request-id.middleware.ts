import type { NextFunction, Request, Response } from 'express';

import { newRequestId, requestStorage } from './logger.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * شناسه درخواست: از هدر معتبر پذیرفته می‌شود، در غیر این صورت ساخته می‌شود.
 * همه لاگ‌ها و پاسخ خطا همین شناسه را برمی‌گردانند تا پیگیری ممکن باشد.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : newRequestId();
  res.setHeader('x-request-id', requestId);
  requestStorage.run({ requestId }, () => next());
}
