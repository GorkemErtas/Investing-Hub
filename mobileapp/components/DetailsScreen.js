import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useResource } from "../services/useResource";
import CandlestickSection from "./Candles";
import FibonacciGraph from "./FibonacciGraph";
import { LineChart } from "react-native-chart-kit";
import { chartRows } from "../services/api";
import { useTheme } from "../context/ThemeContext";

const timeframes = {
  "15m": "15 minutes",
  "1h": "Hour",
  "1d": "Day",
  "1w": "Week",
  "1M": "Month",
};

const DetailsScreen = ({ crypto, onBack, onTrade }) => {
  const [chartType, setChartType] = useState("line");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [timeframe, setTimeframe] = useState("1d");
  const { isDarkMode } = useTheme();

  const styles = getStyles(isDarkMode);

  const loadChart = useCallback(
    () => chartRows(crypto.symbol, timeframe),
    [crypto.symbol, timeframe],
  );
  const resource = useResource(loadChart);
  const loadingChart = resource.loading;
  const chartError = resource.error;
  const chartMeta = resource.data?.meta;
  const candleData = resource.data?.candles ?? [];
  const chartData = resource.data
    ? {
        labels: resource.data.line.map((point, i, rows) =>
          i % Math.ceil(rows.length / 6) === 0
            ? new Date(point.time).toISOString().slice(0, 16).replace("T", " ")
            : "",
        ),
        datasets: [{ data: resource.data.line.map((point) => point.price) }],
      }
    : null;

  if (!crypto) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{crypto.symbol} Details (USDT)</Text>
      {chartError ? <Text accessibilityRole="alert">{chartError}</Text> : null}
      {chartMeta ? (
        <Text>
          {chartMeta.stale || chartError ? "Stale candles" : "Public OHLCV"} |
          Source {chartMeta.sourceTime} | Fetched {chartMeta.fetchedAt} UTC
        </Text>
      ) : null}

      <View style={styles.chartContainer}>
        <Text style={styles.chartLabel}>
          Price History ({timeframes[timeframe]}) | UTC
        </Text>

        <View style={styles.timeframeRow}>
          {Object.entries(timeframes).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTimeframe(key)}
              style={[
                styles.timeframeButton,
                timeframe === key && styles.activeTimeframe,
              ]}
            >
              <Text
                style={[
                  styles.timeframeText,
                  timeframe === key && styles.activeTimeframeText,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.timeframeRow}>
          <TouchableOpacity
            onPress={() => setChartType("line")}
            style={[
              styles.timeframeButton,
              chartType === "line" && styles.activeTimeframe,
            ]}
          >
            <Text
              style={[
                styles.timeframeText,
                chartType === "line" && styles.activeTimeframeText,
              ]}
            >
              Line
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setChartType("candlestick")}
            style={[
              styles.timeframeButton,
              chartType === "candlestick" && styles.activeTimeframe,
            ]}
          >
            <Text
              style={[
                styles.timeframeText,
                chartType === "candlestick" && styles.activeTimeframeText,
              ]}
            >
              Candlestick
            </Text>
          </TouchableOpacity>
        </View>

        {loadingChart ? (
          <ActivityIndicator size="large" color="#3b82f6" />
        ) : !chartData ? (
          <Text>No chart data available.</Text>
        ) : chartType === "line" ? (
          <ScrollView horizontal>
            <LineChart
              data={{
                labels: chartData.labels,
                datasets: [{ data: chartData.datasets[0].data }],
              }}
              width={Dimensions.get("window").width * 1.5}
              height={260}
              fromZero={false}
              withVerticalLines={false}
              withOuterLines={false}
              onDataPointClick={({ value, index }) => {
                setSelectedPoint({
                  value,
                  label: chartData.labels[index],
                });
              }}
              chartConfig={{
                backgroundGradientFrom: isDarkMode ? "#1e293b" : "#ffffff",
                backgroundGradientTo: isDarkMode ? "#0f172a" : "#ffffff",
                decimalPlaces: 2,
                color: (opacity = 1) =>
                  isDarkMode
                    ? `rgba(96, 165, 250, ${opacity})`
                    : `rgba(0, 123, 255, ${opacity})`,
                labelColor: () => (isDarkMode ? "#f1f5f9" : "#555"),
                propsForDots: {
                  r: "5",
                  strokeWidth: "2",
                  stroke: "#2563EB",
                },
              }}
              bezier
              yLabelsOffset={12}
              style={{ borderRadius: 12, marginTop: 8, paddingRight: 70 }}
            />
            {selectedPoint && (
              <View
                style={{
                  marginTop: 10,
                  backgroundColor: isDarkMode ? "#1e293b" : "#e2e8f0",
                  padding: 10,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: isDarkMode ? "#f8fafc" : "#1f2937",
                    fontWeight: "bold",
                  }}
                >
                  {selectedPoint.label}
                </Text>
                <Text
                  style={{
                    color: isDarkMode ? "#93c5fd" : "#2563eb",
                    fontSize: 16,
                  }}
                >
                  {parseFloat(selectedPoint.value).toFixed(2)} USDT
                </Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <ScrollView horizontal>
            <View style={{ width: Dimensions.get("window").width * 2 }}>
              <CandlestickSection candleData={candleData} />
            </View>
          </ScrollView>
        )}
      </View>

      {/* Info Box */}
      <View style={styles.detailBox}>
        {[
          ["Current Price", `$${crypto.price?.toLocaleString()}`],
          ["24H Change", `${crypto.dailyChange?.toFixed(2)}%`],
          ["High (24h)", `$${crypto.highPrice?.toLocaleString()}`],
          ["Low (24h)", `$${crypto.lowPrice?.toLocaleString()}`],
          ["Volume", `${crypto.volume?.toLocaleString()}`],
          ["Market Cap", `$${crypto.mktCap?.toLocaleString() || ""}`],
        ].map(([label, value], index) => (
          <View key={index} style={styles.rowItem}>
            <Text style={styles.label}>{label}:</Text>
            <Text
              style={[
                styles.value,
                label === "24H Change"
                  ? +crypto.dailyChange > 0
                    ? styles.green
                    : styles.red
                  : {},
              ]}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.tradeButton}
        onPress={() => onTrade(crypto)}
      >
        <Text style={styles.tradeButtonText}>Trade</Text>
      </TouchableOpacity>
      <FibonacciGraph cryptoSymbol={crypto.symbol} />
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 20,
      backgroundColor: isDark ? "#0f172a" : "#f8fafc",
    },
    backButton: {
      marginBottom: 15,
      alignSelf: "flex-start",
      backgroundColor: isDark ? "#1e293b" : "#e2e8f0",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    backButtonText: {
      color: isDark ? "#93c5fd" : "#1e40af",
      fontSize: 16,
      fontWeight: "bold",
    },
    rowItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
    },
    title: {
      fontSize: 26,
      fontWeight: "bold",
      marginBottom: 20,
      textAlign: "center",
      color: isDark ? "#f1f5f9" : "#0f172a",
    },
    chartContainer: {
      marginTop: 16,
      marginBottom: 24,
      backgroundColor: isDark ? "#1e293b" : "#fff",
      padding: 16,
      borderRadius: 12,
      alignItems: "center",
    },
    chartLabel: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 12,
      textAlign: "center",
      color: isDark ? "#e2e8f0" : "#334155",
    },
    chartError: {
      fontSize: 14,
      color: isDark ? "#94a3b8" : "#888",
      textAlign: "center",
      marginTop: 10,
    },
    timeframeRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 10,
      flexWrap: "wrap",
    },
    timeframeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: "#e5e7eb",
      marginHorizontal: 6,
      marginVertical: 4,
    },
    activeTimeframe: {
      backgroundColor: "#2563eb",
    },
    timeframeText: {
      fontSize: 13,
      color: "#1f2937",
    },
    activeTimeframeText: {
      color: "#fff",
    },
    detailBox: {
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      padding: 16,
      borderRadius: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 1,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      marginTop: 12,
      color: isDark ? "#cbd5e1" : "#475569",
    },
    value: {
      fontSize: 16,
      marginTop: 4,
      color: isDark ? "#f8fafc" : "#0f172a",
    },
    green: {
      color: "#16a34a",
    },
    red: {
      color: "#dc2626",
    },
    tradeButton: {
      marginTop: 24,
      backgroundColor: "#2563eb",
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    tradeButtonText: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "bold",
    },
  });

export default DetailsScreen;
