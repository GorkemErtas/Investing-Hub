import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default ts.config(
  {
    ignores: [
      'dist/**',
      'backend/dist/**',
      'node_modules/**',
      '.npm-cache/**',
      '.venv/**',
      'ml/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.flat['recommended-latest'].rules,
  },
);
