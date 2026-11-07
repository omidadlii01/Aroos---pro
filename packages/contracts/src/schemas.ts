import { z } from 'zod';

import { isValidOtpCode, normalizeOtpCode } from './otp.js';
import { parseIranianMobile } from './phone.js';
import {
  BOUTIQUE_STATUSES,
  DRESS_CATEGORIES,
  DRESS_STATUSES,
  ROLES,
  type BoutiqueStatus,
  type Role,
  type TryOnStatus,
} from './roles.js';

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

/* ------------------------------------------------------------------ */
/* اعضای مزون (خانواده/کارکنان)                                        */
/* ------------------------------------------------------------------ */

export const MemberRoleSchema = z.enum(['branch_manager', 'boutique_staff']);

export const MemberInviteSchema = z.object({
  phone: IranianMobileSchema,
  role: MemberRoleSchema,
});

export const MemberRoleUpdateSchema = z.object({
  role: MemberRoleSchema,
});

export type MemberInviteInput = z.infer<typeof MemberInviteSchema>;

export type BoutiqueMemberView = {
  userId: string;
  displayName: string | null;
  phoneMasked: string;
  role: Role;
  invitedAt: string;
  revokedAt: string | null;
};

/* ------------------------------------------------------------------ */
/* لباس (کاتالوگ)                                                      */
/* ------------------------------------------------------------------ */

const ShortAttribute = z
  .string()
  .trim()
  .max(40, 'حداکثر ۴۰ نویسه')
  .optional();

/** قیمت‌ها از فرم به **تومان** می‌آیند و سرویس آن‌ها را به ریال تبدیل می‌کند. */
const TomanAmount = z
  .number({ error: 'مبلغ باید عدد باشد' })
  .int('مبلغ باید عدد صحیح باشد')
  .min(0, 'مبلغ نمی‌تواند منفی باشد')
  .max(1_000_000_000_000, 'مبلغ خارج از محدوده مجاز است')
  .optional();

export const DressCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,32}$/, 'کد لباس باید ۲ تا ۳۲ نویسه لاتین/رقم/خط تیره باشد'),
    name: PersianText(2, 120, 'نام لباس'),
    description: PersianText(0, 3000, 'توضیحات').optional(),
    category: z.enum(DRESS_CATEGORIES).default('wedding'),
    silhouette: ShortAttribute,
    neckline: ShortAttribute,
    sleeve: ShortAttribute,
    skirt: ShortAttribute,
    fabric: ShortAttribute,
    embellishment: ShortAttribute,
    color: ShortAttribute,
    priceMinToman: TomanAmount,
    priceMaxToman: TomanAmount,
    sampleAvailable: z.boolean().default(true),
    orderable: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.priceMinToman === undefined ||
      value.priceMaxToman === undefined ||
      value.priceMaxToman >= value.priceMinToman,
    { message: 'بیشترین قیمت نباید کمتر از کمترین قیمت باشد', path: ['priceMaxToman'] },
  );

export type DressCreateInput = z.infer<typeof DressCreateSchema>;

export const DressUpdateSchema = z
  .object({
    name: PersianText(2, 120, 'نام لباس').optional(),
    description: PersianText(0, 3000, 'توضیحات').optional(),
    category: z.enum(DRESS_CATEGORIES).optional(),
    silhouette: ShortAttribute,
    neckline: ShortAttribute,
    sleeve: ShortAttribute,
    skirt: ShortAttribute,
    fabric: ShortAttribute,
    embellishment: ShortAttribute,
    color: ShortAttribute,
    priceMinToman: TomanAmount,
    priceMaxToman: TomanAmount,
    sampleAvailable: z.boolean().optional(),
    orderable: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک فیلد برای ویرایش لازم است',
  })
  .refine(
    (value) =>
      value.priceMinToman === undefined ||
      value.priceMaxToman === undefined ||
      value.priceMaxToman >= value.priceMinToman,
    { message: 'بیشترین قیمت نباید کمتر از کمترین قیمت باشد', path: ['priceMaxToman'] },
  );

