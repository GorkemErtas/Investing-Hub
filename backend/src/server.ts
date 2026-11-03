import { createApp } from "./app.js";
import { parseConfig } from "./config.js";
import { createMarketService } from "./market/service.js";
import { createAuthService } from "./mobile/auth.js";
import { createMongoRepository } from "./mobile/mongo.js";
import { createAlertWorker, type PushSender } from "./mobile/notifications.js";
import type { MobileModule } from "./mobile/routes.js";

try {
  // Intentionally no dotenv: old tracked credential files are never read.
  const config = parseConfig(process.env);
  const market = createMarketService(config);
  let mobile: MobileModule | undefined;
  let alerts: ReturnType<typeof setInterval> | undefined;
  if (config.MONGO_URI) {
    const repo = createMongoRepository(config.MONGO_URI);
    let mailer;
    if (config.SMTP_URL) {
      const { default: nodemailer } = await import("nodemailer");
      const smtp = new URL(config.SMTP_URL);
      const transport = nodemailer.createTransport({
        host: smtp.hostname,
        port: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 587)),
        secure: smtp.protocol === "smtps:",
        requireTLS: true,
        ...(smtp.username
          ? {
              auth: {
                user: decodeURIComponent(smtp.username),
                pass: decodeURIComponent(smtp.password),
              },
            }
          : {}),
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });
      mailer = async (email: string, code: string) => {
        await transport.sendMail({
          from: config.EMAIL_FROM,
          to: email,
          subject: "Investing Hub email verification",
          text: `Your verification code is ${code}. It expires in 10 minutes.`,
        });
      };
    }
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
  const server = createApp(config, market, mobile).listen(config.PORT, () =>
    console.info(`Investing Hub API listening on port ${config.PORT}`),
  );
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const shutdown = () => {
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
