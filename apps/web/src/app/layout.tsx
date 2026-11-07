import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BridalOS — پلتفرم مزون‌های لباس عروس',
    template: '%s | BridalOS',
  },
  description:
    'BridalOS پلتفرم فارسی برای کشف مزون‌ها، کالکشن لباس عروس، پرو مجازی و رزرو حضوری است.',
  applicationName: 'BridalOS',
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#b93a6c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:right-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
        >
          پرش به محتوای اصلی
        </a>
        {children}
      </body>
    </html>
  );
}
