FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY backend/package.json ./backend/package.json
COPY webapp/package.json ./webapp/package.json
RUN npm ci --ignore-scripts
COPY shared ./shared
COPY webapp ./webapp
RUN npm run build -w shared && npm run build -w webapp

FROM nginx:stable-alpine
COPY --from=build /app/webapp/dist /usr/share/nginx/html
COPY webapp/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
