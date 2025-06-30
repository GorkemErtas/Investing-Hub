import React, { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SelectedCoinsProvider } from "../context/SelectedCoinsContext";
import { View, Text, StyleSheet } from "react-native";
import { ThemeProvider } from "../context/ThemeContext";
import { AlertThresholdProvider } from "../context/AlertThresholdContext";
import { Image, Platform } from "react-native";
import { setupForegroundNotificationHandler } from "../utils/notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTheme } from "../context/ThemeContext";

function SplashScreen() {
  return (
    <View style={styles.splashContainer}>
      <Image
        source={require("../assets/images/splash-icon.png")}
        style={styles.splashImage}
        resizeMode="contain"
      />
    </View>
  );
}

function LayoutTabsWithConditionalAuth() {
  const { user, loading } = useAuth();
  const [splashVisible, setSplashVisible] = useState(true);
  const { isDarkMode } = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => setSplashVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading || splashVisible) return <SplashScreen />;

  const screens = [
    <Tabs.Screen key="index" name="index" options={{ href: null }} />,
    <Tabs.Screen key="home" name="home" />,
    <Tabs.Screen key="portfolio" name="portfolio" />,
    <Tabs.Screen key="learning-hub" name="learning-hub" />,
  ];

  if (user) {
    screens.push(
      <Tabs.Screen key="auth" name="auth" options={{ href: null }} />
    );
  }

  return (
    <Tabs
      key={user ? "logged-in" : "guest"}
  screenOptions={({ route }) => ({
    tabBarIcon: ({ color, size }) => {
      let iconName;
      if (route.name === "home") iconName = "home";
      else if (route.name === "portfolio") iconName = "briefcase";
      else if (route.name === "learning-hub") iconName = "school";
      else if (route.name === "auth") iconName = "log-in";
      return <Ionicons name={iconName as any} size={size} color={color} />;
    },
    tabBarActiveTintColor: isDarkMode ? "#93c5fd" : "#2563EB",
    tabBarInactiveTintColor: isDarkMode ? "#94a3b8" : "gray",
    tabBarStyle: {
      backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
      borderTopColor: isDarkMode ? "#1e293b" : "#e5e7eb",
    },
    headerShown: false,
  })}
    >
      {screens}
    </Tabs>
  );
}

export default function RootLayout() {

  useEffect(() => {
  if (Platform.OS !== "web") {
    setupForegroundNotificationHandler();
  }
}, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <ThemeProvider>
        <SelectedCoinsProvider>
          <AlertThresholdProvider>
            <LayoutTabsWithConditionalAuth />
          </AlertThresholdProvider>
        </SelectedCoinsProvider>
      </ThemeProvider>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  splashText: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  splashImage: {
    width: 220,
    height: 220,
  },
});
