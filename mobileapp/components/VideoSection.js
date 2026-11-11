import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../context/ThemeContext";

const videos = [
  {
    id: 1,
    title: "infoSection.whatIsCryptocurrency",
    url: "https://www.youtube.com/embed/SSo_EIwHSd4",
  },
  {
    id: 2,
    title: "videoSection.howBlockchainWorks",
    url: "https://www.youtube.com/embed/3xGLc-zz9cA",
  },
  {
    id: 3,
    title: "videoSection.understandingSmartContracts",
    url: "https://www.youtube.com/embed/ZE2HxTmxfrI",
  },
  {
    id: 4,
    title: "videoSection.easyCryptoTechnicalAnalysisTutorialForBeginners",
    url: "https://www.youtube.com/embed/5ZGvuNCAlYk",
  },
  {
    id: 5,
    title: "videoSection.howToReadCandlestickChartsFastBeginner",
    url: "https://www.youtube.com/embed/AOz1YPOKvEs",
  },
];

const VideoSection = () => {
  useTranslation();
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {i18n.t("videoSection.educationalVideos")}
      </Text>
      <Text style={{ color: isDark ? "#cbd5e1" : "#475569", marginBottom: 16 }}>
        {i18n.t("videoSection.external")}
      </Text>

      {videos.map((item) => (
        <View key={item.id} style={styles.videoContainer}>
          <Text style={styles.videoTitle}>{i18n.t(item.title)}</Text>
          {Platform.OS === "web" ? (
            <TouchableOpacity
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(
                  item.url.replace("/embed/", "/watch?v="),
                ).catch(() => Alert.alert(i18n.t("videoSection.openError")));
              }}
            >
              <Text>{i18n.t("videoSection.watchOnYoutube")}</Text>
            </TouchableOpacity>
          ) : (
            <WebView
              originWhitelist={["https://www.youtube.com", "about:blank"]}
              source={{
                html: `
                <html>
                  <body style="margin:0;padding:0;background-color:transparent;">
                    <iframe 
                      width="100%" 
                      height="100%" 
                      src="${item.url}" 
                      frameborder="0" 
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                      allowfullscreen
                    ></iframe>
                  </body>
                </html>
              `,
              }}
              style={styles.video}
              javaScriptEnabled
              domStorageEnabled
              allowsFullscreenVideo
            />
          )}
        </View>
      ))}
    </View>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 15,
      backgroundColor: isDark ? "#0f172a" : "#f9f9f9",
      flex: 1,
    },
    header: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 10,
      color: isDark ? "#f8fafc" : "#333",
      textAlign: "center",
    },
    videoContainer: {
      marginBottom: 20,
      backgroundColor: isDark ? "#1e293b" : "#fff",
      padding: 10,
      borderRadius: 8,
      overflow: "hidden",
    },
    videoTitle: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 5,
      color: isDark ? "#e2e8f0" : "#444",
    },
    video: { height: 200 },
  });

export default VideoSection;
