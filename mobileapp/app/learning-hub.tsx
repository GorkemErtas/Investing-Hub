import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../context/ThemeContext";

import VideoSection from "../components/VideoSection";
import QuizSection from "../components/QuizSection";
import InfoSection from "../components/InfoSection";
import ChartQuizSection from "../components/ChartQuizSection";

export default function LearningHubScreen() {
  useTranslation();
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark);
  const [activeTab, setActiveTab] = useState("videos");

  const renderContent = () => {
    switch (activeTab) {
      case "videos":
        return <VideoSection />;
      case "quiz":
        return <QuizSection />;
      case "info":
        return <InfoSection />;
      case "chart":
        return <ChartQuizSection />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={isDark ? "#0f172a" : "#f3f4f6"}
      />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {i18n.t("learning-hub.welcomeToTheLearningHub")}
          </Text>
          <Text style={styles.subtitle}>
            {i18n.t(
              "learning-hub.exploreCryptocurrenciesAndBlockchainThroughVideosQuizzes",
            )}
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            onPress={() => setActiveTab("videos")}
            style={[
              styles.tabButton,
              activeTab === "videos" && styles.activeTab,
            ]}
          >
            <Text style={styles.tabButtonText}>
              {i18n.t("learning-hub.videos")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("quiz")}
            style={[styles.tabButton, activeTab === "quiz" && styles.activeTab]}
          >
            <Text style={styles.tabButtonText}>
              {i18n.t("learning-hub.quiz")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("info")}
            style={[styles.tabButton, activeTab === "info" && styles.activeTab]}
          >
            <Text style={styles.tabButtonText}>
              {i18n.t("learning-hub.info")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("chart")}
            style={[
              styles.tabButton,
              activeTab === "chart" && styles.activeTab,
            ]}
          >
            <Text style={styles.tabButtonText}>
              {i18n.t("learning-hub.chart")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>{renderContent()}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean) => {
  const topOffset =
    Platform.OS === "android" ? RNStatusBar.currentHeight || 36 : 0;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "#0f172a" : "#f3f4f6",
      paddingTop: topOffset,
    },
    scrollContainer: {
      padding: 16,
      alignItems: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 26,
      fontWeight: "bold",
      textAlign: "center",
      color: isDark ? "#e0f2fe" : "#1E40AF",
    },
    subtitle: {
      fontSize: 14,
      textAlign: "center",
      marginTop: 8,
      maxWidth: 600,
      color: isDark ? "#94a3b8" : "#4B5563",
    },
    buttonRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      marginBottom: 20,
      gap: 10,
    },
    tabButton: {
      backgroundColor: isDark ? "#334155" : "#e5e7eb",
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      marginHorizontal: 4,
    },
    activeTab: {
      backgroundColor: "#2563eb",
    },
    tabButtonText: {
      color: "#fff",
      fontWeight: "bold",
    },
    section: {
      width: "100%",
      maxWidth: 800,
    },
  });
};
