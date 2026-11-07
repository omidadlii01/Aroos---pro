'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
};

/**
 * فیلد متنی با برچسب، راهنما و خطای متصل (aria-describedby / aria-invalid).
 * ورودی‌ها راست‌چین‌اند و برای صفحه‌کلید فارسی و اعداد فارسی آماده‌اند.
 */
export function Field({ label, hint, error, id, className = '', inputMode, ...rest }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        inputMode={inputMode}
        className={
          'w-full rounded-xl border bg-white px-4 py-2.5 text-base text-slate-900 shadow-sm ' +
          'placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ' +
          'focus-visible:ring-offset-1 disabled:bg-slate-50 ' +
          (error
            ? 'border-rose-400 focus-visible:ring-rose-400 '
            : 'border-slate-200 focus-visible:ring-brand-500 ') +
          className
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        dir={inputMode === 'tel' || inputMode === 'numeric' ? 'ltr' : undefined}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
