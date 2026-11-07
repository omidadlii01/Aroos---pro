import { z } from 'zod';

import { isValidOtpCode, normalizeOtpCode } from './otp.js';
import { parseIranianMobile } from './phone.js';
import { BOUTIQUE_STATUSES, ROLES, type BoutiqueStatus, type Role } from './roles.js';

/** شماره موبایل ایران → همیشه به `09xxxxxxxxx` نرمال می‌شود. */
export const IranianMobileSchema = z
  .string({ error: 'شماره موبایل الزامی است' })
  .trim()
  .min(1, 'شماره موبایل الزامی است')
  .transform((value, ctx) => {
    const parsed = parseIranianMobile(value);
    if (!parsed.ok) {
      ctx.addIssue({
        code: 'custom',
        message:
          parsed.reason === 'invalid_prefix'
            ? 'شماره موبایل باید با ۰۹ شروع شود'
            : 'شماره موبایل معتبر نیست',
      });
      return z.NEVER;
    }
    return parsed.value;
  });

export const OtpRequestSchema = z.object({
  phone: IranianMobileSchema,
});

export const OtpVerifySchema = z.object({
  challengeId: z.uuid('شناسه درخواست کد معتبر نیست'),
  code: z
    .string()
    .transform(normalizeOtpCode)
    .refine(isValidOtpCode, 'کد تأیید باید ۵ رقم باشد'),
});

export const SelectTenantSchema = z.object({
  boutiqueId: z.uuid('شناسه مزون معتبر نیست'),
});

const PersianText = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} الزامی است` })
    .trim()
    .min(min, `${label} باید حداقل ${min} نویسه باشد`)
    .max(max, `${label} نباید بیش از ${max} نویسه باشد`);

export const BoutiqueCreateSchema = z.object({
  name: PersianText(2, 80, 'نام مزون'),
  citySlug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, 'شهر معتبر نیست'),
  description: PersianText(0, 2000, 'توضیحات').optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'نشانی باید لاتین و بین ۳ تا ۴۰ نویسه باشد')
    .optional(),
  publicPhone: z
    .string()
    .trim()
    .regex(/^0\d{2,3}-?\d{7,8}$/, 'تلفن ثابت معتبر نیست')
    .optional(),
});

export type BoutiqueCreateInput = z.infer<typeof BoutiqueCreateSchema>;

export const BoutiqueUpdateSchema = z
  .object({
    name: PersianText(2, 80, 'نام مزون').optional(),
    citySlug: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{1,30}$/, 'شهر معتبر نیست')
      .optional(),
    description: PersianText(0, 2000, 'توضیحات').optional(),
    publicPhone: z
      .string()
      .trim()
      .regex(/^0\d{2,3}-?\d{7,8}$/, 'تلفن ثابت معتبر نیست')
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک فیلد برای ویرایش لازم است',
  });

export type BoutiqueUpdateInput = z.infer<typeof BoutiqueUpdateSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;

/** پاسخ درخواست کد یکبارمصرف. */
export type OtpChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: 'sms' | 'dev-log';
  /**
   * فقط در محیط local/dev و وقتی AUTH_DEV_ECHO_OTP=true باشد پر می‌شود تا
   * تست دستی بدون سرویس پیامک واقعی ممکن باشد. در production همیشه حذف است.
   */
  devCode?: string;
};

export type MembershipSummary = {
  boutiqueId: string;
  boutiqueName: string;
  role: Role;
  status: BoutiqueStatus;
};

export type SessionUser = {
  id: string;
  phone: string;
  displayName: string | null;
  roles: Role[];
  memberships: MembershipSummary[];
};

export type AuthSessionResponse = {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
  activeBoutiqueId: string | null;
};

export const roleSchema = z.enum(ROLES);
export const boutiqueStatusSchema = z.enum(BOUTIQUE_STATUSES);
