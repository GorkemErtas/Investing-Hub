import js from '@eslint/js';
import globals from 'globals';
const platformGlobals = Object.fromEntries(Object.entries({ ...globals.browser, ...globals.node, __DEV__: 'readonly' }).map(([key, value]) => [key.trim(), value]));
export default [
  { ignores: ['node_modules/**', 'android/**', 'dist*/**', '.expo/**'] },
  { ...js.configs.recommended, files: ['**/*.js'], languageOptions: { globals: platformGlobals, parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off' } },
];
