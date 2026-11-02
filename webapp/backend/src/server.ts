import { createApp } from './app.js';
import { parseConfig } from './config.js';

try {
  // Intentionally no dotenv: old tracked credential files are never read.
  const config = parseConfig(process.env);
  const server = createApp(config).listen(config.PORT, () =>
    console.info(`Investing Hub guest API listening on port ${config.PORT}`),
  );
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch {
  console.error('Startup failed: check documented environment configuration.');
  process.exitCode = 1;
}
