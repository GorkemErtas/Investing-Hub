import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { intervalSchema, symbolSchema } from '../../shared/contracts.js';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { createMarketService, type MarketService } from './market/service.js';
import { predictionStatus } from './predictions/service.js';

export function createApp(config: Config, market: MarketService = createMarketService(config)) {
  const app = express();
  app.disable('x-powered-by');
  // No trust-proxy: client-supplied forwarding headers cannot evade limits.
  app.use(helmet());
  app.use(
    cors({
      origin(origin, done) {
        if (!origin || config.origins.includes(origin)) done(null, true);
        else done(new AppError(403, 'ORIGIN_DENIED', 'Origin is not allowed.'));
      },
      methods: ['GET', 'HEAD', 'OPTIONS'],
      credentials: false,
    }),
  );
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'guest-demo' }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please retry in a minute.' },
      },
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/markets', async (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(await market.markets());
  });
  app.get('/api/candles/:symbol', async (req, res) => {
    const symbol = symbolSchema.parse(req.params.symbol);
    const { interval } = z
      .strictObject({ interval: intervalSchema.default('1d') })
      .parse(req.query);
    res.json(await market.candles(symbol, interval));
  });
  app.get('/api/predictions/:symbol', (req, res) => {
    z.strictObject({}).parse(req.query);
    res.json(predictionStatus(z.enum(['BTCUSDT', 'ETHUSDT']).parse(req.params.symbol)));
  });
  // Guest portfolios never leave the browser. Legacy write/auth/refresh routes do not exist.
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found.')));
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid symbol, interval or query parameters.',
        },
      });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    // Do not serialize provider responses, request data or exception strings.
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  };
  app.use(errors);
  return app;
}
