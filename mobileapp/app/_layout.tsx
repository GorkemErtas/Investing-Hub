import React, { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { View, Text, StyleSheet, Image, Platform } from "react-native";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { setupForegroundNotificationHandler } from "../utils/notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
  const { user, loading, warning: authWarning } = useAuth();
  const [splashVisible, setSplashVisible] = useState(true);
  const { isDarkMode, warning } = useTheme();

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

  screens.push(
    <Tabs.Screen
      key="auth"
      name="auth"
      options={{ title: "Account", href: user ? null : "/auth" }}
    />,
  );

  return (
    <>
      {warning ? <Text accessibilityRole="alert">{warning}</Text> : null}
      {authWarning ? (
        <Text accessibilityRole="alert">{authWarning}</Text>
      ) : null}
      <Tabs
        key={user ? "logged-in" : "guest"}
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: React.ComponentProps<typeof Ionicons>["name"] =
              "home";
            if (route.name === "home") iconName = "home";
            else if (route.name === "portfolio") iconName = "briefcase";
            else if (route.name === "learning-hub") iconName = "school";
            else if (route.name === "auth") iconName = "log-in";
            return <Ionicons name={iconName} size={size} color={color} />;
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
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      return setupForegroundNotificationHandler();
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider>
          <LayoutTabsWithConditionalAuth />
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
  splashImage: {
    width: 220,
    height: 220,
  },
});
