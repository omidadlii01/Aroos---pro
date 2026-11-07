import type { ReactNode } from 'react';

export type AlertProps = {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: ReactNode;
};

const tones: Record<NonNullable<AlertProps['tone']>, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
};

/** پیام وضعیت با نقش دسترس‌پذیر (role="status"/"alert"). */
export function Alert({ tone = 'info', title, children }: AlertProps) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div role={role} className={`rounded-xl border p-3 text-sm leading-6 ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className="mt-0.5">{children}</div> : null}
    </div>
  );
}
