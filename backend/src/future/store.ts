import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { z } from "zod";
import { evidenceStages, FutureError, hash } from "./errors.js";

const usage = z.strictObject({
  key: z.string().max(10),
  requests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  searchQueries: z.number().int().nonnegative(),
  unknownQueryRequests: z.number().int().nonnegative(),
  unknownCostRequests: z.number().int().nonnegative(),
  estimatedUsd: z.number().finite().nonnegative(),
});
const diagnostic = z.strictObject({
  stage: z.enum(evidenceStages).nullable().default(null),
  grounding: z
    .strictObject({
      chunks: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      supports: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      searchEntryPoint: z.boolean(),
    })
    .nullable()
    .default(null),
  code: z.enum([
    "STORAGE",
    "BUSY",
    "BUDGET",
    "COOLDOWN",
    "TIMEOUT",
    "PROVIDER",
    "INSUFFICIENT_EVIDENCE",
    "PERMISSION_REQUIRED",
  ]),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  elapsedMs: z.number().int().nonnegative().nullable(),
  category: z.enum([
    "storage",
    "busy",
    "budget",
    "cooldown",
    "timeout",
    "provider",
    "insufficient_evidence",
    "permission_required",
    "bad_request",
    "unauthenticated",
    "permission_denied",
    "not_found",
    "rate_limited",
    "server_error",
    "sdk_or_network_error",
  ]),
});
// No grounded result, source, Search Suggestion, prompt or ML payload is persisted.
export const stateSchema = z
  .strictObject({
    version: z.literal(1),
    attemptedIds: z.record(
      z.string().regex(/^[a-f0-9]{64}$/),
      z.number().nonnegative(),
    ),
    cooldowns: z.record(z.string(), z.number().nonnegative()),
    day: usage,
    month: usage,
    lastFailure: diagnostic.nullable(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value.attemptedIds).length > 2500)
      ctx.addIssue({
        code: "custom",
        message: "Too many request reservations",
      });
  });
export type FutureState = z.infer<typeof stateSchema>;
const counter = () => ({
  key: "",
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  searchQueries: 0,
  unknownQueryRequests: 0,
  unknownCostRequests: 0,
  estimatedUsd: 0,
});
export const emptyState = (): FutureState => ({
  version: 1,
  attemptedIds: {},
  cooldowns: {},
  day: counter(),
  month: counter(),
  lastFailure: null,
});
export class FutureStore {
  readonly directory: string;
  constructor(path: string) {
    this.directory = resolve(path);
  }
  async read(): Promise<FutureState> {
    try {
      const path = join(this.directory, "state.json");
      if ((await stat(path)).size > 2 * 1024 * 1024)
        throw new FutureError("STORAGE");
      const envelope = JSON.parse(await readFile(path, "utf8"));
      if (
        typeof envelope.payload !== "string" ||
        hash(envelope.payload) !== envelope.sha256
      )
        throw new FutureError("STORAGE");
      return stateSchema.parse(JSON.parse(envelope.payload));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyState();
      throw new FutureError("STORAGE");
    }
  }
  async write(state: FutureState) {
    const payload = JSON.stringify(stateSchema.parse(state));
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    try {
      const stream = await open(temporary, "wx", 0o600);
      try {
        await stream.writeFile(
          JSON.stringify({ payload, sha256: hash(payload) }),
        );
        await stream.sync();
      } finally {
        await stream.close();
      }
      await rename(temporary, join(this.directory, "state.json"));
    } catch {
      throw new FutureError("STORAGE");
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async lock() {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, "refresh.lock");
    try {
      await mkdir(path);
    } catch {
      throw new FutureError("BUSY");
    }
    try {
      await (await open(join(path, "owner.json"), "wx", 0o600)).close();
      const owner = await open(join(path, "owner.json"), "w", 0o600);
      try {
        await owner.writeFile(
          JSON.stringify({
            pid: process.pid,
            host: hostname(),
            at: new Date().toISOString(),
          }),
        );
      } finally {
        await owner.close();
      }
    } catch {
      await rm(path, { recursive: true, force: true });
      throw new FutureError("STORAGE");
    }
    return async () => {
      await rm(path, { recursive: true, force: true });
    };
  }
}
