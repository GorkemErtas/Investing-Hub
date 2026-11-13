import {
  defineRailway,
  github,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

// Optional operator-applied configuration. Nothing here deploys on npm/build.
export default defineRailway(() => {
  const data = volume("investing-hub-data", {
    region: "europe-west4",
    sizeMB: 1024,
  });
  const app = service("investing-hub", {
    source: github("GorkemErtas/Investing-Hub", { branch: "main" }),
    replicas: { "europe-west4": 1 },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      drainingSeconds: 20,
      sleepApplication: false,
    },
    volumeMounts: { "/data": data },
    env: {
      NODE_ENV: "production",
      PORT: "8080",
      TRUST_RAILWAY_PROXY: "true",
      ML_DAILY_ENABLED: "true",
      CORS_ORIGINS: preserve(),
    },
  });
  return project("Investing Hub", { resources: [app, data] });
});
