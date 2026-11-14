import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
});

async function launch(overrides: NodeJS.ProcessEnv = {}) {
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  // Whitelist OS essentials: never inherit account/provider/runtime configuration.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "SystemRoot", "TEMP", "TMP"])
    if (process.env[key]) env[key] = process.env[key];
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...env, NODE_ENV: "test", PORT: String(port), ...overrides },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr!.on("data", (chunk) => {
    output += chunk;
  });
  return {
    child,
    port,
    exited: once(child, "exit"),
    output: () => output,
  };
}

async function healthy(port: number) {
  let body: unknown;
  await vi.waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      expect(response.status).toBe(200);
      body = await response.json();
    },
    { timeout: 10000, interval: 50 },
  );
  expect(body).toEqual({ status: "ok", mode: "guest-demo" });
}

describe("real API process lifecycle", () => {
  it.each([false, true])(
    "starts healthy with unreachable accounts=%s",
    async (accounts) => {
      const process = await launch(
        accounts
          ? {
              MONGO_URI: "mongodb://127.0.0.1:1/unused-test-database",
              JWT_SECRET: "test-only-strong-secret-at-least-32-characters",
            }
          : {},
      );
      await healthy(process.port);
      const capabilities = await fetch(
        `http://127.0.0.1:${process.port}/api/capabilities`,
      ).then((response) => response.json());
      expect(capabilities).toEqual({
        accounts: false,
        registration: false,
        notifications: false,
      });
      expect(process.output()).not.toContain("mongodb://");
    },
    15000,
  );

  it.each([
    { BREVO_API_KEY: "test-only-key-without-sender" },
    { WEB_DIST_PATH: "missing-test-frontend-directory" },
  ])(
    "fails closed with a generic startup configuration error",
    async (env) => {
      const process = await launch(env);
      const [code] = await process.exited;
      expect(code).toBe(1);
      expect(process.output().trim()).toBe(
        "Startup failed: check documented environment configuration.",
      );
    },
    15000,
  );

  it.skipIf(process.platform === "win32")(
    "drains HTTP and exits cleanly on SIGTERM",
    async () => {
      const process = await launch();
      await healthy(process.port);
      process.child.kill("SIGTERM");
      const [code] = await process.exited;
      expect(code).toBe(0);
      expect(process.output()).toContain('"event":"shutdown_started"');
    },
    15000,
  );
});
