import {
  formatAmount,
  formatPercent,
  formatDay,
  formatChartTick,
} from "../services/format";
import { i18n, userError } from "../services/i18n";
import { useTranslation } from "react-i18next";
// ...diğer importlar...
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Dimensions,
} from "react-native";
import { LineChart, PieChart } from "react-native-chart-kit";
import { api } from "../services/api";
import { account, grossNotional } from "@investing-hub/shared/portfolio";
import { assets } from "@investing-hub/shared/contracts";
import { useTheme } from "../context/ThemeContext";

const PortfolioDetails = ({ portfolioId, onBack }) => {
  useTranslation();
  const [portfolio, setPortfolio] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [stale, setStale] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [holdings, setHoldings] = useState([]);
  const [totalInvestedData, setTotalInvestedData] = useState([]);

  const { isDarkMode } = useTheme();
  const styles = getStyles(isDarkMode);

  useEffect(() => {
    const fetchPortfolioDetails = async () => {
      try {
        const data = await api.portfolio(portfolioId);
        let prices = {};
        try {
          const quotes = await api.markets();
          prices = Object.fromEntries(
            quotes.data.map((q) => [q.symbol, q.price]),
          );
          setStale(quotes.meta.stale);
        } catch {
          setStale(true);
        }
        const result = account(data.transactions, prices);
        setLedger(result);
        setPortfolio({
          ...data,
          transactions: result.ordered.map((t) => ({
            ...t,
            _id: t.id,
            action: t.side,
            date: t.timestamp,
          })),
        });
        setHoldings(
          result.holdings.map((h) => ({
            ...h,
            totalCost: h.costBasis,
            currentValue: h.marketValue,
            profitLoss: h.unrealized,
          })),
        );
        setTotalInvestedData(
          result.ordered.slice(-100).map((t, i, rows) => ({
            date: t.timestamp.slice(0, 10),
            totalInvested: account(
              result.ordered.slice(
                0,
                result.ordered.length - rows.length + i + 1,
              ),
            ).costBasis,
          })),
        );
      } catch (err) {
        setError(userError(err));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPortfolioDetails();
  }, [portfolioId]);

  const totalValue = ledger?.marketValue;
  const totalInvested = ledger?.costBasis ?? 0;
  const totalProfitLoss = ledger?.unrealized;
  const profitPercent =
    totalProfitLoss != null && totalInvested > 0
      ? formatPercent((totalProfitLoss / totalInvested) * 100)
      : i18n.t("marketMovers.unavailable");
  const format = (value) =>
    value == null ? i18n.t("marketMovers.unavailable") : formatAmount(value);
  const distribution = holdings.filter(
    (h) => h.currentValue != null && h.currentValue > 0,
  );
  const distributionTotal = distribution.reduce(
    (sum, h) => sum + h.currentValue,
    0,
  );

  if (isLoading) return <ActivityIndicator size="large" color="#2563eb" />;
  if (error)
    return (
      <Text style={styles.errorText}>
        {i18n.t("fibonacciGraph.error")}
        {i18n.t(error)}
      </Text>
    );

  return (
    <FlatList
      data={portfolio.transactions}
      keyExtractor={(item) => item._id}
      ListHeaderComponent={
        <>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>
              {i18n.t("detailsScreen.back")}
            </Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.title}>
              {i18n.t("portfolioDetails.portfolioOverviewUsdt")}
            </Text>
            {stale ? (
              <Text>
                {i18n.t(
                  "portfolioDetails.quotesAreStaleOrUnavailableMissingValuations",
                )}
              </Text>
            ) : null}
            <Text>
              {i18n.t("portfolioDetails.realizedPL")} {format(ledger.realized)}{" "}
              USDT
            </Text>
            <View style={styles.row}>
              <View style={styles.statBox}>
                <Text style={styles.label}>
                  {i18n.t("portfolioDetails.value")}
                </Text>
                <Text style={styles.value}>{format(totalValue)} USDT</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.label}>
                  {i18n.t("portfolioDetails.remainingCostBasis")}
                </Text>
                <Text style={styles.value}>{format(totalInvested)} USDT</Text>
              </View>
              <View style={styles.statBox}>
                <Text
                  style={[
                    styles.value,
                    { color: totalProfitLoss >= 0 ? "green" : "red" },
                  ]}
                >
                  {format(totalProfitLoss)} USDT
                </Text>
                <Text style={styles.label}>
                  {i18n.t("portfolioDetails.unrealizedPL")}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text
                  style={[
                    styles.value,
                    { color: totalProfitLoss >= 0 ? "green" : "red" },
                  ]}
                >
                  {profitPercent}
                </Text>
                <Text style={styles.label}>
                  {i18n.t("portfolioDetails.pL")}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>
              {i18n.t("portfolioDetails.remainingCostBasisOverTime")}
            </Text>
            <LineChart
              formatYLabel={(value) => formatAmount(Number(value))}
              data={{
                labels: totalInvestedData.map((d, i, rows) =>
                  i % Math.ceil(rows.length / 3) === 0
                    ? formatChartTick(d.date)
                    : "",
                ),
                datasets: [
                  {
                    data: totalInvestedData.length
                      ? totalInvestedData.map((d) => d.totalInvested)
                      : [0],
                  },
                ],
              }}
              width={Dimensions.get("window").width - 32}
              height={220}
              chartConfig={{
                backgroundGradientFrom: isDarkMode ? "#1e293b" : "#fff",
                backgroundGradientTo: isDarkMode ? "#0f172a" : "#fff",
                decimalPlaces: 2,
                color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                labelColor: () => (isDarkMode ? "#e5e7eb" : "#374151"),
              }}
              style={{ borderRadius: 8 }}
            />
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>
              {i18n.t("portfolioDetails.holdingsDistribution")}
            </Text>
            <PieChart
              hasLegend={false}
              data={holdings
                .filter((h) => h.currentValue != null && h.currentValue > 0)
                .map((h) => ({
                  name: h.symbol,
                  amount: h.currentValue,
                  color:
                    assets.find((a) => a.symbol === h.symbol)?.color ??
                    "#64748b",
                  legendFontColor: isDarkMode ? "#f1f5f9" : "#000",
                  legendFontSize: 12,
                }))}
              width={Dimensions.get("window").width - 32}
              height={220}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              chartConfig={{
                backgroundGradientFrom: "#fff",
                backgroundGradientTo: "#fff",
                color: () => "#000",
              }}
            />
            {distribution.map((h) => (
              <Text
                key={h.symbol}
                style={{ color: isDarkMode ? "#f1f5f9" : "#172b3a" }}
              >
                {h.symbol} ·{" "}
                {formatPercent((h.currentValue / distributionTotal) * 100)}
              </Text>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {i18n.t("portfolioDetails.transactionHistory")}
            </Text>
            <View style={styles.tableHeader}>
              <Text style={styles.tableCol}>
                {i18n.t("portfolioDetails.date")}
              </Text>
              <Text style={styles.tableCol}>
                {i18n.t("cryptoPricesTable.action")}
              </Text>
              <Text style={styles.tableCol}>
                {i18n.t("cryptoPricesTable.symbol")}
              </Text>
              <Text style={styles.tableCol}>
                {i18n.t("portfolioDetails.qty")}
              </Text>
              <Text style={styles.tableCol}>
                {i18n.t("cryptoPricesTable.price")}
              </Text>
              <Text style={styles.tableCol}>
                {i18n.t("portfolioDetails.total")}
              </Text>
            </View>
          </View>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.transactionRow}>
          <Text style={styles.tableCol}>{formatDay(item.date)}</Text>
          <Text
            style={[
              styles.tableCol,
              { color: item.action === "buy" ? "green" : "red" },
            ]}
          >
            {i18n.t("common:action." + item.action)}
          </Text>
          <Text style={styles.tableCol}>{item.symbol}</Text>
          <Text style={styles.tableCol}>
            {formatAmount(Number(item.quantity))}
          </Text>
          <Text style={styles.tableCol}>
            {formatAmount(Number(item.price))} USDT
          </Text>
          <Text style={styles.tableCol}>
            {formatAmount(Number(grossNotional(item.quantity, item.price)))}{" "}
            USDT
          </Text>
        </View>
      )}
    />
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    backButton: { padding: 10, marginBottom: 10 },
    backButtonText: { color: "#2563eb", fontSize: 16 },
    card: {
      backgroundColor: isDark ? "#1e293b" : "#fff",
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
      marginHorizontal: 16,
      elevation: 3,
    },
    title: {
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 12,
      color: isDark ? "#f8fafc" : "#000",
    },
    chartCard: {
      backgroundColor: isDark ? "#1e293b" : "#fff",
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
      marginHorizontal: 16,
      alignItems: "center",
      elevation: 3,
    },
    chartTitle: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 10,
      color: isDark ? "#e5e7eb" : "#000",
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 8,
      color: isDark ? "#f1f5f9" : "#000",
    },
    label: {
      fontSize: 14,
      color: isDark ? "#cbd5e1" : "#4b5563",
      marginBottom: 4,
    },
    value: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? "#f1f5f9" : "#0f172a",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 10,
    },
    statBox: { alignItems: "center", flex: 1, paddingHorizontal: 4 },
    avatar: { width: 64, height: 64, borderRadius: 32, marginVertical: 8 },
    tableHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderColor: isDark ? "#334155" : "#e5e7eb",
    },
    transactionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderColor: isDark ? "#334155" : "#e5e7eb",
    },
    tableCol: {
      flex: 1,
      fontSize: 12,
      textAlign: "center",
      color: isDark ? "#e2e8f0" : "#000",
    },
    errorText: {
      color: "red",
      fontSize: 16,
      textAlign: "center",
      marginTop: 20,
    },
  });

export default PortfolioDetails;
