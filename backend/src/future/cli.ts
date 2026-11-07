import { pathToFileURL } from "node:url";
import { parseConfig } from "../config.js";
import { createFutureService } from "./service.js";
import { failure } from "./errors.js";
export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 1 || args[0] !== "status") {
    console.error("Usage: future status");
    return 1;
  }
  try {
    console.info(
      JSON.stringify(
        await createFutureService(parseConfig(env)).status(),
        null,
        2,
      ),
    );
    return 0;
  } catch (error) {
    const safe = failure(error);
    console.error(
      JSON.stringify({
        status: "failed",
        code: safe.code,
        diagnostics: {
          httpStatus: safe.httpStatus,
          category: safe.category,
          elapsedMs: safe.elapsedMs,
        },
      }),
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
