import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // NestJS به emitDecoratorMetadata نیاز دارد؛ esbuild این را پشتیبانی نمی‌کند.
    swc.vite({ module: { type: 'es6' } }),
  ],
  resolve: {
    alias: {
      '@bridalos/contracts': new URL('../../packages/contracts/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    reporters: ['default'],
  },
});
