import * as SecureStore from "expo-secure-store";
const key = "investing-hub.session.v2";
export const tokenStore = {
  get: () => SecureStore.getItemAsync(key),
  set: (value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(key),
};
