import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { intervalSchema, symbolSchema } from "@investing-hub/shared/contracts";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";
import { createMarketService, type MarketService } from "./market/service.js";
import { predictionStatus } from "./predictions/service.js";
import { createMobileRouter, type MobileModule } from "./mobile/routes.js";
import { newsSymbolSchema } from "@investing-hub/shared/news";
import { createNewsService, type NewsReader } from "./news/service.js";

export function createApp(
  config: Config,
  market: MarketService = createMarketService(config),
  mobile?: MobileModule,
  news: NewsReader = createNewsService(config),
) {
  const app = express();
  app.disable("x-powered-by");
  // No trust-proxy: client-supplied forwarding headers cannot evade limits.
  app.use(helmet());
  app.use(
    cors({
      origin(origin, done) {
        if (!origin || config.origins.includes(origin)) done(null, true);
        else done(new AppError(403, "ORIGIN_DENIED", "Origin is not allowed."));
      },
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: false,
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", mode: "guest-demo" }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please retry in a minute.",
        },
      },
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", express.json({ limit: "32kb" }));
  app.get("/api/capabilities", (_req, res) =>
    res.json({
      accounts: Boolean(mobile?.repo.available()),
      registration: Boolean(
        mobile?.repo.available() && mobile.auth.registrationEnabled,
      ),
      notifications: Boolean(mobile?.repo.available() && mobile.notifications),
    }),
  );
  app.get("/api/markets", async (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(await market.markets());
  });
  app.get("/api/candles/:symbol", async (req, res) => {
    const symbol = symbolSchema.parse(req.params.symbol);
    const { interval } = z
      .strictObject({ interval: intervalSchema.default("1d") })
      .parse(req.query);
    res.json(await market.candles(symbol, interval));
  });
  app.get("/api/predictions/:symbol", (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(predictionStatus(symbolSchema.parse(req.params.symbol)));
  });
  app.get("/api/news/insights/:symbol", async (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(await news.read(newsSymbolSchema.parse(req.params.symbol)));
  });
  // Optional private services do not intercept public market/prediction endpoints.
  const privatePaths = ["/api/auth", "/api/me", "/api/portfolios"];
  if (mobile) {
    const router = createMobileRouter(mobile);
    app.use("/api", (req, res, next) => {
      if (/^\/(auth|me|portfolios)(\/|$)/.test(req.path))
        router(req, res, next);
      else next();
    });
  } else
    app.use(privatePaths, (_req, _res, next) =>
      next(
        new AppError(
          503,
          "ACCOUNTS_DISABLED",
          "Account services are disabled. Public market data remains available.",
        ),
      ),
    );
  app.use((_req, _res, next) =>
    next(new AppError(404, "NOT_FOUND", "Endpoint not found.")),
  );
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message:
            "Invalid request fields, symbol, interval or query parameters.",
        },
      });
      return;
    }
    if (err instanceof AppError) {
      res
        .status(err.status)
        .json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      "type" in err &&
      ["entity.parse.failed", "entity.too.large"].includes(String(err.type))
    ) {
      res.status(err.type === "entity.too.large" ? 413 : 400).json({
        error: {
          code: "INVALID_BODY",
          message: "JSON body is invalid or too large.",
        },
      });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      /^(Mongo|Mongoose)/.test(String(err.name))
    ) {
      res.status(503).json({
        error: {
          code: "ACCOUNTS_UNAVAILABLE",
          message: "Account storage is unavailable. Please retry later.",
        },
      });
      return;
    }
    // Do not serialize provider responses, request data or exception strings.
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  };
  app.use(errors);
  return app;
}
