import {
  formatAmount,
  formatPrice,
  formatPercent,
  formatUtc,
  formatChartTick,
} from "../services/format";
import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useResource } from "../services/useResource";
import CandlestickSection from "./Candles";
import FibonacciGraph from "./FibonacciGraph";
import { LineChart } from "react-native-chart-kit";
import { chartRows } from "../services/api";
import { useTheme } from "../context/ThemeContext";

const timeframes = {
  "15m": "common:chart.minutes",
  "1h": "common:chart.hour",
  "1d": "common:chart.day",
  "1w": "common:chart.week",
  "1M": "common:chart.month",
};

const DetailsScreen = ({ crypto, onBack, onTrade }) => {
  useTranslation();
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
          i % Math.ceil(rows.length / 3) === 0
            ? formatChartTick(
                point.time,
                timeframe === "15m" || timeframe === "1h",
              )
            : "",
        ),
        datasets: [{ data: resource.data.line.map((point) => point.price) }],
      }
    : null;

  if (!crypto) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>
          {i18n.t("detailsScreen.back")}
        </Text>
      </TouchableOpacity>

      <Text style={styles.title}>
        {crypto.symbol} {i18n.t("detailsScreen.detailsUsdt")}
      </Text>
      {chartError ? (
        <Text accessibilityRole="alert">{i18n.t(chartError)}</Text>
      ) : null}
      {chartMeta ? (
        <Text>
          {chartMeta.stale || chartError
            ? i18n.t("detailsScreen.staleCandles")
            : i18n.t("detailsScreen.publicOhlcv")}{" "}
          {i18n.t("detailsScreen.source")}
          {formatUtc(chartMeta.sourceTime)} {i18n.t("detailsScreen.fetched")}
          {formatUtc(chartMeta.fetchedAt)}
        </Text>
      ) : null}

      <View style={styles.chartContainer}>
        <Text style={styles.chartLabel}>
          {i18n.t("detailsScreen.priceHistory")}
          {i18n.t(timeframes[timeframe])}
          {i18n.t("detailsScreen.utc")}
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
                {i18n.t(label)}
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
              {i18n.t("detailsScreen.line")}
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
              {i18n.t("detailsScreen.candlestick")}
            </Text>
          </TouchableOpacity>
        </View>

        {loadingChart ? (
          <ActivityIndicator size="large" color="#3b82f6" />
        ) : !chartData ? (
          <Text>{i18n.t("detailsScreen.noChartDataAvailable")}</Text>
        ) : chartType === "line" ? (
          <ScrollView horizontal>
            <LineChart
              formatYLabel={(value) => formatAmount(Number(value))}
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
                  timestamp: resource.data.line[index].time,
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
                  {formatUtc(selectedPoint.timestamp)}
                </Text>
                <Text
                  style={{
                    color: isDarkMode ? "#93c5fd" : "#2563eb",
                    fontSize: 16,
                  }}
                >
                  {formatPrice(parseFloat(selectedPoint.value))} USDT
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
          [
            i18n.t("detailsScreen.currentPrice"),
            `${formatPrice(crypto.price)} USDT`,
          ],
          [
            i18n.t("detailsScreen.24hChange"),
            formatPercent(crypto.dailyChange ?? 0),
          ],
          [
            i18n.t("detailsScreen.high24h"),
            `${formatPrice(crypto.highPrice)} USDT`,
          ],
          [
            i18n.t("detailsScreen.low24h"),
            `${formatPrice(crypto.lowPrice)} USDT`,
          ],
          [i18n.t("common:chart.volume"), `${formatAmount(crypto.volume)}`],
        ].map(([label, value], index) => (
          <View key={index} style={styles.rowItem}>
            <Text style={styles.label}>{label}:</Text>
            <Text
              style={[
                styles.value,
                index === 1
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
        <Text style={styles.tradeButtonText}>
          {i18n.t("detailsScreen.trade")}
        </Text>
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
