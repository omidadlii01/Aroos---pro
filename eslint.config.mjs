import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * قواعد حداقلی و پایدار: هدف lint، گرفتن خطاهای واقعی است نه سلیقه.
 * قواعد وابسته به فریم‌ورک (React hooks و…) در فاز ۲ با پلاگین رسمی Next اضافه می‌شود.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.venv/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
