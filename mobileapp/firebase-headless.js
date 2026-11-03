import messaging from '@react-native-firebase/messaging';
if (process.env.EXPO_PUBLIC_FIREBASE_ENABLED === 'true') {
  messaging().setBackgroundMessageHandler(async () => { /* FCM notification payloads are displayed by the OS. */ });
}