export type DressUpdateInput = z.infer<typeof DressUpdateSchema>;

export const DressListQuerySchema = z.object({
  status: z.enum(DRESS_STATUSES).optional(),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});

export const PublicCatalogQuerySchema = z.object({
  city: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,30}$/)
    .optional(),
  category: z.enum(DRESS_CATEGORIES).optional(),
  priceMaxToman: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(40).default(12),
});

export type PublicCatalogQuery = z.infer<typeof PublicCatalogQuerySchema>;

/* ------------------------------------------------------------------ */
/* بررسی پلتفرم (ادمین)                                                */
/* ------------------------------------------------------------------ */

export const BoutiqueRejectSchema = z.object({
  reason: z
    .string({ error: 'دلیل رد الزامی است' })
    .trim()
    .min(5, 'دلیل رد باید حداقل ۵ نویسه باشد')
    .max(500, 'دلیل رد نباید بیش از ۵۰۰ نویسه باشد'),
});

export type BoutiqueRejectInput = z.infer<typeof BoutiqueRejectSchema>;

export const AdminBoutiqueListQuerySchema = z.object({
  status: z.enum(BOUTIQUE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const AdminAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** نمای مزون در پنل ادمین — شماره مالک همیشه ماسک‌شده است. */
export type AdminBoutiqueView = {
  id: string;
  slug: string;
  name: string;
  citySlug: string;
  status: BoutiqueStatus;
  ownerName: string | null;
  ownerPhoneMasked: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  dressCount: number;
  publishedDressCount: number;
  createdAt: string;
};

export type AdminOverview = {
  boutiques: Record<BoutiqueStatus, number>;
  dresses: Record<string, number>;
  pendingBoutiques: number;
  users: number;
  publishedDresses: number;
};

export type AdminAuditView = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* عکس شخصی عروس (فاز ۶)                                              */
/* ------------------------------------------------------------------ */

/**
 * نسخه رضایت‌نامه. هر تغییر در متن رضایت باید نسخه را بالا ببرد تا
 * رضایت‌های قبلی با متن جدید اشتباه گرفته نشوند.
 */
export const PHOTO_CONSENT_VERSION = 'v1';

/** مدت نگه‌داری پیش‌فرض عکس عروس (روز)؛ پس از آن حذف خودکار. */
export const PHOTO_RETENTION_DAYS = 90;

/** متن رسمی رضایت‌نامه — UI و API از همین منبع استفاده می‌کنند. */
export const PHOTO_CONSENT_TEXT_FA =
  'با آگاهی کامل موافقم که تصویرم فقط برای پیش‌نمایش مجازی لباس استفاده شود؛ ' +
  'تصویر در فضای خصوصی ذخیره می‌شود، در کاتالوگ یا شبکه اجتماعی منتشر نمی‌شود و ' +
  'در هر زمان می‌توانم آن را حذف کنم. می‌دانم پیش‌نمایش مجازی تخمین بصری است و ' +
  'تضمین اندازه، جنس پارچه یا نتیجه دوخت نیست.';

export type BridePhotoView = {
  id: string;
  url: string;
  expiresAt: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  consentVersion: string;
  consentGivenAt: string;
  retentionUntil: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* امتحان مجازی (فاز ۶ — وضعیت صریح)                                   */
/* ------------------------------------------------------------------ */

export const TryOnCreateSchema = z.object({
  photoId: z.uuid('شناسه عکس معتبر نیست'),
  dressId: z.uuid('شناسه لباس معتبر نیست'),
});

export type TryOnCreateInput = z.infer<typeof TryOnCreateSchema>;

export type TryOnView = {
  id: string;
  photoId: string | null;
  dressId: string;
  status: TryOnStatus;
  statusReason: string | null;
  provider: string;
  aiConfigured: boolean;
  createdAt: string;
};
