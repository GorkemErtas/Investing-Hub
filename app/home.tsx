import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
  StatusBar as RNStatusBar
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import WelcomeBanner from "../components/WelcomeBanner";
import TrendingCoins from "../components/TrendingCoins";
import TopExchanges from "../components/TopLosers";
import CryptoPricesTable from "../components/CryptoPricesTable";
import RightSidebar from "../components/RightSidebar";
import SettingsScreen from "../components/SettingsScreen";

export default function HomeScreen() {
  const { logout, user } = useAuth();
  const { isDarkMode, setDarkMode } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleLogout = async () => {
    setMenuVisible(false);
    await logout();
  };

  const dynamicStyles = getStyles(isDarkMode);

  if (showSettings) {
    return <SettingsScreen onBack={() => setShowSettings(false)} />;
  }

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <StatusBar style={isDarkMode ? "light" : "dark"} backgroundColor={isDarkMode ? "#0f172a" : "#f1f5f9"} />

      <TouchableOpacity
        style={dynamicStyles.settingsIcon}
        onPress={() => setMenuVisible(true)}
      >
        <Ionicons name="settings" size={24} color={isDarkMode ? "#f1f5f9" : "#374151"} />
      </TouchableOpacity>

      <View style={dynamicStyles.newsButtonWrapper}>
        <RightSidebar />
      </View>

      <ScrollView contentContainerStyle={dynamicStyles.scrollContainer}>
        <WelcomeBanner />
        <Text style={dynamicStyles.heading}>Crypto Dashboard</Text>
        <Text style={dynamicStyles.subheading}>
          Follow the market, trade smart, grow your portfolio.
        </Text>

        <View style={dynamicStyles.row}>
          <TrendingCoins />
          <TopExchanges />
        </View>

        <CryptoPricesTable />
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          onPress={() => setMenuVisible(false)}
          activeOpacity={1}
        >
          <View style={dynamicStyles.menuBox}>
            <View style={dynamicStyles.themeRow}>
              <Text style={dynamicStyles.themeText}>Dark Mode</Text>
              <Switch
                value={isDarkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: "#ccc", true: "#4b5563" }}
                thumbColor={isDarkMode ? "#f9fafb" : "#fff"}
              />
            </View>

            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false);
                setShowSettings(true);
              }}
              style={{ marginTop: 16 }}
            >
              <Text style={dynamicStyles.settingsOption}>Settings</Text>
            </TouchableOpacity>

            {user && (
              <TouchableOpacity onPress={handleLogout} style={{ marginTop: 10 }}>
                <Text style={dynamicStyles.logout}>Logout</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (isDarkMode) => {
  const topOffset = Platform.OS === "android" ? RNStatusBar.currentHeight || 36 : 0;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDarkMode ? "#0f172a" : "#f1f5f9",
      paddingTop: topOffset,
    },
    scrollContainer: {
      padding: 20,
      paddingBottom: 60,
    },
    heading: {
      fontSize: 28,
      fontWeight: "bold",
      textAlign: "center",
      color: isDarkMode ? "#e0f2fe" : "#1e3a8a",
      marginBottom: 4,
    },
    subheading: {
      fontSize: 15,
      color: isDarkMode ? "#cbd5e1" : "#64748b",
      textAlign: "center",
      marginBottom: 16,
    },
    row: {
      flexDirection: "column",
      gap: 16,
    },
    settingsIcon: {
      position: "absolute",
      top: (RNStatusBar.currentHeight || 36) + 6,
      right: 18,
      zIndex: 10,
      backgroundColor: isDarkMode ? "#1e293b" : "#e2e8f0",
      padding: 10,
      borderRadius: 50,
      elevation: 3,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-start",
      alignItems: "flex-end",
      paddingTop: 60,
      paddingRight: 20,
    },
    menuBox: {
      backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
      padding: 18,
      borderRadius: 12,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 6,
      elevation: 6,
      minWidth: 180,
    },
    logout: {
      color: "#ef4444",
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "right",
    },
    settingsOption: {
      color: "#3b82f6",
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "right",
    },
    themeRow: {
      marginTop: 4,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    themeText: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDarkMode ? "#f1f5f9" : "#1f2937",
    },
    newsButtonWrapper: {
      position: "absolute",
      top: (RNStatusBar.currentHeight || 36) + 54,
      right: 20,
      zIndex: 10,
      transform: [{ scale: 0.9 }],
    },
  });
};
