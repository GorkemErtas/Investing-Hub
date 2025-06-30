FROM node:18-bullseye-slim

WORKDIR /app

# package.json ve package-lock.json burada olmalı
COPY package*.json ./

RUN npm install --legacy-peer-deps

# Uygulama kodunu kopyala
COPY . .

EXPOSE 6001

CMD ["node", "server.js"]

