import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:8082",
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command:
      "node ../node_modules/vite/bin/vite.js preview --config ../webapp/vite.config.ts --outDir ../mobileapp/dist-web-test --host 127.0.0.1 --port 8082",
    url: "http://127.0.0.1:8082",
    reuseExistingServer: false,
  },
});
