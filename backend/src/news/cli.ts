import { pathToFileURL } from "node:url";
import { parseConfig } from "../config.js";
import { createNewsService } from "./service.js";
import { NewsError, safeProviderDiagnostic } from "./types.js";

export async function main(
  args = process.argv.slice(2),
  env = process.env,
): Promise<number> {
  if (
    args.length !== 1 ||
    !["collect", "analyze", "status", "prune"].includes(args[0])
  ) {
    console.error(
      "Usage: node backend/dist/news/cli.js collect|analyze|status|prune",
    );
    return 1;
  }
  try {
    const service = createNewsService(parseConfig(env));
    console.info(
      JSON.stringify(
        args[0] === "collect"
          ? await service.collect()
          : args[0] === "analyze"
            ? await service.analyze()
            : args[0] === "prune"
              ? await service.prune()
              : await service.status(),
        null,
        2,
      ),
    );
    return 0;
  } catch (error) {
    const diagnostics =
      args[0] === "analyze" && error instanceof NewsError
        ? safeProviderDiagnostic(error)
        : null;
    // Never print SDK exception strings, configuration values, keys or source text.
    console.error(
      JSON.stringify({
        status: "failed",
        code:
          error instanceof NewsError ? error.code : "CONFIGURATION_OR_STORAGE",
        ...(diagnostics ? { diagnostics } : {}),
      }),
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
