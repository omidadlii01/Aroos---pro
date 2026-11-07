export const ROLES = [
  'platform_admin',
  'boutique_owner',
  'branch_manager',
  'boutique_staff',
  'bride',
  'support_agent',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS_FA: Record<Role, string> = {
  platform_admin: 'مدیر پلتفرم',
  boutique_owner: 'مالک مزون',
  branch_manager: 'مدیر شعبه',
  boutique_staff: 'کارمند مزون',
  bride: 'عروس',
  support_agent: 'پشتیبان',
};

/** نقش‌هایی که به یک مزون (tenant) گره می‌خورند. */
export const TENANT_ROLES: readonly Role[] = [
  'boutique_owner',
  'branch_manager',
  'boutique_staff',
] as const;

export function isTenantRole(role: Role): boolean {
  return TENANT_ROLES.includes(role);
}

/** سلسله‌مراتب اختیارات داخل مزون برای بررسی سرور‌ساید. */
export const TENANT_ROLE_RANK: Record<string, number> = {
  boutique_owner: 30,
  branch_manager: 20,
  boutique_staff: 10,
};

export const BOUTIQUE_STATUSES = ['draft', 'pending_review', 'approved', 'suspended'] as const;
export type BoutiqueStatus = (typeof BOUTIQUE_STATUSES)[number];

export const BOUTIQUE_STATUS_LABELS_FA: Record<BoutiqueStatus, string> = {
  draft: 'پیش‌نویس',
  pending_review: 'در انتظار بررسی',
  approved: 'تأییدشده',
  suspended: 'معلق',
};

/** وضعیت انتشار لباس — مستقل از وضعیت بررسی مزون. */
export const DRESS_STATUSES = ['draft', 'pending_review', 'published', 'archived'] as const;
export type DressStatus = (typeof DRESS_STATUSES)[number];
