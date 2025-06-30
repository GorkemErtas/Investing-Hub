const admin = require("firebase-admin");
const serviceAccount = require("../service-account.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function sendNotificationToUser(user, title, body) {
  if (!user.fcmToken) {
    console.warn(`❗ Kullanıcının FCM token'ı yok: ${user.email}`);
    return;
  }

  const message = {
    token: user.fcmToken,
    notification: {
      title,
      body,
    },
    android: {
      priority: "high",
      notification: {
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
    data: { withSome: "data" },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("📨 Bildirim gönderildi:", response);
  } catch (err) {
    console.error("📛 Bildirim gönderilemedi:", err.message);
  }
}

module.exports = { sendNotificationToUser };
