# 1. Temel imaj (Node.js + Debian tabanlı)
FROM node:18

# 2. Sistem araçlarını kur (ONNX derlemesi için gerekli)
RUN apt-get update && \
    apt-get install -y python3 make g++ curl cmake && \
    apt-get clean

# 3. Çalışma dizinine geç
WORKDIR /app

# 4. package.json dosyalarını kopyala
COPY package*.json ./

# 5. ONNX için CPU-only build ayarları
ENV npm_config_onnxruntime_node_prebuild=false \
    ONNXRUNTIME_PREFER_SYSTEM_LIB=1 \
    npm_config_build_from_source=true

# 6. ONNX’in sadece CPU uyumlu sürümünü yükle
RUN npm install onnxruntime-node@1.15.1

# 7. Diğer tüm bağımlılıkları kur
RUN npm install

# 8. Uygulama dosyalarını kopyala
COPY . .

# 9. Ortam değişkenini ayarla
ENV NODE_ENV=production

# 10. Express uygulamasının dinleyeceği port
EXPOSE 5000

# 11. Başlatma komutu
CMD ["npm", "start"]


