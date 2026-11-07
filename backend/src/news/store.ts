import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { z } from "zod";
import {
  newsSnapshotSchema,
  newsEvidenceSchema,
  newsCoverageSchema,
  newsAttributionSchema,
} from "@investing-hub/shared/news";
import { hash, NewsError, providerDiagnosticSchema } from "./types.js";

const usageSchema = z.strictObject({
  day: z.string(),
  requests: z.number().int().nonnegative(),
  sourceRequests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedUsd: z.number().nonnegative(),
  unknownCostRequests: z.number().int().nonnegative(),
});
export const collectionSchema = z.strictObject({
  generatedAt: z.string().datetime(),
  lastCheckedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  evidence: z.array(newsEvidenceSchema).max(16),
  coverage: z.array(newsCoverageSchema).max(10),
  attribution: z.array(newsAttributionSchema).max(6),
});
export const stateSchema = z.strictObject({
  version: z.literal(2),
  collection: collectionSchema.nullable(),
  snapshots: z.strictObject({
    BTCUSDT: newsSnapshotSchema.optional(),
    ETHUSDT: newsSnapshotSchema.optional(),
  }),
  usage: usageSchema,
  usageHistory: z.array(usageSchema).max(31),
  blockedUntil: z.number().nonnegative(),
  sourceCooldowns: z.record(z.string(), z.number().nonnegative()),
  nextSourceAt: z.record(z.string(), z.number().nonnegative()),
  lastAttempt: z.number().nonnegative(),
  lastFailure: z.string().max(50).nullable(),
  diagnostics: z.record(z.string(), z.number().int().nonnegative()),
  lastCoverage: z.array(newsCoverageSchema).max(10).default([]),
  lastGeminiAttempt: providerDiagnosticSchema
    .extend({
      attemptedAt: z.string().datetime(),
    })
    .nullable()
    .default(null),
});
export type NewsState = z.infer<typeof stateSchema>;
export const emptyState = (): NewsState => ({
  version: 2,
  collection: null,
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
  nextSourceAt: {},
  lastAttempt: 0,
  lastFailure: null,
  diagnostics: {},
  lastCoverage: [],
  lastGeminiAttempt: null,
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
      const payload = JSON.parse(envelope.payload);
      if (payload.version === 1) {
        // v1 snapshots cannot represent unknown publication or source-only
        // operation. Invalidate them; preserve only validated usage counters.
        const migrated = emptyState();
        migrated.usage = usageSchema.parse(payload.usage);
        migrated.usageHistory = z
          .array(usageSchema)
          .max(31)
          .parse(payload.usageHistory);
        migrated.blockedUntil = z
          .number()
          .nonnegative()
          .parse(payload.blockedUntil);
        migrated.lastAttempt = z
          .number()
          .nonnegative()
          .parse(payload.lastAttempt);
        migrated.lastFailure = "legacy_snapshot_invalidated";
        return migrated;
      }
      return stateSchema.parse(payload);
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
