import { createApp } from "./app.js";
import { parseConfig } from "./config.js";
import { createMarketService } from "./market/service.js";
import { createAuthService } from "./mobile/auth.js";
import { createVerificationMailer } from "./mobile/email.js";
import { createMongoRepository } from "./mobile/mongo.js";
import { createAlertWorker, type PushSender } from "./mobile/notifications.js";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { MobileModule } from "./mobile/routes.js";

try {
  // Intentionally no dotenv: old tracked credential files are never read.
  const config = parseConfig(process.env);
  if (config.WEB_DIST_PATH)
    await access(join(config.WEB_DIST_PATH, "index.html"));
  const market = createMarketService(config);
  let mobile: MobileModule | undefined;
  let alerts: ReturnType<typeof setInterval> | undefined;
  if (config.MONGO_URI) {
    const repo = createMongoRepository(config.MONGO_URI);
    const mailer = await createVerificationMailer(config);
    let sender: PushSender | undefined;
    if (config.FIREBASE_ENABLED === "true") {
      try {
        const { initializeApp, applicationDefault } =
          await import("firebase-admin/app");
        const { getMessaging } = await import("firebase-admin/messaging");
        const firebase = initializeApp({ credential: applicationDefault() });
        sender = async (token, title, body) => {
          await getMessaging(firebase).send({
            token,
            notification: { title, body },
          });
        };
      } catch {
        console.warn(
          "Push configuration unavailable; delivery disabled. Public API remains available.",
        );
      }
    }
    mobile = {
      repo,
      auth: createAuthService(repo, config.JWT_SECRET!, mailer),
      notifications: Boolean(sender && config.PRICE_ALERTS_ENABLED === "true"),
    };
    if (sender && config.PRICE_ALERTS_ENABLED === "true") {
      const tick = createAlertWorker(repo, market, sender);
      alerts = setInterval(() => {
        void tick();
      }, 60000);
      alerts.unref();
    }
  }
  const server = createApp(config, market, mobile).listen(
    config.PORT,
    "0.0.0.0",
    () => console.info(`Investing Hub API listening on port ${config.PORT}`),
  );
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.info(JSON.stringify({ event: "shutdown_started" }));
    if (alerts) clearInterval(alerts);
    server.close(() => {
      void (mobile?.repo.close() ?? Promise.resolve()).finally(() =>
        process.exit(0),
      );
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch {
  console.error("Startup failed: check documented environment configuration.");
  process.exitCode = 1;
}
