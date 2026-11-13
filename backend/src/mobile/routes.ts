import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  idSchema,
  loginSchema,
  portfolioMetadataSchema,
  pushTokenSchema,
  registerSchema,
  settingsPatchSchema,
  verifySchema,
  tradeSchema,
} from "@investing-hub/shared/mobile";
import type { MobileRepository } from "./repository.js";
import { type AuthService, publicUser } from "./auth.js";
import { createPortfolioService } from "./portfolios.js";
import { AppError } from "../errors.js";
import { assets } from "@investing-hub/shared/contracts";
import { limiterIdentity } from "../limiterIdentity.js";

export interface MobileModule {
  repo: MobileRepository;
  auth: AuthService;
  notifications: boolean;
}
export function createMobileRouter(
  { repo, auth, notifications }: MobileModule,
  trustRailwayProxy = false,
) {
  const router = Router();
  const portfolios = createPortfolioService(repo);
  const empty = (value: unknown) => z.strictObject({}).parse(value);
  router.use((req, _res, next) => {
    empty(req.query);
    if (!repo.available())
      throw new AppError(
        503,
        "ACCOUNTS_UNAVAILABLE",
        "Account storage is unavailable.",
      );
    next();
  });
  const authLimit = rateLimit({
    ...limiterIdentity(trustRailwayProxy),
    windowMs: 15 * 60000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "AUTH_RATE_LIMITED",
        message: "Too many account requests. Please retry later.",
      },
    },
  });
  router.post("/auth/register", authLimit, async (req, res) => {
    await auth.register(registerSchema.parse(req.body));
    res.status(202).json({
      message:
        "If registration is available for this email, a verification code has been sent.",
    });
  });
  router.post("/auth/verify", authLimit, async (req, res) => {
    const body = verifySchema.parse(req.body);
    await auth.verify(body.email, body.verificationCode);
    res.status(201).json({ message: "Email verified. You can now log in." });
  });
  router.post("/auth/login", authLimit, async (req, res) => {
    const body = loginSchema.parse(req.body);
    res.json(await auth.login(body.email, body.password));
  });
  router.use(async (req, res, next) => {
    const owner = auth.authenticate(req.header("Authorization"));
    const user = await repo.user(owner);
    if (!user || !user.isVerified)
      throw new AppError(401, "SESSION_EXPIRED", "Please log in again.");
    res.locals.owner = owner;
    res.locals.user = publicUser(user);
    next();
  });
  router.get("/me", (_req, res) => res.json(res.locals.user));
  router.get("/me/settings", async (_req, res) =>
    res.json(await repo.settings(res.locals.owner)),
  );
  router.patch("/me/settings", async (req, res) => {
    const patch = settingsPatchSchema.parse(req.body);
    if (
      patch.priceAlerts &&
      Object.keys(patch.priceAlerts).some(
        (symbol) => !assets.some((asset) => asset.base === symbol),
      )
    )
      throw new AppError(
        400,
        "UNSUPPORTED_ALERT",
        "Price alerts require a currently tracked market pair.",
      );
    if (
      patch.priceAlerts &&
      Object.keys(patch.priceAlerts).length &&
      !notifications
    )
      throw new AppError(
        503,
        "NOTIFICATIONS_DISABLED",
        "Price alert delivery is unavailable. Favorites and theme can still be saved.",
      );
    res.json(await repo.saveSettings(res.locals.owner, patch));
  });
  router.put("/me/push-token", async (req, res) => {
    if (!notifications)
      throw new AppError(
        503,
        "NOTIFICATIONS_DISABLED",
        "Push delivery is unavailable.",
      );
    await repo.pushToken(
      res.locals.owner,
      pushTokenSchema.parse(req.body).token,
    );
    res.json({ message: "Push token registered." });
  });
  router.delete("/me/push-token", async (_req, res) => {
    await repo.pushToken(res.locals.owner, "");
    res.json({ message: "Push token removed." });
  });
  router.get("/portfolios", async (_req, res) =>
    res.json(await repo.portfolios(res.locals.owner)),
  );
  router.post("/portfolios", async (req, res) =>
    res
      .status(201)
      .json(
        await repo.createPortfolio(
          res.locals.owner,
          portfolioMetadataSchema.parse(req.body),
        ),
      ),
  );
  router.get("/portfolios/:id", async (req, res) =>
    res.json(
      await portfolios.owned(res.locals.owner, idSchema.parse(req.params.id)),
    ),
  );
  router.patch("/portfolios/:id", async (req, res) => {
    const portfolio = await portfolios.owned(
      res.locals.owner,
      idSchema.parse(req.params.id),
    );
    res.json(
      await repo.savePortfolio(res.locals.owner, {
        ...portfolio,
        ...portfolioMetadataSchema.parse(req.body),
      }),
    );
  });
  router.delete("/portfolios/:id", async (req, res) => {
    if (
      !(await repo.deletePortfolio(
        res.locals.owner,
        idSchema.parse(req.params.id),
      ))
    )
      throw new AppError(404, "PORTFOLIO_NOT_FOUND", "Portfolio not found.");
    res.json({ message: "Portfolio deleted." });
  });
  router.post("/portfolios/:id/transactions", async (req, res) =>
    res
      .status(201)
      .json(
        await portfolios.trade(
          res.locals.owner,
          idSchema.parse(req.params.id),
          "add",
          tradeSchema.parse(req.body),
        ),
      ),
  );
  router.put("/portfolios/:id/transactions/:transactionId", async (req, res) =>
    res.json(
      await portfolios.trade(
        res.locals.owner,
        idSchema.parse(req.params.id),
        "edit",
        tradeSchema.parse(req.body),
        idSchema.parse(req.params.transactionId),
      ),
    ),
  );
  router.delete(
    "/portfolios/:id/transactions/:transactionId",
    async (req, res) =>
      res.json(
        await portfolios.trade(
          res.locals.owner,
          idSchema.parse(req.params.id),
          "delete",
          undefined,
          idSchema.parse(req.params.transactionId),
        ),
      ),
  );
  return router;
}
