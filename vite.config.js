import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss],
    },
  },
});
