import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { z } from "zod";

// The existing v2 integrity/cache policy, shared by both publication versions.
export function createSnapshotLoader<T>(path: string, schema: z.ZodType<T>) {
  const signature = (s: BigIntStats) =>
    [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":");
  let cached: { key: string; value: T } | undefined;
  let pending: { key: string; value: Promise<T> } | undefined;
  return async () => {
    const stamp = await stat(path, { bigint: true });
    if (stamp.size > 2n * 1024n * 1024n) throw Error("Oversized publication");
    const key = signature(stamp);
    if (cached?.key === key) return cached.value;
    if (pending?.key === key) return pending.value;
    const value = (async () => {
      const handle = await open(path, "r");
      try {
        if (signature(await handle.stat({ bigint: true })) !== key)
          throw Error("Publication changed");
        const bytes = Buffer.alloc(Number(stamp.size) + 1);
        let offset = 0;
        while (offset < bytes.length) {
          const read = await handle.read(
            bytes,
            offset,
            bytes.length - offset,
            offset,
          );
          if (!read.bytesRead) break;
          offset += read.bytesRead;
        }
        if (offset !== Number(stamp.size)) throw Error("Unstable publication");
        const envelope = JSON.parse(bytes.subarray(0, offset).toString("utf8"));
        if (
          typeof envelope.payload !== "string" ||
          createHash("sha256").update(envelope.payload).digest("hex") !==
            envelope.sha256
        )
          throw Error("Invalid publication checksum");
        const parsed = schema.parse(JSON.parse(envelope.payload));
        if (signature(await stat(path, { bigint: true })) !== key)
          throw Error("Publication replaced");
        return parsed;
      } finally {
        await handle.close();
      }
    })();
    pending = { key, value };
    try {
      const result = await value;
      if (pending?.value === value) cached = { key, value: result };
      return result;
    } finally {
      if (pending?.value === value) pending = undefined;
    }
  };
}
