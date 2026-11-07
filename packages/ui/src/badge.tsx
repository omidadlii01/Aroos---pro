import type { ReactNode } from 'react';

export type BadgeProps = {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
  children: ReactNode;
};

const tones: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-800',
  brand: 'bg-brand-100 text-brand-800',
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
