import { i18n, userError } from "../services/i18n";
import { useTranslation } from "react-i18next";
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
import { api } from "../services/api";
import { useTheme } from "../context/ThemeContext";

const PortfolioCustomization = ({ portfolio, onBack }) => {
  useTranslation();
  const [portfolioName, setPortfolioName] = useState(portfolio?.name || "");
  const [selectedAvatar, setSelectedAvatar] = useState(
    portfolio?.avatar || "boy",
  );
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
      setMessage("portfolioCustomization.portfolioNameIsRequired");
      return;
    }

    setLoading(true);

    try {
      const metadata = { name: portfolioName, avatar: selectedAvatar };
      if (portfolio) await api.updatePortfolio(portfolio._id, metadata);
      else await api.createPortfolio(metadata);

      const successMessage = portfolio
        ? "portfolioCustomization.portfolioUpdatedSuccessfully"
        : "portfolioCustomization.portfolioCreatedSuccessfully";

      setMessage(successMessage);
      Alert.alert(i18n.t("auth.successTitle"), i18n.t(successMessage), [
        { text: i18n.t("portfolioCustomization.ok"), onPress: onBack },
      ]);
    } catch (error) {
      console.error(
        i18n.t("portfolioCustomization.errorSavingPortfolio"),
        error,
      );
      setMessage(
        userError(error) ||
          "portfolioCustomization.anErrorOccurredPleaseTryAgain",
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      i18n.t("portfolioCustomization.deletePortfolio"),
      i18n.t("portfolioCustomization.areYouSureYouWantToDelete"),
      [
        { text: i18n.t("common:action.cancel"), style: "cancel" },
        {
          text: i18n.t("portfolioCustomization.delete"),
          style: "destructive",
          onPress: deletePortfolio,
        },
      ],
    );
  };

  const deletePortfolio = async () => {
    if (!portfolio?._id) return;

    setLoading(true);
    try {
      await api.deletePortfolio(portfolio._id);

      Alert.alert(
        i18n.t("portfolioCustomization.deletedTitle"),
        i18n.t("portfolioCustomization.portfolioHasBeenDeleted"),
        [{ text: i18n.t("portfolioCustomization.ok"), onPress: onBack }],
      );
    } catch (err) {
      console.error(
        i18n.t("portfolioCustomization.errorDeletingPortfolio"),
        err,
      );
      setMessage("portfolioCustomization.anErrorOccurredWhileDeleting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>
          {i18n.t("common:action.back")}
        </Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>
          {portfolio
            ? i18n.t("portfolioCustomization.editPortfolio")
            : i18n.t("portfolioCustomization.createPortfolio")}
        </Text>

        <Text style={styles.label}>
          {i18n.t("portfolioCustomization.portfolioName")}
        </Text>
        <TextInput
          value={portfolioName}
          onChangeText={setPortfolioName}
          style={styles.input}
          placeholder={i18n.t("portfolioCustomization.enterPortfolioName")}
          accessibilityLabel={i18n.t(
            "portfolioCustomization.enterPortfolioName",
          )}
          placeholderTextColor={isDarkMode ? "#94a3b8" : "#888"}
        />

        <Text style={styles.label}>
          {i18n.t("portfolioCustomization.selectAvatar")}
        </Text>
        <View style={styles.avatarContainer}>
          {["boy", "girl"].map((type) => (
            <TouchableOpacity
              key={type}
              accessibilityRole="button"
              accessibilityLabel={i18n.t("portfolioCustomization.avatar", {
                number: type === "boy" ? 1 : 2,
              })}
              accessibilityState={{ selected: selectedAvatar === type }}
              onPress={() => setSelectedAvatar(type)}
            >
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
              {portfolio
                ? i18n.t("portfolioCustomization.savePortfolio")
                : i18n.t("portfolioCustomization.createPortfolio")}
            </Text>
          )}
        </TouchableOpacity>

        {!!message && <Text style={styles.message}>{i18n.t(message)}</Text>}

        {portfolio && (
          <TouchableOpacity onPress={confirmDelete} style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>
              {i18n.t("portfolioCustomization.deletePortfolio")}
            </Text>
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
