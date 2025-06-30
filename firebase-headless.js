// firebase-headless.js
import messaging from "@react-native-firebase/messaging";

// 🔧 Arka plan mesajlarını burada tanımlıyoruz
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("📨 [BackgroundHandler] Message received", remoteMessage);
  // Gerekirse local bildirim gösterimi buraya eklenebilir
});

export default async (remoteMessage) => {
  console.log("📨 [Headless Task] Message received", remoteMessage);
};
