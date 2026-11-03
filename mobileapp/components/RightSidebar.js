import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from "react-native";

import { useTheme } from "../context/ThemeContext";

const RightSidebar = () => {
  const [visible, setVisible] = useState(false);

  const { isDarkMode } = useTheme();
  const styles = getStyles(isDarkMode);

  const togglePanel = () => setVisible(!visible);

  return (
    <>
      <TouchableOpacity style={styles.newsButton} onPress={togglePanel}>
        <Text style={styles.newsButtonText}>📰</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={togglePanel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.panel}>
            <View style={styles.header}>
              <Text style={styles.title}>📢 Crypto Insights</Text>
              <TouchableOpacity onPress={togglePanel}>
                <Text style={styles.close}>✖</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
              <Text style={styles.text}>
                News is unavailable. Legacy generated headlines were removed
                because they could not be verified.
              </Text>
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
