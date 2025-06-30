import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import boyAvatar from "../assets/images/boy_3984629.png";
import girlAvatar from "../assets/images/girl_3984664.png";
import { API_BASE_URL } from "./env-config";
import { useTheme } from "../context/ThemeContext";

const PortfolioCustomization = ({ portfolio, userId, onBack }) => {
  const [portfolioName, setPortfolioName] = useState(portfolio?.name || "");
  const [selectedAvatar, setSelectedAvatar] = useState(portfolio?.avatar || "boy");
  const [isLoading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const { isDarkMode } = useTheme();
  const styles = getStyles(isDarkMode);

  useEffect(() => {
    if (portfolio) {
      setPortfolioName(portfolio.name || "");
      setSelectedAvatar(portfolio.avatar || "boy");
    }
  }, [portfolio]);

  const getAvatarImage = (avatarName) =>
    avatarName === "girl" ? girlAvatar : boyAvatar;

  const savePortfolio = async () => {
    if (!portfolioName.trim()) {
      setMessage("Portfolio name is required.");
      return;
    }

    setLoading(true);

    const endpoint = portfolio
      ? `${API_BASE_URL}/portfolio/${portfolio._id}`
      : `${API_BASE_URL}/create-portfolio`;

    const method = portfolio ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: portfolioName,
          avatar: selectedAvatar,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", errorText);
        setMessage("An error occurred. Please try again.");
        return;
      }

      const successMessage = portfolio
        ? "Portfolio updated successfully!"
        : "Portfolio created successfully!";

      setMessage(successMessage);
      Alert.alert("Success", successMessage, [{ text: "OK", onPress: onBack }]);
    } catch (error) {
      console.error("Error saving portfolio:", error);
      setMessage("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete Portfolio",
      "Are you sure you want to delete this portfolio?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: deletePortfolio },
      ]
    );
  };

  const deletePortfolio = async () => {
    if (!portfolio?._id) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/${portfolio._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Delete error:", errorText);
        setMessage("Failed to delete portfolio.");
        return;
      }

      Alert.alert("Deleted", "Portfolio has been deleted.", [
        { text: "OK", onPress: onBack },
      ]);
    } catch (err) {
      console.error("Error deleting portfolio:", err);
      setMessage("An error occurred while deleting.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>{portfolio ? "Edit Portfolio" : "Create Portfolio"}</Text>

        <Text style={styles.label}>Portfolio Name</Text>
        <TextInput
          value={portfolioName}
          onChangeText={setPortfolioName}
          style={styles.input}
          placeholder="Enter portfolio name"
          placeholderTextColor={isDarkMode ? "#94a3b8" : "#888"}
        />

        <Text style={styles.label}>Select Avatar</Text>
        <View style={styles.avatarContainer}>
          {["boy", "girl"].map((type) => (
            <TouchableOpacity key={type} onPress={() => setSelectedAvatar(type)}>
              <Image
                source={getAvatarImage(type)}
                style={[
                  styles.avatar,
                  selectedAvatar === type && styles.selectedAvatar,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={savePortfolio}
          style={styles.saveButton}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {portfolio ? "Save Portfolio" : "Create Portfolio"}
            </Text>
          )}
        </TouchableOpacity>

        {!!message && <Text style={styles.message}>{message}</Text>}

        {portfolio && (
          <TouchableOpacity onPress={confirmDelete} style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>Delete Portfolio</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 20,
      backgroundColor: isDark ? "#0f172a" : "#f9fafb",
      flexGrow: 1,
    },
    backButton: {
      marginBottom: 20,
      alignSelf: "flex-start",
      backgroundColor: isDark ? "#334155" : "#6B7280",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    backButtonText: { color: "#fff" },
    card: {
      backgroundColor: isDark ? "#1e293b" : "#fff",
      padding: 16,
      borderRadius: 12,
      marginBottom: 24,
      elevation: 2,
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 12,
      color: isDark ? "#f8fafc" : "#000",
    },
    label: {
      marginBottom: 4,
      fontWeight: "500",
      color: isDark ? "#cbd5e1" : "#111",
    },
    input: {
      borderWidth: 1,
      borderColor: "#ccc",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 12,
      color: isDark ? "#f1f5f9" : "#000",
      backgroundColor: isDark ? "#1e293b" : "#fff",
    },
    avatarContainer: {
      flexDirection: "row",
      marginBottom: 16,
      gap: 10,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      marginRight: 10,
    },
    selectedAvatar: {
      borderWidth: 2,
      borderColor: "#3B82F6",
    },
    saveButton: {
      backgroundColor: "#3B82F6",
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
      marginBottom: 12,
    },
    saveButtonText: {
      color: "#fff",
      fontWeight: "bold",
    },
    deleteButton: {
      backgroundColor: "#ef4444",
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    deleteButtonText: {
      color: "#fff",
      fontWeight: "bold",
    },
    message: {
      marginTop: 12,
      textAlign: "center",
      color: "#10B981",
    },
  });

export default PortfolioCustomization;
