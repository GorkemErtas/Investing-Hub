import { defineConfig } from 'vitest/config';
export default defineConfig({ define: { __DEV__: 'true', 'process.env.EXPO_PUBLIC_API_URL': JSON.stringify('http://localhost:5000') }, test: { include: ['tests/**/*.test.ts'] } });
