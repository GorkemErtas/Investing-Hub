import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { intervalSchema, symbolSchema } from "@investing-hub/shared/contracts";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";
import { errorHandler } from "./errorHandler.js";
import { mountWebApp } from "./web.js";
import { createMarketService, type MarketService } from "./market/service.js";
import {
  createPredictionReader,
  type PredictionReader,
} from "./predictions/service.js";
import { createMobileRouter, type MobileModule } from "./mobile/routes.js";
import { limiterIdentity } from "./limiterIdentity.js";
import { forecastHorizonSchema } from "@investing-hub/shared/forecasts";
import {
  createForecastReader,
  type ForecastReader,
} from "./predictions/forecasts.js";
import {
  createObjectiveReader,
  type ObjectiveReader,
} from "./predictions/objectives.js";

export function createApp(
  config: Config,
  market: MarketService = createMarketService(config),
  mobile?: MobileModule,
  predictions: PredictionReader = createPredictionReader(config),
  forecasts: ForecastReader = createForecastReader(config),
  objectives: ObjectiveReader = createObjectiveReader(config),
) {
  const app = express();
  app.disable("x-powered-by");
  // Keep Express trust-proxy disabled. Railway overwrites X-Real-IP at its edge;
  // arbitrary client X-Forwarded-For chains must never select the limiter key.
  app.use(
    helmet({
      frameguard: { action: "deny" },
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "script-src-attr": ["'none'"],
          "style-src": [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'self'"],
          "form-action": ["'self'"],
        },
      },
    }),
  );
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
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      ...limiterIdentity(config.TRUST_RAILWAY_PROXY === "true"),
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
  app.get("/api/predictions/:symbol", async (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(await predictions.read(symbolSchema.parse(req.params.symbol)));
  });
  app.get("/api/v2/forecasts/:symbol", async (req, res) => {
    const { horizon } = z
      .strictObject({ horizon: forecastHorizonSchema.default("1m") })
      .parse(req.query);
    res.json(
      await forecasts.read(symbolSchema.parse(req.params.symbol), horizon),
    );
  });
  app.get("/api/v3/forecasts/:symbol", async (req, res) => {
    const { horizon } = z
      .strictObject({ horizon: forecastHorizonSchema.default("1m") })
      .parse(req.query);
    res.json(
      await objectives.read(symbolSchema.parse(req.params.symbol), horizon),
    );
  });
  // Optional private services do not intercept public market/prediction endpoints.
  const privatePaths = ["/api/auth", "/api/me", "/api/portfolios"];
  if (mobile) {
    const router = createMobileRouter(
      mobile,
      config.TRUST_RAILWAY_PROXY === "true",
    );
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
  if (config.WEB_DIST_PATH) mountWebApp(app, config.WEB_DIST_PATH);
  app.use((_req, _res, next) =>
    next(new AppError(404, "NOT_FOUND", "Endpoint not found.")),
  );
  app.use(errorHandler);
  return app;
}
