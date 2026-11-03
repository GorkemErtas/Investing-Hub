import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: "https://api.example.invalid",
  EXPO_PUBLIC_FIREBASE_ENABLED: "false",
};
// Build a separate test-only export, so browser checks never reuse stale app code
// or point at a real account service. All HTTP responses are controlled fixtures.
for (const args of [
  [
    require.resolve("expo/bin/cli"),
    "export",
    "--platform",
    "web",
    "--output-dir",
    "dist-web-test",
  ],
  [
    resolve(import.meta.dirname, "../../node_modules/@playwright/test/cli.js"),
    "test",
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
