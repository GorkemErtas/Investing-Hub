import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Never load the tracked legacy environment files into a browser build.
  envDir: '.config/vite',
  server: { host: '127.0.0.1', port: 3000, proxy: { '/api': 'http://127.0.0.1:5000' } },
  preview: { host: '127.0.0.1', port: 3000, proxy: { '/api': 'http://127.0.0.1:5000' } },
});
