export type StatusTone = 'ok' | 'warn' | 'error' | 'idle';

const colors: Record<StatusTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
  idle: 'bg-slate-400',
};

/** نشانگر وضعیت با متن پنهان برای صفحه‌خوان. */
export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2 rounded-full ${colors[tone]}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
