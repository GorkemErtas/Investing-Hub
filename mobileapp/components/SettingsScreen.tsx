import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Alert,
} from "react-native";
import { assets } from "@investing-hub/shared/contracts";
import { useSettings } from "../context/SettingsContext";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const availableCoins = assets.map((asset) => asset.base);

const SettingsScreen = ({ onBack }: { onBack: () => void }) => {
  const { user } = useAuth();
  const { settings, save, warning } = useSettings();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark);
  const [selectedCoins, setSelectedCoins] = useState<string[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<{
    [key: string]: { min: number; max: number };
  }>({});

  const updatePriceAlert = (
    coin: string,
    type: "min" | "max",
    value: number,
  ) => {
    setPriceAlerts((prev) => ({
      ...prev,
      [coin]: {
        ...(prev[coin] || { min: 0, max: 0 }),
        [type]: value,
      },
    }));
  };

  useEffect(() => {
    setSelectedCoins(settings.selectedCoins);
    setPriceAlerts(settings.priceAlerts);
    void api
      .capabilities()
      .then((c) => setNotificationsEnabled(c.notifications))
      .catch(() => setNotificationsEnabled(false));
  }, [settings]);

  const toggleCoin = (symbol: string) => {
    setSelectedCoins((prev) =>
      prev.includes(symbol)
        ? prev.filter((c) => c !== symbol)
        : [...prev, symbol],
    );
  };

  const saveSettings = async () => {
    try {
      await save({
        selectedCoins,
        ...(user && notificationsEnabled ? { priceAlerts } : {}),
      });
      onBack();
    } catch (error) {
      Alert.alert(
        "Could not save settings",
        error instanceof Error
          ? error.message
          : "Check alert ranges and retry.",
      );
    }
  };

  const handleSelectAll = () => {
    setSelectedCoins([...availableCoins]);
  };

  const handleClearAll = () => {
    setSelectedCoins([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Select Your Favorite Coins</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleSelectAll}
            style={styles.selectButton}
          >
            <Text style={styles.selectButtonText}>Select All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.coinsGrid}>
          {availableCoins.map((coin) => (
            <TouchableOpacity
              key={coin}
              onPress={() => toggleCoin(coin)}
              style={[
                styles.coinBox,
                selectedCoins.includes(coin) && styles.selectedCoinBox,
              ]}
            >
              <Text
                style={[
                  styles.coinText,
                  selectedCoins.includes(coin) && styles.selectedCoinText,
                ]}
              >
                {coin}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {warning ? <Text accessibilityRole="alert">{warning}</Text> : null}
        {!notificationsEnabled ? (
          <Text>
            Price alert delivery is unavailable. Your favorites and theme still
            work.
          </Text>
        ) : null}
        {/* Price ranges are stored only when server delivery is enabled. */}
        {(user && notificationsEnabled ? selectedCoins : []).map((coin) => (
          <View key={coin} style={{ marginTop: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: isDark ? "#f8fafc" : "#1f2937",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              {coin} Price Alerts
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <TextInput
                  placeholder="Min Price (USDT)"
                  placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                  keyboardType="numeric"
                  value={priceAlerts[coin]?.min?.toString() || ""}
                  onChangeText={(val) =>
                    updatePriceAlert(coin, "min", parseFloat(val) || 0)
                  }
                  style={{
                    backgroundColor: isDark ? "#1e293b" : "#e5e7eb",
                    padding: 10,
                    borderRadius: 8,
                    color: isDark ? "#f8fafc" : "#1f2937",
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  placeholder="Max Price (USDT)"
                  placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                  keyboardType="numeric"
                  value={priceAlerts[coin]?.max?.toString() || ""}
                  onChangeText={(val) =>
                    updatePriceAlert(coin, "max", parseFloat(val) || 0)
                  }
                  style={{
                    backgroundColor: isDark ? "#1e293b" : "#e5e7eb",
                    padding: 10,
                    borderRadius: 8,
                    color: isDark ? "#f8fafc" : "#1f2937",
                  }}
                />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={saveSettings} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? "#0f172a" : "#f3f4f6" },
    scrollContainer: { padding: 20 },
    title: {
      fontSize: 22,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 20,
      color: isDark ? "#f8fafc" : "#111827",
    },
    actionsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginBottom: 16,
    },
    selectButton: {
      backgroundColor: "#22c55e",
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    clearButton: {
      backgroundColor: "#ef4444",
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    selectButtonText: { color: "white", fontWeight: "bold" },
    clearButtonText: { color: "white", fontWeight: "bold" },
    coinsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
    },
    coinBox: {
      backgroundColor: isDark ? "#1e293b" : "#e5e7eb",
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    selectedCoinBox: {
      backgroundColor: "#2563EB",
    },
    coinText: {
      fontSize: 16,
      color: isDark ? "#f1f5f9" : "#1f2937",
    },
    selectedCoinText: {
      color: "white",
      fontWeight: "bold",
    },
    backButton: {
      marginBottom: 20,
      alignSelf: "flex-start",
      padding: 10,
    },
    backButtonText: {
      fontSize: 16,
      color: "#2563EB",
    },
    saveButton: {
      backgroundColor: "#2563EB",
      padding: 14,
      borderRadius: 10,
      marginTop: 30,
      alignItems: "center",
    },
    saveButtonText: {
      color: "white",
      fontSize: 18,
      fontWeight: "bold",
    },
  });

export default SettingsScreen;
