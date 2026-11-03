FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY backend/package.json ./backend/package.json
COPY webapp/package.json ./webapp/package.json
RUN npm ci --ignore-scripts
COPY shared ./shared
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
RUN npm run build -w shared && npm run build -w backend

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY backend/package.json ./backend/package.json
COPY webapp/package.json ./webapp/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace backend --workspace shared && npm cache clean --force
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/dist ./backend/dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/server.js"]
