import { formatUtc, formatPrice, formatPercent } from "../services/format";
import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
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
  useTranslation();
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
        {i18n.t(
          gainers
            ? "marketMovers.gainersHeading"
            : "marketMovers.losersHeading",
          {
            period: i18n.t(
              timeframe === "daily"
                ? "cryptoPricesTable.daily"
                : "marketMovers." + timeframe.toLowerCase(),
            ),
          },
        )}
      </Text>

      <View style={styles.pickerWrapper}>
        <Picker
          accessibilityLabel={i18n.t("marketMovers.period")}
          selectedValue={timeframe}
          onValueChange={(itemValue) => setTimeframe(itemValue)}
          style={styles.picker}
          dropdownIconColor={isDark ? "#fff" : "#333"}
        >
          <Picker.Item
            label={i18n.t("cryptoPricesTable.daily")}
            value="daily"
          />
          <Picker.Item label={i18n.t("marketMovers.weekly")} value="weekly" />
          <Picker.Item label={i18n.t("marketMovers.monthly")} value="monthly" />
        </Picker>
      </View>

      {error ? <Text accessibilityRole="alert">{i18n.t(error)}</Text> : null}
      {meta && (meta.stale || error) ? (
        <Text>
          {i18n.t("marketMovers.staleQuotesSource")}
          {formatUtc(meta.sourceTime)} {i18n.t("detailsScreen.fetched")}
          {formatUtc(meta.fetchedAt)}
        </Text>
      ) : null}
      {initialLoading ? (
        gainers ? (
          <ActivityIndicator size="large" color="#2563EB" />
        ) : (
          <Text style={styles.emptyText}>{i18n.t("marketMovers.loading")}</Text>
        )
      ) : rows.length === 0 ? (
        <Text style={styles.emptyText}>
          {i18n.t("marketMovers.noDataAvailable")}
        </Text>
      ) : (
        rows.map((item, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.cell}>{item.symbol}</Text>
            <Text style={styles.cell}>
              {item.price
                ? formatPrice(item.price)
                : i18n.t("marketMovers.unavailable")}{" "}
              USDT
            </Text>
            <Text style={[styles.cell, styles.priceChange]}>
              {formatPercent(item.change ?? 0)}
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
      padding: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? "#334155" : "#dce3eb",
      flexDirection: "row",
      justifyContent: "space-between",
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
