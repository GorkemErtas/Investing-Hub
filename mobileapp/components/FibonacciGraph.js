import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useResource } from "../services/useResource";
import { api, symbolFor } from "../services/api";
import { fibonacciLevels as calculateLevels } from "@investing-hub/shared/analysis";
import { useTheme } from "../context/ThemeContext";

const FibonacciGraph = ({ cryptoSymbol }) => {
  const [timeframe, setTimeframe] = useState("7");
  const { isDarkMode } = useTheme();

  const load = useCallback(
    () =>
      api.candles(
        symbolFor(cryptoSymbol),
        timeframe === "1" ? "1h" : timeframe === "365" ? "1w" : "1d",
      ),
    [cryptoSymbol, timeframe],
  );
  const resource = useResource(load);
  const loading = resource.loading;
  const error =
    resource.error ||
    (resource.data?.meta.stale
      ? "Provider candles are stale. Analysis is unavailable until fresh data returns."
      : "");
  const period =
    timeframe === "1" ? 24 : timeframe === "365" ? 52 : Number(timeframe);
  const candles =
    resource.data?.data.filter((c) => c.completed).slice(-period) ?? [];
  const ohlcData = candles.map((c) => c.close);
  const labels = candles.map((c) =>
    new Date(c.openTime).toISOString().slice(0, 10),
  );
  const fibonacciLevels = calculateLevels(candles).map((level) => ({
    label: `${level.ratio * 100}%`,
    value: level.price,
  }));

  const styles = getStyles(isDarkMode);

  if (loading) return <ActivityIndicator size="large" color="#3b82f6" />;
  if (error) return <Text style={styles.errorText}>Error: {error}</Text>;
  if (!candles.length)
    return <Text>No completed candles available for analysis.</Text>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.timeframeContainer}>
        {["1", "7", "30", "365"].map((tf) => (
          <TouchableOpacity
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={[
              styles.timeframeButton,
              timeframe === tf && styles.selectedTimeframe,
            ]}
          >
            <Text style={styles.timeframeText}>
              {tf === "1"
                ? "24 closed hours"
                : tf === "7"
                  ? "7 closed days"
                  : tf === "30"
                    ? "30 closed days"
                    : "52 closed weeks"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Fibonacci Retracement</Text>
        <LineChart
          data={{
            labels: labels,
            datasets: [
              {
                data: ohlcData,
                color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
                strokeWidth: 2,
              },
              ...fibonacciLevels.map((level) => ({
                data: Array(labels.length).fill(level.value),
                color: (opacity = 1) => `rgba(255, 99, 132, ${opacity})`,
                strokeWidth: 1.5,
              })),
            ],
          }}
          width={350}
          height={250}
          chartConfig={{
            backgroundColor: isDarkMode ? "#1e293b" : "#fff",
            backgroundGradientFrom: isDarkMode ? "#1e293b" : "#f3f3f3",
            backgroundGradientTo: isDarkMode ? "#0f172a" : "#fff",
            decimalPlaces: 2,
            color: (opacity = 1) =>
              isDarkMode
                ? `rgba(255, 255, 255, ${opacity})`
                : `rgba(0, 0, 0, ${opacity})`,
            labelColor: (opacity = 1) =>
              isDarkMode
                ? `rgba(226, 232, 240, ${opacity})`
                : `rgba(0, 0, 0, ${opacity})`,
          }}
        />
      </View>
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 15,
      backgroundColor: isDark ? "#0f172a" : "#fff",
      flex: 1,
    },
    errorText: {
      color: "red",
      fontSize: 16,
      textAlign: "center",
    },
    timeframeContainer: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 10,
    },
    timeframeButton: {
      padding: 10,
      margin: 5,
      backgroundColor: isDark ? "#475569" : "#ccc",
      borderRadius: 5,
    },
    selectedTimeframe: {
      backgroundColor: "#007bff",
    },
    timeframeText: {
      color: "#fff",
      fontSize: 16,
    },
    chartContainer: {
      alignItems: "center",
      marginBottom: 20,
    },
    chartTitle: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 10,
      color: isDark ? "#f1f5f9" : "#000",
    },
  });

export default FibonacciGraph;
