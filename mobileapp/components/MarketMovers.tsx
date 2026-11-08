import React, { useState, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useResource } from "../services/useResource";
import { movers } from "../services/api";
import { useTheme } from "../context/ThemeContext";

export function MarketMovers({
  direction,
}: {
  direction: "gainers" | "losers";
}) {
  const gainers = direction === "gainers";
  const [timeframe, setTimeframe] = useState("daily");
  const load = useCallback(
    () => movers(timeframe, gainers),
    [timeframe, gainers],
  );
  const resource = useResource(load);
  const data = resource.data?.data ?? [];
  const error = resource.error,
    initialLoading = resource.loading,
    meta = resource.data?.meta;
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark, gainers);

  const rows = data.filter((coin) =>
    gainers ? coin.change > 0 : coin.change < 0,
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Top {timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}{" "}
        {gainers ? "Gainers" : "Losers"}
      </Text>

      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={timeframe}
          onValueChange={(itemValue) => setTimeframe(itemValue)}
          style={styles.picker}
          dropdownIconColor={isDark ? "#fff" : "#333"}
        >
          <Picker.Item label="Daily" value="daily" />
          <Picker.Item label="Weekly" value="weekly" />
          <Picker.Item label="Monthly" value="monthly" />
        </Picker>
      </View>

      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {meta && (meta.stale || error) ? (
        <Text>
          Stale quotes | Source {meta.sourceTime} | Fetched {meta.fetchedAt}
        </Text>
      ) : null}
      {initialLoading ? (
        gainers ? (
          <ActivityIndicator size="large" color="#2563EB" />
        ) : (
          <Text style={styles.emptyText}>Loading...</Text>
        )
      ) : rows.length === 0 ? (
        <Text style={styles.emptyText}>No data available</Text>
      ) : (
        rows.map((item, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.cell}>{item.symbol}</Text>
            <Text style={styles.cell}>
              {item.price ? item.price.toLocaleString() : "Unavailable"} USDT
            </Text>
            <Text style={[styles.cell, styles.priceChange]}>
              {item.change ? item.change.toFixed(2) : 0}%
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, gainers: boolean) =>
  StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
      flex: 1,
    },
    header: {
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 12,
      color: isDark ? "#f1f5f9" : "#111",
      textAlign: "center",
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#334155" : "#ccc",
      paddingBottom: 6,
    },
    pickerWrapper: {
      backgroundColor: isDark ? "#1e293b" : "#fff",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? "#475569" : "#ccc",
      marginBottom: 16,
      overflow: "hidden",
    },
    picker: {
      height: 54,
      color: isDark ? "#f1f5f9" : "#111",
      paddingHorizontal: 8,
    },
    card: {
      backgroundColor: isDark ? "#1e293b" : "#fff",
      borderRadius: 10,
      padding: 12,
      marginBottom: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    cell: {
      fontSize: 16,
      fontWeight: "500",
      color: isDark ? "#f8fafc" : "#222",
      flex: 1,
      textAlign: "center",
    },
    priceChange: {
      color: gainers ? "#16a34a" : "#DC2626",
    },
    emptyText: {
      fontSize: 16,
      color: isDark ? "#cbd5e1" : "#555",
      textAlign: "center",
      marginTop: 10,
    },
  });
