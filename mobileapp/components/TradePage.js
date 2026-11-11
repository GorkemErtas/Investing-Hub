import {
  formatAmount,
  formatPercent,
  formatDecimalInput,
  displayDecimalInput,
  activeLocale,
  formatPrice,
  formatUtc,
  formatChartTick,
} from "../services/format";
import { i18n, userError } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { useResource } from "../services/useResource";
import CandlestickSection from "./Candles";
import { LineChart } from "react-native-chart-kit";
import DateTimePicker from "@react-native-community/datetimepicker";
import { api, chartRows, symbolFor } from "../services/api";
import { grossNotional } from "@investing-hub/shared/portfolio";
import { tradeSchema } from "@investing-hub/shared/mobile";
import { PredictionStatus } from "./PredictionStatus";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const timeframes = {
  "15m": "common:chart.minutes",
  "1h": "common:chart.hour",
  "1d": "common:chart.day",
  "1w": "common:chart.week",
  "1M": "common:chart.month",
};

const TradePage = ({ crypto, onBack }) => {
  useTranslation();
  const [quantity, setQuantity] = useState("");
  const [fee, setFee] = useState("0");
  const { user } = useAuth();
  const [price, setPrice] = useState(crypto?.price || 0);
  const [action, setAction] = useState("");
  const [timeframe, setTimeframe] = useState("1d");
  const [transactionDate, setTransactionDate] = useState(new Date());
  const [portfolios, setPortfolios] = useState([]);
  const [portfolioOwner, setPortfolioOwner] = useState(null);
  const [portfolioError, setPortfolioError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [chartType, setChartType] = useState("line");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark);

  useEffect(() => {
    let active = true;
    setPortfolios([]);
    setSelectedPortfolioId("");
    const fetchPortfolios = async () => {
      try {
        if (!user) return;
        const data = await api.portfolios();
        if (active) {
          setPortfolios(data);
          setPortfolioOwner(user.id);
          setPortfolioError("");
        }
      } catch (error) {
        if (active) setPortfolioError(userError(error));
      }
    };
    fetchPortfolios();
    return () => {
      active = false;
    };
  }, [user?.id]);

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

  let grossTotal = i18n.t("marketMovers.unavailable");
  try {
    grossTotal = grossNotional(String(quantity), String(price));
  } catch {
    /* Incomplete form values have no valid notional. */
  }

  const handleTrade = async () => {
    if (submitting.current) return;
    if (!user) {
      Alert.alert(
        i18n.t("tradePage.loginRequired"),
        i18n.t("tradePage.logInToRecordSimulatedTransactions"),
      );
      return;
    }
    if (!selectedPortfolioId) {
      Alert.alert(
        i18n.t("tradePage.chooseAPortfolio"),
        i18n.t("tradePage.createAPortfolioInThePortfolioTab"),
      );
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const body = tradeSchema.parse({
        symbol: symbolFor(crypto.symbol),
        side: action,
        quantity: String(quantity),
        price: String(price),
        fee,
        timestamp: transactionDate.toISOString(),
      });
      await api.addTrade(selectedPortfolioId, body);
      Alert.alert(
        i18n.t("tradePage.savedTitle"),
        i18n.t("tradePage.simulatedTransactionRecordedNoExchangeOrderWas"),
      );
      setQuantity("");
    } catch (error) {
      Alert.alert(
        i18n.t("tradePage.couldNotSaveTransaction"),
        error.issues
          ? i18n.t("tradePage.usePositiveValuesWithAtMost8")
          : i18n.t(userError(error)),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
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
        <Text style={styles.cryptoTitle}>{crypto.symbol}</Text>
        <Text style={styles.cryptoPrice}>{formatPrice(crypto.price)} USDT</Text>
        <Text
          style={[
            styles.cryptoChange,
            crypto?.change > 0 ? styles.positiveChange : styles.negativeChange,
          ]}
        >
          {formatPercent(
            typeof crypto?.change === "number" ? crypto.change : 0,
          )}
        </Text>

        <PredictionStatus base={crypto.symbol} />
      </View>
      {chartError ? (
        <Text accessibilityRole="alert">{i18n.t(chartError)}</Text>
      ) : null}
      {portfolioError ? (
        <Text accessibilityRole="alert">{i18n.t(portfolioError)}</Text>
      ) : null}
      {chartMeta ? (
        <Text>
          {chartMeta.stale || chartError
            ? i18n.t("detailsScreen.staleCandles")
            : i18n.t("detailsScreen.publicOhlcv")}{" "}
          {i18n.t("cryptoPricesTable.source")}
          {formatUtc(chartMeta.sourceTime)}{" "}
          {i18n.t("cryptoPricesTable.fetched")}
          {formatUtc(chartMeta.fetchedAt)}
        </Text>
      ) : null}

      <TextInput
        accessibilityLabel={i18n.t("tradePage.feeInUsdt")}
        placeholder={i18n.t("tradePage.feeInUsdt")}
        keyboardType="decimal-pad"
        value={displayDecimalInput(fee)}
        onChangeText={(value) => setFee(formatDecimalInput(value))}
        style={{ padding: 12, backgroundColor: "#e6eef5", color: "#172b3a" }}
      />
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
            {i18n.t("tradePage.candle")}
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
            chartConfig={{
              backgroundGradientFrom: isDark ? "#1e293b" : "#ffffff",
              backgroundGradientTo: isDark ? "#0f172a" : "#ffffff",
              decimalPlaces: 2,
              color: (opacity = 1) =>
                isDark
                  ? `rgba(96, 165, 250, ${opacity})`
                  : `rgba(0, 123, 255, ${opacity})`,
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
        accessibilityLabel={i18n.t("tradePage.selectPortfolio")}
        selectedValue={selectedPortfolioId}
        onValueChange={(value) => setSelectedPortfolioId(value)}
        style={styles.picker}
      >
        <Picker.Item label={i18n.t("tradePage.selectPortfolio")} value="" />
        {(user && portfolioOwner === user.id ? portfolios : []).map(
          (portfolio) => (
            <Picker.Item
              key={portfolio._id}
              label={portfolio.name}
              value={portfolio._id}
            />
          ),
        )}
      </Picker>

      <View style={styles.tradeContainer}>
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            onPress={() => setAction("buy")}
            style={[styles.actionButton, action === "buy" && styles.buyAction]}
          >
            <Text style={styles.actionText}>{i18n.t("common:action.buy")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAction("sell")}
            style={[
              styles.actionButton,
              action === "sell" && styles.sellAction,
            ]}
          >
            <Text style={styles.actionText}>
              {i18n.t("common:action.sell")}
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={i18n.t("tradePage.quantity")}
          accessibilityLabel={i18n.t("tradePage.quantity")}
          placeholderTextColor={isDark ? "#ccc" : "#888"}
          value={displayDecimalInput(quantity)}
          onChangeText={(value) => setQuantity(formatDecimalInput(value))}
        />
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={i18n.t("cryptoPricesTable.price")}
          accessibilityLabel={i18n.t("cryptoPricesTable.price")}
          placeholderTextColor={isDark ? "#ccc" : "#888"}
          value={displayDecimalInput(price)}
          onChangeText={(value) => setPrice(formatDecimalInput(value))}
        />

        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={styles.datePickerButton}
        >
          <Text style={styles.datePickerText}>
            {new Intl.DateTimeFormat(activeLocale(), {
              dateStyle: "medium",
            }).format(transactionDate)}
          </Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            locale={activeLocale()}
            accessibilityLabel={i18n.t("tradePage.datePicker")}
            value={transactionDate}
            mode={Platform.OS === "ios" ? "datetime" : "date"}
            display="default"
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) setTransactionDate(date);
            }}
          />
        )}

        <Text style={styles.totalText}>
          {i18n.t("tradePage.grossTotalUsdt")}{" "}
          {Number.isFinite(Number(grossTotal))
            ? formatAmount(Number(grossTotal))
            : i18n.t("marketMovers.unavailable")}
        </Text>

        <TouchableOpacity
          onPress={handleTrade}
          disabled={saving}
          style={styles.tradeButton}
        >
          <Text style={styles.tradeButtonText}>
            {saving
              ? i18n.t("tradePage.saving")
              : i18n.t("tradePage.recordSimulatedTrade")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
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
