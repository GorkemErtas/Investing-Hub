import messaging from "@react-native-firebase/messaging";
import { Alert } from "react-native";

// (Opsiyonel) foreground bildirimleri için sound, banner vs.
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowList: true,
  }),
});

export function setupForegroundNotificationHandler() {
  messaging().onMessage(async (remoteMessage) => {
    console.log("📥 [Foreground] Message received:", remoteMessage);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.notification?.title ?? "New Alert",
        body: remoteMessage.notification?.body ?? "You have a new message.",
        sound: "default",
      },
      trigger: null,
    });
  });
}

export async function registerForPushNotificationsAsync() {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      Alert.alert("Bildirim izni verilmedi.");
      return null;
    }

    const fcmToken = await messaging().getToken();
    console.log("✅ FCM Token:", fcmToken);
    return fcmToken;
  } catch (err) {
    console.error("❌ FCM token alınırken hata:", err);
    return null;
  }
}
