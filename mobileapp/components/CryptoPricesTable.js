import { formatUtc, formatPrice, formatPercent } from "../services/format";
import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import DetailsScreen from "./DetailsScreen";
import TradePage from "./TradePage";
import { useResource } from "../services/useResource";
import { marketRows } from "../services/api";
import { useSettings } from "../context/SettingsContext";
import { useTheme } from "../context/ThemeContext";

/*Final update 20.06.2025*/

const CryptoPricesTable = () => {
  useTranslation();
  const [selectedCrypto, setSelectedCrypto] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const { settings } = useSettings();
  const selectedCoins = settings.selectedCoins;
  const resource = useResource(marketRows);
  const cryptoData = resource.data?.data ?? [];
  const loading = resource.loading,
    error = resource.error,
    meta = resource.data?.meta;
  const { isDarkMode } = useTheme();

  const styles = getStyles(isDarkMode);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (viewMode === "details" && selectedCrypto) {
    return (
      <DetailsScreen
        crypto={selectedCrypto}
        onBack={() => {
          setSelectedCrypto(null);
          setViewMode("list");
        }}
        onTrade={(crypto) => {
          setSelectedCrypto(crypto);
          setViewMode("trade");
        }}
      />
    );
  }

  if (viewMode === "trade" && selectedCrypto) {
    return (
      <TradePage
        crypto={selectedCrypto}
        onBack={() => {
          setSelectedCrypto(null);
          setViewMode("list");
        }}
      />
    );
  }

  const filteredData = cryptoData
    .filter((item) =>
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter(
      (item) =>
        selectedCoins.length === 0 || selectedCoins.includes(item.symbol),
    );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        {i18n.t("cryptoPricesTable.cryptoPricesUsdt")}
      </Text>
      {error ? <Text accessibilityRole="alert">{i18n.t(error)}</Text> : null}
      {meta ? (
        <Text>
          {meta.stale || error
            ? i18n.t("cryptoPricesTable.staleQuotes")
            : i18n.t("cryptoPricesTable.publicMarketData")}{" "}
          {i18n.t("cryptoPricesTable.source")} {formatUtc(meta.sourceTime)}{" "}
          {i18n.t("cryptoPricesTable.fetched")}
          {formatUtc(meta.fetchedAt)}
        </Text>
      ) : null}
      {!cryptoData.length ? (
        <Text>{i18n.t("cryptoPricesTable.noMarketDataAvailable")}</Text>
      ) : null}

      <TextInput
        style={styles.searchInput}
        placeholder={i18n.t("cryptoPricesTable.searchBySymbol")}
        accessibilityLabel={i18n.t("cryptoPricesTable.searchBySymbol")}
        placeholderTextColor={isDarkMode ? "#94a3b8" : "#888"}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <View style={styles.headerRow}>
        <Text style={styles.headerCell}>
          {i18n.t("cryptoPricesTable.symbol")}
        </Text>
        <Text style={styles.headerCell}>
          {i18n.t("cryptoPricesTable.price")}
        </Text>
        <Text style={styles.headerCell}>
          {i18n.t("cryptoPricesTable.daily")}
        </Text>
        <Text style={styles.headerCell}>
          {i18n.t("cryptoPricesTable.action")}
        </Text>
      </View>

      {filteredData.map((item, index) => {
        const price = item.price;
        const dailyChange = item.dailyChange ?? 0;

        return (
          <View key={index} style={styles.row}>
            <Text style={styles.cell}>{item.symbol}</Text>
            <Text style={styles.cell}>{formatPrice(price)}</Text>
            <Text
              style={[
                styles.cell,
                +dailyChange > 0 ? styles.green : styles.red,
              ]}
            >
              {formatPercent(dailyChange)}
            </Text>
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={() => {
                setSelectedCrypto(item);
                setViewMode("details");
              }}
            >
              <Text style={styles.detailsButtonText}>
                {i18n.t("cryptoPricesTable.details")}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
      flexGrow: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 12,
      color: isDark ? "#f8fafc" : "#111",
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#334155" : "#ccc",
      paddingBottom: 6,
    },
    pickerWrapper: {
      backgroundColor: isDark ? "#1e293b" : "#fff",
      borderColor: isDark ? "#475569" : "#ccc",
      borderWidth: 1,
      borderRadius: 10,
      marginBottom: 12,
      overflow: "hidden",
      height: 48,
      justifyContent: "center",
    },
    picker: {
      height: 52,
      color: isDark ? "#f1f5f9" : "#111",
      paddingHorizontal: 8,
    },
    pickerItem: {
      fontSize: 16,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: isDark ? "#475569" : "#ccc",
      borderRadius: 10,
      padding: 10,
      marginBottom: 16,
      backgroundColor: isDark ? "#1e293b" : "#fff",
      color: isDark ? "#f1f5f9" : "#111",
    },
    headerRow: {
      flexDirection: "row",
      backgroundColor: isDark ? "#334155" : "#e5e7eb",
      paddingVertical: 8,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: isDark ? "#475569" : "#cbd5e1",
      marginBottom: 6,
    },
    headerCell: {
      flex: 1,
      fontWeight: "bold",
      fontSize: 14,
      color: isDark ? "#f8fafc" : "#1e293b",
      textAlign: "center",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "#1e293b" : "#fff",
      marginBottom: 8,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    cell: {
      flex: 1,
      fontSize: 14,
      textAlign: "center",
      color: isDark ? "#f1f5f9" : "#1f2937",
    },
    green: {
      color: "#16a34a",
    },
    red: {
      color: "#dc2626",
    },
    detailsButton: {
      alignItems: "center",
      backgroundColor: "#2563EB",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      minWidth: 70,
    },
    detailsButtonText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "bold",
    },
  });

export default CryptoPricesTable;
