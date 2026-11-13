const response = await fetch(
  `http://127.0.0.1:${process.env.PORT || 8080}/api/health`,
  {
    signal: AbortSignal.timeout(4000),
  },
);
const body = await response.json();
if (!response.ok || body.status !== "ok") process.exit(1);
