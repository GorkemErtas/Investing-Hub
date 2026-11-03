import { PermissionsAndroid, Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";

const enabled = process.env.EXPO_PUBLIC_FIREBASE_ENABLED === "true";
export function setupForegroundNotificationHandler() {
  if (!enabled) return () => {};
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  return messaging().onMessage(async (message) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: message.notification?.title ?? "Price alert",
        body: message.notification?.body ?? "",
        sound: "default",
      },
      trigger: null,
    });
  });
}
export async function registerForPushNotificationsAsync() {
  if (!enabled) return null;
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    if (
      (await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      )) !== PermissionsAndroid.RESULTS.GRANTED
    )
      return null;
  }
  const status = await messaging().requestPermission();
  if (
    ![
      messaging.AuthorizationStatus.AUTHORIZED,
      messaging.AuthorizationStatus.PROVISIONAL,
    ].includes(status)
  )
    return null;
  return messaging().getToken();
}
export const watchTokenRefresh = (callback: (token: string) => void) =>
  enabled ? messaging().onTokenRefresh(callback) : () => {};
