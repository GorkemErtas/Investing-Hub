import "expo-router/entry";
import messaging from "@react-native-firebase/messaging";
import { AppRegistry } from "react-native";
import headlessTask from "./firebase-headless";

// Headless mesaj dinleyici kaydı
AppRegistry.registerHeadlessTask(
  "ReactNativeFirebaseMessagingHeadlessTask",
  () => headlessTask
);
