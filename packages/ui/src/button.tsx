import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
  isLoading?: boolean;
  children: ReactNode;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
};

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  md: 'px-5 py-2.5 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

/**
 * دکمه پایه. در حالت `isLoading` غیرفعال می‌شود و وضعیت را برای صفحه‌خوان اعلام می‌کند؛
 * هیچ دکمه‌ای بدون handler واقعی نباید رندر شود.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
