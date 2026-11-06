import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { z } from "zod";
import { newsSnapshotSchema } from "@investing-hub/shared/news";
import { hash, NewsError } from "./types.js";

const usageSchema = z.strictObject({
  day: z.string(),
  requests: z.number().int().nonnegative(),
  sourceRequests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedUsd: z.number().nonnegative(),
  unknownCostRequests: z.number().int().nonnegative(),
});
export const stateSchema = z.strictObject({
  version: z.literal(1),
  snapshots: z.strictObject({
    BTCUSDT: newsSnapshotSchema.optional(),
    ETHUSDT: newsSnapshotSchema.optional(),
  }),
  usage: usageSchema,
  usageHistory: z.array(usageSchema).max(31),
  blockedUntil: z.number().nonnegative(),
  sourceCooldowns: z.record(z.string(), z.number().nonnegative()),
  lastAttempt: z.number().nonnegative(),
  lastFailure: z.string().max(50).nullable(),
  diagnostics: z.record(z.string(), z.number().int().nonnegative()),
});
export type NewsState = z.infer<typeof stateSchema>;
export const emptyState = (): NewsState => ({
  version: 1,
  snapshots: {},
  usage: {
    day: "",
    requests: 0,
    sourceRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0,
    unknownCostRequests: 0,
  },
  usageHistory: [],
  blockedUntil: 0,
  sourceCooldowns: {},
  lastAttempt: 0,
  lastFailure: null,
  diagnostics: {},
});

export class NewsStore {
  readonly directory: string;
  constructor(path: string) {
    this.directory = resolve(path);
  }
  async read(): Promise<NewsState> {
    const path = join(this.directory, "state.json");
    try {
      if ((await stat(path)).size > 2 * 1024 * 1024)
        throw new NewsError("STORAGE");
      const envelope = JSON.parse(await readFile(path, "utf8"));
      if (
        typeof envelope.payload !== "string" ||
        hash(envelope.payload) !== envelope.sha256
      )
        throw new NewsError("STORAGE");
      return stateSchema.parse(JSON.parse(envelope.payload));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyState();
      throw new NewsError("STORAGE");
    }
  }
  async write(state: NewsState) {
    const payload = JSON.stringify(stateSchema.parse(state));
    const target = join(this.directory, "state.json");
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    await mkdir(this.directory, { recursive: true });
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(
          JSON.stringify({ sha256: hash(payload), payload }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      // Same-directory rename publishes the entire validated state. On failure
      // the previous snapshot and reservations remain untouched.
      await rename(temporary, target);
    } catch {
      throw new NewsError("STORAGE");
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async lock(): Promise<() => Promise<void>> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, "refresh.lock");
    try {
      await mkdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new NewsError("BUSY");
      throw new NewsError("STORAGE");
    }
    try {
      await (await open(join(path, "owner.json"), "wx", 0o600)).close();
      const file = await open(join(path, "owner.json"), "w", 0o600);
      try {
        await file.writeFile(
          JSON.stringify({
            pid: process.pid,
            host: hostname(),
            startedAt: new Date().toISOString(),
          }),
        );
      } finally {
        await file.close();
      }
    } catch {
      await rm(path, { recursive: true, force: true });
      throw new NewsError("STORAGE");
    }
    // No automatic lease stealing: a slow provider must never overlap a new
    // worker. Crash recovery requires verifying owner.json before removal.
    return async () => {
      await rm(path, { recursive: true, force: true });
    };
  }
}
