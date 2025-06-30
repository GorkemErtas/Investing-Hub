import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  StyleSheet,
  Modal,
} from "react-native";
import axios from "axios";
import { API_BASE_URL } from "./env-config";
import { useTheme } from "../context/ThemeContext";

const RightSidebar = () => {
  const [visible, setVisible] = useState(false);
  const [cryptoPanicNews, setCryptoPanicNews] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const { isDarkMode } = useTheme();
  const styles = getStyles(isDarkMode);

  const togglePanel = () => setVisible(!visible);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/crypto-news?lang=en`);
        setCryptoPanicNews(res.data.news || []);
        setLastUpdated(
          res.data.lastUpdated
            ? new Date(res.data.lastUpdated).toLocaleString()
            : "N/A"
        );
      } catch (err) {
        console.error("Error fetching news:", err);
      }
    };

    fetchNews();
  }, []);

  const openLink = (url) => {
    Linking.openURL(url).catch(err => console.error("Failed to open link:", err));
  };

  return (
    <>
      <TouchableOpacity style={styles.newsButton} onPress={togglePanel}>
        <Text style={styles.newsButtonText}>📰</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={togglePanel}>
        <View style={styles.modalOverlay}>
          <View style={styles.panel}>
            <View style={styles.header}>
              <Text style={styles.title}>📢 Crypto Insights</Text>
              <TouchableOpacity onPress={togglePanel}>
                <Text style={styles.close}>✖</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
              {cryptoPanicNews.length > 0 ? (
                cryptoPanicNews.map((item, idx) => (
                  <Text key={idx} style={styles.newsItem}>
                    • {item.title}
                  </Text>
                ))
              ) : (
                <Text style={styles.text}>No news available.</Text>
              )}

              <Text style={styles.timestamp}>Last updated: {lastUpdated}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    newsButton: {
      backgroundColor: "#2563eb",
      padding: 10,
      borderRadius: 30,
    },
    newsButtonText: {
      fontSize: 20,
      color: "white",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    panel: {
      backgroundColor: isDark ? "#1f2937" : "white",
      height: "80%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    close: {
      fontSize: 20,
      color: "#ef4444",
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      color: isDark ? "#f8fafc" : "#111827",
    },
    content: {
      marginTop: 10,
    },
    newsItem: {
      color: "#2563eb",
      marginBottom: 12,
      fontSize: 14,
    },
    timestamp: {
      marginTop: 20,
      fontSize: 12,
      color: isDark ? "#9ca3af" : "#6b7280",
    },
    text: {
      color: isDark ? "#e5e7eb" : "#1f2937",
    },
  });

export default RightSidebar;
