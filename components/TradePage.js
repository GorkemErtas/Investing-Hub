import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { LineChart } from "react-native-chart-kit";
import DateTimePicker from "@react-native-community/datetimepicker";
import { API_BASE_URL } from "./env-config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";

const timeframes = {
  "1m": "Minute",
  "1h": "Hour",
  "1d": "Day",
  "1w": "Week",
  "1M": "Month",
};

const models = ["tree", "svr", "rf", "lr", "cnn_reg", "lstm"];
const intervalMap = (mins) => {
  if (mins % 10080 === 0) return `${mins / 10080}w`;
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
};

const CandlestickSection = ({ candleData }) => {
  if (Platform.OS === "web") return null;

  const CandlestickChart = require("react-native-wagmi-charts").CandlestickChart;

  return (
    <CandlestickChart.Provider data={candleData}>
      <CandlestickChart height={270}>
        <CandlestickChart.Candles />
        <CandlestickChart.Crosshair>
          <CandlestickChart.Tooltip />
        </CandlestickChart.Crosshair>
      </CandlestickChart>
    </CandlestickChart.Provider>
  );
};

const TradePage = ({ crypto, onBack }) => {
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState(crypto?.price || 0);
  const [action, setAction] = useState("");
  const [timeframe, setTimeframe] = useState("1d");
  const [transactionDate, setTransactionDate] = useState(new Date());
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [chartData, setChartData] = useState(null);
  const [candleData, setCandleData] = useState([]);
  const [chartType, setChartType] = useState("line");
  const [loadingChart, setLoadingChart] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [predInterval, setPredInterval] = useState(15);
  const [preds, setPreds] = useState({});
  const [showHint, setShowHint] = useState(false);
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark);

  if (!crypto) return null;

  useEffect(() => {
    const fetchPortfolios = async () => {
      try {
        const userData = await AsyncStorage.getItem("user");
        if (!userData) return;
        const user = JSON.parse(userData);
        const response = await fetch(`${API_BASE_URL}/portfolios?userId=${user.id}`);
        const data = await response.json();
        setPortfolios(data);
      } catch (error) {
        console.error("Error fetching portfolios:", error);
      }
    };
    fetchPortfolios();
  }, []);

  useEffect(() => {
    let interval;
    const fetchChartData = async () => {
      setLoadingChart(true);
      try {
        const response = await fetch(`${API_BASE_URL}/graph-data/${crypto.symbol}?timeframe=${timeframe}`);
        const data = await response.json();

        const labels = data.map((d, i) => {
          const date = new Date(d.time);
          const shouldShow = i % Math.ceil(data.length / 6) === 0;
          if (!shouldShow) return "";
          if (timeframe === "1m" || timeframe === "1h") {
            return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" });
          }
          return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        });

        setChartData({
          labels,
          datasets: [{ data: data.map((point) => point.price) }],
        });

        const candleRes = await fetch(`${API_BASE_URL}/candlestick-data/${crypto.symbol}/${timeframe}`);
        const candleJson = await candleRes.json();
        const candle = candleJson.data.map((entry) => ({
          timestamp: entry.timestamp,
          open: entry.open,
          high: entry.high,
          low: entry.low,
          close: entry.close,
        }));
        setCandleData(candle);
      } catch (e) {
        console.error("Chart load error:", e);
      } finally {
        setLoadingChart(false);
      }
    };

    fetchChartData();
    if (timeframe === "1m" || timeframe === "1h") {
      interval = setInterval(fetchChartData, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [crypto.symbol, timeframe]);

  useEffect(() => {
    if (!crypto?.symbol) return;
    setPreds({});
    const intervalStr = intervalMap(predInterval);
    models.forEach((m) => {
      fetch(`${API_BASE_URL}/predict/${m}/${crypto.symbol}/${intervalStr}`)
        .then((r) => r.json())
        .then((data) =>
          setPreds((cur) => ({
            ...cur,
            [m]: typeof data.prediction === "number"
              ? data.prediction.toFixed(2)
              : Array.isArray(data.prediction)
              ? data.prediction.map((v) => v.toString()).join(",")
              : "—",
          }))
        )
        .catch(() =>
          setPreds((cur) => ({ ...cur, [m]: "—" }))
        );
    });
  }, [crypto.symbol, predInterval]);

  const handleTrade = async () => {
  if (!action || !selectedPortfolioId || quantity <= 0 || price <= 0) {
    Alert.alert("Error", "Please fill all fields and select Buy or Sell.");
    return;
  }

  const total = (Number(quantity) && Number(price))
    ? (Number(quantity) * Number(price)).toFixed(2)
    : "0.00";

  // ✅ DÜZELTİLDİ: "sell" küçük harf olmalı
  if (action === "sell") {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/${selectedPortfolioId}`);
      const portfolio = await response.json();
      const coinBalance = portfolio.transactions
        .filter((t) => t.symbol === crypto.symbol)
        .reduce((sum, t) => sum + (t.action === "buy" ? t.quantity : -t.quantity), 0);

      if (coinBalance < Number(quantity)) {
        Alert.alert("Error", `Not enough ${crypto.symbol}`);
        return;
      }
    } catch (err) {
      console.error("Balance check failed", err);
      Alert.alert("Error", "Failed to check portfolio balance.");
      return;
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/portfolio/${selectedPortfolioId}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: crypto.symbol,
        action,
        quantity,
        price,
        total,
        transactionDate,
      }),
    });

    if (response.ok) {
      Alert.alert("Success", `Successfully ${action} ${quantity} ${crypto.symbol} at $${price} each.`);
    } else {
      Alert.alert("Error", "Failed to execute the transaction.");
    }
  } catch (error) {
    console.error("Error executing trade:", error);
    Alert.alert("Error", "An error occurred while processing your request.");
  }
};

return (
  <ScrollView contentContainerStyle={styles.container}>
    <TouchableOpacity onPress={onBack} style={styles.backButton}>
      <Text style={styles.backButtonText}>Back</Text>
    </TouchableOpacity>

    <View style={styles.card}>
      <Text style={styles.cryptoTitle}>{crypto.symbol}</Text>
      <Text style={styles.cryptoPrice}>${crypto.price.toLocaleString()}</Text>
      <Text
        style={[
          styles.cryptoChange,
          crypto?.change > 0 ? styles.positiveChange : styles.negativeChange,
        ]}
      >
        ({typeof crypto?.change === "number" ? crypto.change.toFixed(2) : "0.00"}%)
      </Text>

      <View style={{ marginTop: 10, padding: 12, backgroundColor: isDark ? "#1e293b" : "#f3f4f6", borderRadius: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontWeight: "bold", fontSize: 16, color: isDark ? "#fff" : "#000" }}>Predictions</Text>
          <TouchableOpacity onPress={() => setShowHint(!showHint)}>
            <Text style={{ fontSize: 16, padding: 6, color: "#3b82f6" }}>?</Text>
          </TouchableOpacity>
        </View>

        {showHint && (
          <View style={{ marginVertical: 8 }}>
            {[
              ["TREE", "Decision Tree"],
              ["SVR", "Support Vector Regression"],
              ["RF", "Random Forest"],
              ["LR", "Linear Regression"],
              ["CNN_REG", "CNN Regressor"],
              ["LSTM", "LSTM"],
            ].map(([name, desc]) => (
              <Text key={name} style={{ fontSize: 12, color: isDark ? "#e5e7eb" : "#111827" }}>
                • <Text style={{ fontWeight: "bold" }}>{name}</Text>: {desc}
              </Text>
            ))}
          </View>
        )}

        <View style={{ marginVertical: 10 }}>
          <Text style={{ marginBottom: 4, color: isDark ? "#ccc" : "#333" }}>Prediction Interval:</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[15, 60, 240, 1440].map((mins) => (
              <TouchableOpacity
                key={mins}
                onPress={() => setPredInterval(mins)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: predInterval === mins ? "#3b82f6" : isDark ? "#374151" : "#e5e7eb",
                  borderRadius: 6,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: predInterval === mins ? "#fff" : isDark ? "#fff" : "#000" }}>
                  Next {intervalMap(mins)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {models.map((m) => (
            <View
              key={m}
              style={{
                width: "30%",
                marginBottom: 12,
                padding: 8,
                backgroundColor: isDark ? "#334155" : "#e2e8f0",
                borderRadius: 6,
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "bold", fontSize: 12, color: isDark ? "#fff" : "#000" }}>{m.toUpperCase()}</Text>
              <Text style={{ marginTop: 4, fontSize: 14, color: isDark ? "#e5e7eb" : "#111827" }}>{preds[m] ?? "…"}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>

    <View style={styles.timeframeRow}>
      {Object.entries(timeframes).map(([key, label]) => (
        <TouchableOpacity
          key={key}
          onPress={() => setTimeframe(key)}
          style={[styles.timeframeButton, timeframe === key && styles.activeTimeframe]}
        >
          <Text style={[styles.timeframeText, timeframe === key && styles.activeTimeframeText]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={() => setChartType("line")}
        style={[styles.timeframeButton, chartType === "line" && styles.activeTimeframe]}
      >
        <Text style={[styles.timeframeText, chartType === "line" && styles.activeTimeframeText]}>
          Line
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setChartType("candlestick")}
        style={[styles.timeframeButton, chartType === "candlestick" && styles.activeTimeframe]}
      >
        <Text style={[styles.timeframeText, chartType === "candlestick" && styles.activeTimeframeText]}>
          Candle
        </Text>
      </TouchableOpacity>
    </View>

    {loadingChart ? (
      <ActivityIndicator size="large" color="#3b82f6" />
    ) : chartType === "line" ? (
      <ScrollView horizontal>
        <LineChart
          data={{
            labels: chartData.labels,
            datasets: [{ data: chartData.datasets[0].data }],
          }}
          width={Dimensions.get("window").width * 1.5}
          height={260}
          chartConfig={{
            backgroundGradientFrom: isDark ? "#1e293b" : "#ffffff",
            backgroundGradientTo: isDark ? "#0f172a" : "#ffffff",
            decimalPlaces: 2,
            color: (opacity = 1) =>
              isDark ? `rgba(96, 165, 250, ${opacity})` : `rgba(0, 123, 255, ${opacity})`,
            labelColor: () => (isDark ? "#f1f5f9" : "#555"),
            propsForDots: {
              r: "4",
              strokeWidth: "2",
              stroke: "#2563EB",
            },
          }}
          bezier
          yLabelsOffset={12}
          style={{ borderRadius: 12, marginTop: 8, paddingRight: 70 }}
        />
      </ScrollView>
    ) : (
      <ScrollView horizontal>
        <View style={{ width: Dimensions.get("window").width * 2 }}>
          <CandlestickSection candleData={candleData} />
        </View>
      </ScrollView>
    )}

    <Picker
      selectedValue={selectedPortfolioId}
      onValueChange={(value) => setSelectedPortfolioId(value)}
      style={styles.picker}
    >
      <Picker.Item label="-- Select Portfolio --" value="" />
      {portfolios.map((portfolio) => (
        <Picker.Item key={portfolio._id} label={portfolio.name} value={portfolio._id} />
      ))}
    </Picker>

    <View style={styles.tradeContainer}>
      <View style={styles.buttonGroup}>
        <TouchableOpacity onPress={() => setAction("buy")} style={[styles.actionButton, action === "buy" && styles.buyAction]}>
          <Text style={styles.actionText}>Buy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAction("sell")} style={[styles.actionButton, action === "sell" && styles.sellAction]}>
          <Text style={styles.actionText}>Sell</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="Quantity"
        placeholderTextColor={isDark ? "#ccc" : "#888"}
        value={quantity}
        onChangeText={setQuantity}
      />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="Price"
        placeholderTextColor={isDark ? "#ccc" : "#888"}
        value={String(price)}
        onChangeText={setPrice}
      />

      <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.datePickerButton}>
        <Text style={styles.datePickerText}>{transactionDate.toDateString()}</Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={transactionDate}
          mode="datetime"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setTransactionDate(date);
          }}
        />
      )}

      <Text style={styles.totalText}>
        Total: ${!isNaN(quantity) && !isNaN(price) ? (Number(quantity) * Number(price)).toFixed(2) : "0.00"}
      </Text>

      <TouchableOpacity onPress={handleTrade} style={styles.tradeButton}>
        <Text style={styles.tradeButtonText}>Execute Trade</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>
);
};

const getStyles = (isDark) => StyleSheet.create({
  container: {
    padding: 15,
    backgroundColor: isDark ? "#0f172a" : "#f9f9f9",
    alignItems: "center",
  },
  backButton: {
    padding: 10,
    backgroundColor: isDark ? "#334155" : "#ddd",
    borderRadius: 8,
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: isDark ? "#f1f5f9" : "#333",
  },
  card: {
    padding: 20,
    backgroundColor: isDark ? "#1e293b" : "#ffffff",
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    elevation: 3,
    width: "100%",
  },
  timeframeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginVertical: 10,
  },
  timeframeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 4,
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
  cryptoTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: isDark ? "#e2e8f0" : "#111",
  },
  cryptoPrice: {
    fontSize: 22,
    color: "#007bff",
    marginTop: 4,
  },
  cryptoChange: {
    fontSize: 18,
    marginTop: 4,
  },
  positiveChange: {
    color: "green",
  },
  negativeChange: {
    color: "red",
  },
  picker: {
    width: "100%",
    backgroundColor: isDark ? "#1e293b" : "#e5e7eb",
    marginBottom: 12,
    borderRadius: 8,
    color: isDark ? "#f1f5f9" : "#000",
  },
  tradeContainer: {
    width: "100%",
    backgroundColor: isDark ? "#1e293b" : "#ffffff",
    padding: 16,
    borderRadius: 12,
    elevation: 2,
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: isDark ? "#334155" : "#e5e7eb",
    alignItems: "center",
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  buyAction: {
    backgroundColor: "#d1fae5",
    borderColor: "#34d399",
  },
  sellAction: {
    backgroundColor: "#fee2e2",
    borderColor: "#f87171",
  },
  actionText: {
    fontSize: 16,
    fontWeight: "bold",
    color: isDark ? "#f1f5f9" : "#1f2937",
  },
  input: {
    borderBottomWidth: 1,
    borderColor: "#ccc",
    marginBottom: 12,
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: isDark ? "#334155" : "#f9f9f9",
    color: isDark ? "#fff" : "#000",
    borderRadius: 6,
  },
  datePickerButton: {
    padding: 10,
    backgroundColor: isDark ? "#475569" : "#e2e8f0",
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  datePickerText: {
    fontSize: 15,
    color: "#1e40af",
  },
  totalText: {
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 8,
    textAlign: "center",
    color: isDark ? "#f8fafc" : "#000",
  },
  tradeButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    elevation: 3,
  },
  tradeButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "bold",
  },
});

export default TradePage;
