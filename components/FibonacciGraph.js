import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { API_BASE_URL } from "./env-config";
import { useTheme } from "../context/ThemeContext";

const FibonacciGraph = ({ cryptoSymbol }) => {
  const [timeframe, setTimeframe] = useState("7");
  const [ohlcData, setOhlcData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [fibonacciLevels, setFibonacciLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isDarkMode } = useTheme();

  /*Final update 20.06.2025*/


  useEffect(() => {
    if (!cryptoSymbol) {
      setError("Invalid cryptocurrency symbol.");
      return;
    }

    const fetchFibonacciData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `http://${API_BASE_URL}/api/fibonacci/${cryptoSymbol}/${timeframe}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch Fibonacci data from backend.");
        }

        const { marketChart } = await response.json();

        const ohlc = marketChart.prices.map(([timestamp, close], index, arr) => {
          const open = index === 0 ? close : arr[index - 1][1];
          const high = Math.max(open, close);
          const low = Math.min(open, close);
          return { x: new Date(timestamp), o: open, h: high, l: low, c: close };
        });

        setOhlcData(ohlc.map((entry) => entry.c));
        setLabels(ohlc.map((entry) => entry.x.toLocaleDateString("en-US")));

        const high = Math.max(...ohlc.map((entry) => entry.h));
        const low = Math.min(...ohlc.map((entry) => entry.l));

        setFibonacciLevels([
          { label: "0% (High)", value: high },
          { label: "23.6%", value: high - (high - low) * 0.236 },
          { label: "38.2%", value: high - (high - low) * 0.382 },
          { label: "50.0%", value: high - (high - low) * 0.5 },
          { label: "61.8%", value: high - (high - low) * 0.618 },
          { label: "78.6%", value: high - (high - low) * 0.786 },
          { label: "100% (Low)", value: low },
        ]);

        setLoading(false);
      } catch (error) {
        console.error("Error fetching Fibonacci data:", error);
        setError(error.message || "Something went wrong.");
        setLoading(false);
      }
    };

    fetchFibonacciData();
  }, [cryptoSymbol, timeframe]);

  const styles = getStyles(isDarkMode);

  if (loading) return <ActivityIndicator size="large" color="#3b82f6" />;
  if (error) return <Text style={styles.errorText}>Error: {error}</Text>;

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
                ? "1 Day"
                : tf === "7"
                ? "1 Week"
                : tf === "30"
                ? "1 Month"
                : "1 Year"}
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
