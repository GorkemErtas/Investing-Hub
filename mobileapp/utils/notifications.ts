// Browser preview has no native Firebase module and never stores an FCM token.
export const setupForegroundNotificationHandler = () => () => {};
export const registerForPushNotificationsAsync = async (): Promise<
  string | null
> => null;
export const watchTokenRefresh =
  (_callback: (token: string) => void) => () => {};
