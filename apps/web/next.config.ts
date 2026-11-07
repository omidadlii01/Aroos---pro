import type { NextConfig } from 'next';

/**
 * آدرس API در سمت سرور خوانده می‌شود و مرورگر همیشه از مسیر نسبی `/api/*`
 * استفاده می‌کند؛ بنابراین CORS و اختلاف مبدأ در preview و production حذف می‌شود.
 */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@bridalos/ui', '@bridalos/contracts'],
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${apiInternalUrl}/api/v1/:path*` },
      { source: '/healthz', destination: `${apiInternalUrl}/healthz` },
    ];
  },
};

export default nextConfig;
