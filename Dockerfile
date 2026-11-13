# Railway: one HTTP service and one daily worker share a single persistent disk.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY backend/package.json ./backend/package.json
COPY webapp/package.json ./webapp/package.json
RUN npm ci --ignore-scripts
COPY shared ./shared
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY webapp ./webapp
RUN npm run build

FROM node:24-bookworm-slim AS node-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY backend/package.json ./backend/package.json
COPY webapp/package.json ./webapp/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace backend --workspace shared && npm cache clean --force

FROM python:3.13-slim-bookworm AS python-dependencies
COPY ml/requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends tini gosu libstdc++6 libatomic1 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 investing && useradd --uid 10001 --gid investing --no-create-home investing
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=python-dependencies /opt/venv /opt/venv
WORKDIR /app
ENV NODE_ENV=production PORT=8080 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" WEB_DIST_PATH=/app/webapp/dist \
    ML_DATABASE_PATH=/data/ml/lifecycle.sqlite3 PREDICTIONS_EXPORT_PATH=/data/ml/predictions.json \
    ML_DAILY_ENABLED=true OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
COPY package.json ./
COPY --from=node-dependencies /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json /app/shared/contracts.ts ./shared/
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/webapp/dist ./webapp/dist
COPY ml/*.py ml/config.json ./ml/
COPY ml/reviews ./ml/reviews
COPY deploy/railway ./deploy/railway
RUN chmod 755 deploy/railway/entrypoint.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "deploy/railway/healthcheck.mjs"]
# The entrypoint only initializes volume ownership as root, then drops privileges.
ENTRYPOINT ["/usr/bin/tini", "--", "/bin/sh", "/app/deploy/railway/entrypoint.sh"]
CMD ["python", "deploy/railway/runtime.py"]
