/**
 * کدهای خطای یکدست API. کلاینت فارسی‌محور بر اساس همین کدها پیام نشان می‌دهد
 * و متن خطا هرگز برای تصمیم امنیتی استفاده نمی‌شود.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'OTP_EXPIRED',
  'OTP_INVALID',
  'OTP_TOO_MANY_ATTEMPTS',
  'TENANT_REQUIRED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export const ERROR_MESSAGES_FA: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'اطلاعات ارسالی معتبر نیست.',
  UNAUTHENTICATED: 'برای انجام این کار باید وارد شوید.',
  FORBIDDEN: 'شما به این بخش دسترسی ندارید.',
  NOT_FOUND: 'موردی یافت نشد.',
  CONFLICT: 'این عملیات با وضعیت فعلی سامانه سازگار نیست.',
  RATE_LIMITED: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.',
  OTP_EXPIRED: 'کد تأیید منقضی شده است؛ کد جدید بگیرید.',
  OTP_INVALID: 'کد تأیید درست نیست.',
  OTP_TOO_MANY_ATTEMPTS: 'تعداد تلاش‌های ناموفق زیاد است؛ کد جدید بگیرید.',
  TENANT_REQUIRED: 'ابتدا مزون فعال خود را انتخاب کنید.',
  INTERNAL_ERROR: 'خطای داخلی رخ داد. لطفاً بعداً تلاش کنید.',
  SERVICE_UNAVAILABLE: 'سرویس موقتاً در دسترس نیست.',
  PROVIDER_UNAVAILABLE: 'سرویس بیرونی در دسترس نیست.',
};
