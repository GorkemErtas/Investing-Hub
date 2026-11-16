import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { parseConfig } from "../backend/src/config.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
process.chdir(root);
// Read only the explicitly documented, ignored local file. Existing shell values win.
const environment = resolve(root, ".env.local");
if (existsSync(environment)) {
  for (const [name, value] of Object.entries(
    parseEnv(readFileSync(environment, "utf8")),
  )) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}
process.env.NODE_ENV ??= "development";
process.env.BIND_HOST ??= "127.0.0.1";
process.env.OMP_NUM_THREADS = "1";
process.env.OPENBLAS_NUM_THREADS = "1";
process.env.MKL_NUM_THREADS = "1";
const python = resolve(
  root,
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
const skipMl = process.env.INVESTING_HUB_SKIP_ML === "1";
function run(file: string, args: string[]) {
  const result = spawnSync(file, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw Error("local_command_failed");
}
try {
  if (![24, 26].includes(Number(process.versions.node.split(".")[0])))
    throw Error("node_version");
  const config = parseConfig(process.env);
  if (!skipMl) {
    if (!existsSync(python)) throw Error("python_environment_missing");
    run(python, [
      "-c",
      'import sys,numpy,pandas,scipy,sklearn,pyarrow,psutil; assert sys.version_info[:2] == (3,13); print("Python environment OK (3.13)")',
    ]);
  }
  console.info(
    `Local configuration OK; accounts ${config.MONGO_URI ? "configured" : "optional / guest mode"}.`,
  );
  if (process.argv.includes("--check")) {
    console.info(
      `Objective study ${existsSync("ml/artifacts/objectives-study-2026-11-16/protocol.json") ? "present" : "missing; forecasts will be unavailable"}.`,
    );
    console.info(
      "No Railway or Docker connection is required. No training or servers started.",
    );
  } else {
    run(process.execPath, [
      require.resolve("typescript/bin/tsc"),
      "-p",
      "shared/tsconfig.json",
    ]);
    if (!skipMl) run(python, ["ml/forecast_v2.py", "local-prepare"]);
    const children: ChildProcess[] = [];
    let stopping = false;
    const stop = (code: number) => {
      if (stopping) return;
      stopping = true;
      for (const child of children) {
        if (!child.pid || child.exitCode !== null) continue;
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            /* already stopped */
          }
        }
      }
      process.exitCode = code;
    };
    const start = (name: string, file: string, args: string[], cwd = root) => {
      const child = spawn(file, args, {
        cwd,
        env: {
          ...process.env,
          API_PROXY_TARGET: `http://127.0.0.1:${config.PORT}`,
        },
        stdio: "inherit",
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      children.push(child);
      child.on("error", () => {
        console.error(`${name} could not start.`);
        stop(1);
      });
      child.on("exit", (code) => {
        if (!stopping) {
          console.error(`${name} stopped; closing the local stack.`);
          stop(code || 1);
        }
      });
    };
    process.on("SIGINT", () => stop(0));
    process.on("SIGTERM", () => stop(0));
    start("API", process.execPath, [
      require.resolve("tsx/cli"),
      "watch",
      "backend/src/server.ts",
    ]);
    start(
      "Web",
      process.execPath,
      [resolve(root, "node_modules/vite/bin/vite.js"), "--strictPort"],
      resolve(root, "webapp"),
    );
    if (!skipMl) {
      start("ML worker", python, [
        "ml/forecast_v2.py",
        "worker",
        "--registry",
        "ml/artifacts/local/prices.json",
        "--output",
        process.env.FORECASTS_EXPORT_PATH || "ml/data/forecasts-v2.json",
        "--objective-registry",
        "ml/artifacts/local/objectives.json",
        "--objective-output",
        process.env.OBJECTIVE_FORECASTS_EXPORT_PATH ||
          "ml/data/objective-forecasts.json",
      ]);
    }
    console.info(
      "Open http://localhost:3000. Ctrl+C closes the API, web and ML worker. Models are experimental; no retraining occurs.",
    );
  }
} catch {
  console.error(
    "Local startup validation failed. Check Node 24/26, Python 3.13, installed dependencies and .env.local. Run .\\dev.ps1 -Install or see docs/LOCAL_WINDOWS.md. Configuration values are not logged.",
  );
  process.exitCode = 1;
}
