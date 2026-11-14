// Synthetic, read-only reader benchmark. Never opens an application database.
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { assets } from "@investing-hub/shared/contracts";
import {
  predictionFixture,
  predictionTestNow,
} from "../../shared/tests/predictions-fixtures.js";
import { parseConfig } from "../src/config.js";
import { createPredictionReader } from "../src/predictions/service.js";

const directory = await mkdtemp(join(tmpdir(), "investing-hub-benchmark-"));
try {
  const database = join(directory, "synthetic-registry"),
    output = join(directory, "predictions.json");
  await writeFile(database, "SYNTHETIC REGISTRY");
  const stamp = await stat(database, { bigint: true });
  const payload = JSON.stringify({
    version: "price-predictions-v1",
    generatedAt: new Date(predictionTestNow).toISOString(),
    registry: { size: Number(stamp.size), mtimeNs: String(stamp.mtimeNs) },
    forecasts: assets.map(({ symbol }) => predictionFixture(symbol)),
  });
  await writeFile(
    output,
    JSON.stringify({
      payload,
      sha256: createHash("sha256").update(payload).digest("hex"),
    }),
  );
  const reader = createPredictionReader(
    parseConfig({
      PREDICTIONS_EXPORT_PATH: output,
      ML_DATABASE_PATH: database,
    }),
    () => predictionTestNow,
  );
  for (let i = 0; i < 40; i++)
    await reader.read(assets[i % assets.length].symbol);
  const measurements: number[] = [];
  const started = performance.now();
  for (let i = 0; i < 2000; i++) {
    const before = performance.now();
    if (
      (await reader.read(assets[i % assets.length].symbol)).status !==
      "experimental"
    )
      throw new Error("Invalid benchmark fixture");
    measurements.push(performance.now() - before);
  }
  const elapsedMs = performance.now() - started;
  measurements.sort((a, b) => a - b);
  console.info(
    JSON.stringify({
      label: process.argv[2] ?? "sample",
      node: process.version,
      platform: process.platform,
      requests: measurements.length,
      publicationBytes: (await stat(output)).size,
      elapsedMs,
      p50Ms: measurements[1000],
      p95Ms: measurements[1900],
      rssMiB: process.memoryUsage().rss / 1024 ** 2,
    }),
  );
} finally {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith("investing-hub-benchmark-")
  )
    throw new Error("Unsafe benchmark cleanup");
  await rm(directory, { recursive: true, force: true });
}
