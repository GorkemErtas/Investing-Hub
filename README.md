# 💹 Investing Hub Web Application - Cryptocurrency Portfolio & Learning Platform

Investing Hub, kripto para birimlerine yatırım yapan kullanıcılar için geliştirilmiş kapsamlı bir platformdur. Kullanıcılar portföylerini yönetebilir, gerçek zamanlı piyasa verilerini görüntüleyebilir, teknik analiz grafiklerinden faydalanabilir ve öğrenme merkezi sayesinde kripto dünyası hakkında bilgi sahibi olabilirler.

## 🚀 Özellikler

- 🔐 Kullanıcı Kaydı & Giriş (E-posta doğrulamalı)
- 📈 Gerçek zamanlı fiyat verileri ve hacim bilgisi (Binance API)
- 💼 Portföy Oluşturma ve Takibi (Al/Sat işlemleri)
- 📊 Fibonacci & Candlestick grafikler
- 🧠 Eğitim Merkezi: Quiz ve interaktif grafik soruları
- 🗞️ Günlük kripto haberleri (CryptoPanic & Gemini AI)
- 🎨 Karanlık ve Aydınlık tema desteği
- 🌐 Dil desteği: Türkçe ve İngilizce
- 🔔 Fiyat uyarıları ve kullanıcıya özel bildirim sistemi

---

## 📦 Kurulum

### Gereksinimler

- Node.js (v18+)
- MongoDB (local veya Atlas)
- npm / yarn

### 1. Backend Kurulumu

```bash
cd backend
npm install
```

`.env` dosyasını oluşturun ve aşağıdaki bilgileri girin:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/investinghub
JWT_SECRET=your_jwt_secret
EMAIL_USER=youremail@gmail.com
EMAIL_PASS=your_email_password
```

Sunucuyu başlat:

```bash
node server.js
```

### 2. Frontend Kurulumu

```bash
npm install
npm run dev
```

---

## 🔌 API Endpointleri

### 👤 Authentication

- `POST /register` - Yeni kullanıcı kaydı
- `POST /verify` - E-posta doğrulaması
- `POST /login` - Giriş

### 📊 Crypto Verileri

- `GET /crypto-data`
- `GET /gainers?timeframe=daily|weekly|monthly`
- `GET /losers?timeframe=daily|weekly|monthly`
- `GET /top-exchanges`
- `GET /graph-data/:symbol?timeframe=1m|15m|1h|1d|1M`
- `GET /api/fibonacci/:symbol/:timeframe`

### 📰 Haberler

- `GET /crypto-news?lang=en|tr`
- `GET /geminicrypto-news?lang=en|tr`

### 💼 Portföy

- `POST /create-portfolio`
- `PUT /portfolio/:id`
- `DELETE /portfolio/:id`
- `GET /portfolios?userId=...`
- `GET /portfolio/:id`
- `POST /portfolio/:id/transaction`
- `PUT /portfolio/:portfolioId/transaction/:transactionId`
- `DELETE /portfolio/:portfolioId/transaction/:transactionId`

### ⚙️ Kullanıcı Ayarları

- `POST /settings`
- `GET /settings/:userId`
- `PUT /settings/:userId`

---

## 🧠 Öğrenme Merkezi

- `ChartQuizSection.jsx` - Grafik yorumlama testi
- `QuizSection.jsx` - Genel kripto bilgisi testi
- `InfoSection.jsx` - Temel blockchain ve kripto tanımları
- `VideoSection.jsx` - YouTube üzerinden eğitim videoları

---

## 🌐 Deployment (AWS)

Proje, AWS üzerinde aşağıdaki yapı ile deploy edilmiştir:

- **EC2:** Backend Node.js sunucusu barındırıldı.
- **Nginx:** Ters proxy olarak konumlandırıldı (`nginx/default.conf` ile yapılandırıldı).
- **Docker & Docker Compose:** Tüm servisler containerize edildi.
- **MongoDB:** AWS EC2 üzerinde çalışan veya dışarıdan bağlantılı Mongo veritabanı.
- **Frontend:** Vite + React ile build edilen uygulama `public/` üzerinden sunulmakta.
- **Portlar:** 
  - Frontend: 80 (Nginx)
  - Backend API: 5000

### Yayına Alma Adımları

```bash
# Build frontend
npm run build

# AWS EC2'ye bağlan
ssh ec2-user@your-ec2-ip

# Proje klasörüne geç
cd investing-hub

# Docker Compose ile başlat
docker-compose up -d --build
```

> AWS Güvenlik Grupları üzerinden 80 ve 5000 portlarının açık olduğuna emin olun.

---

## 👨‍💻 Ekip Bilgisi

Bu proje Yaşar Üniversitesi yazılım mühendisliği lisans bitirme projesidir.

- Görkem Ertaş
- Cem Arda Doğan
- Asil Demian Özbay
- Taylan Özgür Elma

Danışman: Dr. Barış Yıldız
