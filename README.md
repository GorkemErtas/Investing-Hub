# 📱 Investing Hub Mobil Uygulama

Investing Hub, kripto para piyasalarını takip etmenizi, portföy yönetimi yapmanızı, al-sat simülasyonları gerçekleştirmenizi ve eğitim içerikleriyle bilginizi artırmanızı sağlayan kapsamlı bir mobil uygulamadır. React Native + Expo altyapısıyla geliştirilmiştir ve Firebase, EAS, makine öğrenimi modelleri gibi teknolojileri entegre şekilde kullanır.

---

## 🚀 Özellikler

- 📊 **Gerçek Zamanlı Piyasa Takibi** – Coin fiyatlarını, trendleri ve grafiklerini canlı takip edin.
- 💼 **Portföy Yönetimi** – Portföy oluşturun, işlemler ekleyin, takip edin.
- 🧠 **Eğitim Merkezi** – Video dersler ve grafik tabanlı quiz’lerle öğrenin.
- 🤖 **Fiyat Tahminleri** – ML modeliyle kısa vadeli fiyat tahminlerini görüntüleyin.
- 🔔 **Bildirimler** – Fiyat uyarıları ve portföy değişiklikleri için push bildirim alın.
- 🌗 **Karanlık Mod** – Kullanıcı tercihine göre aydınlık/karanlık tema.
- 🔐 **Kullanıcı Yönetimi** – Kayıt, e-posta doğrulama ve giriş desteği.
- 📦 **Firebase Entegrasyonu** – Bildirimler için FCM kullanılır.
- 🧪 **TypeScript & Jest** – Güçlü tip kontrolü ve test altyapısı.

---

## 📁 Proje Yapısı

```
.
├── android/                      # Native Android yapılandırmaları
├── app/                          # Sayfalar ve navigasyon
├── assets/                       # İkonlar, splash, vs.
├── backend/                      # Node.js + Express sunucu kodları
├── components/                   # UI bileşenleri
├── context/                      # Auth, Tema, Ayarlar context’leri
├── utils/                        # Yardımcı fonksiyonlar (bildirim, vs.)
├── custom-entry.js              # Firebase headless handler kaydı
├── firebase-headless.js         # Arka plan mesaj işleyicisi
├── app.json                     # Expo yapılandırması
├── eas.json                     # EAS build ayarları
├── package.json                 # Bağımlılıklar
├── tsconfig.json                # TypeScript yapılandırması
└── .gitignore                   # Versiyon kontrol dışı dosyalar
```

---

## 🧪 Kurulum ve Geliştirme

### Gereksinimler

- Node.js & npm/yarn
- Expo CLI (`npm install -g expo-cli`)
- Firebase hesabı (Cloud Messaging aktif)
- Android Studio (Android için)
- Bir fiziksel cihaz veya emulator

### Kurulum Adımları

1. Repo'yu klonla:
   ```bash
   git clone https://github.com/kullaniciadi/ihmobileexpo.git
   cd ihmobileexpo
   ```

2. Bağımlılıkları yükle:
   ```bash
   npm install
   # veya
   yarn
   ```

3. Sunucu IP'ni belirt:
   - `env-config.js` dosyasında `API_BASE_URL`'i kendi IP adresine göre değiştir:
     ```js
     export const API_BASE_URL = "http://192.168.x.x:5001";
     ```

4. Firebase kurulumu:
   - `google-services.json` dosyasını `android/app/` klasörüne yerleştir.

5. Uygulamayı başlat:
   ```bash
   npm start
   ```

6. Android için çalıştır:
   ```bash
   npm run android
   ```

7. iOS için (sadece macOS):
   ```bash
   npm run ios
   ```

---

## 🛠️ EAS Deployment

Uygulama EAS ile build edilebilir. Geliştirme profili şu şekilde yapılandırılmıştır:

```json
// eas.json
{
  "cli": { "version": ">= 3.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    }
  }
}
```

### Build alma:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

---

## 🔔 Bildirim Sistemi

- `@react-native-firebase/messaging` ile FCM kullanılır.
- Arka plan mesajları `firebase-headless.js` içinde işlenir.
- `custom-entry.js` dosyasında headless task kaydı yapılır.
- Bildirimler foreground ve background’da alınabilir.

Firebase tarafında:

- Cloud Messaging aktifleştirilmelidir.
- API anahtarı ve `google-services.json` doğru tanımlanmalıdır.

---

## 🔐 Kimlik Doğrulama Akışı

- Kullanıcılar e-posta, isim ve şifre ile kayıt olur.
- Mail adresine gönderilen doğrulama kodu ile doğrulama yapılır.
- Giriş yapıldığında token ve kullanıcı bilgileri `AsyncStorage` ile saklanır.

> Giriş sonrası: `router.replace('/home')` ile yönlendirme yapılır.

---

## 🧪 Test

Testleri çalıştırmak için:

```bash
npm test
```

Jest & jest-expo ile testler yapılandırılmıştır.

---

## 🌐 Web Desteği

Uygulama Expo’nun `expo-router` yapısını kullanır ve web için de çalışabilir:

```bash
npm run web
```

---

## 👥 Geliştirici Kadrosu

Bu proje Yaşar Üniversitesi kapsamında bir dönem projesi olarak geliştirilmiştir.

- 👨‍💻 Görkem Ertaş  
- 👨‍💻 Cem Arda Doğan  
- 👨‍💻 Asil Demian Özbay  
- 👨‍💻 Taylan Özgür Elma  

Mentör: Dr. Barış Yıldız
