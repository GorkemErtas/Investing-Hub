# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci            

# 1) build arg
ARG VITE_API_URL=http://13.61.189.194:5000
# 2) env — vite build bunu okur
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN npm run build      

# ---------- runtime ----------
FROM node:20-alpine
RUN npm i -g serve
COPY --from=build /app/dist /app/dist
EXPOSE 80
CMD ["serve", "-s", "/app/dist", "-l", "80"]


