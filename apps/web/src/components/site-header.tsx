import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-sand-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-800">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-xl bg-brand-600 text-sm text-white"
          >
            B
          </span>
          <span>BridalOS</span>
        </Link>
        <nav aria-label="ناوبری اصلی" className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-sand-100">
            خانه
          </Link>
          <Link href="/boutiques" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-sand-100">
            کاتالوگ لباس
          </Link>
          <Link href="/login" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-sand-100">
            ورود
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"
          >
            پنل من
          </Link>
        </nav>
      </div>
    </header>
  );
}
