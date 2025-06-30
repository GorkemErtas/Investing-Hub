import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import boyAvatar from "../assets/images/boy_3984629.png";
import girlAvatar from "../assets/images/girl_3984664.png";

const WelcomeBanner = () => {
  const { user } = useAuth();
  const { isDarkMode: isDark } = useTheme();
  const firstName = user?.firstName || "Guest";
  const avatar = user?.gender === "girl" ? girlAvatar : boyAvatar;
  const styles = getStyles(isDark);

  return (
    <View style={styles.banner}>
      <Image source={avatar} style={styles.avatar} />
      <View>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.name}>{firstName} 👋</Text>
      </View>
    </View>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    banner: {
      width: "100%",
      backgroundColor: isDark ? "#1e3a8a" : "#3B82F6",
      padding: 20,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    greeting: {
      fontSize: 16,
      color: isDark ? "#BFDBFE" : "#E0F2FE",
      marginBottom: 4,
    },
    name: {
      fontSize: 22,
      fontWeight: "bold",
      color: "#FFFFFF",
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      marginRight: 12,
    },
  });

export default WelcomeBanner;
