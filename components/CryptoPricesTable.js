import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DetailsScreen from "./DetailsScreen";
import TradePage from "./TradePage";
import { API_BASE_URL } from "./env-config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/*Final update 20.06.2025*/


const CryptoPricesTable = () => {
  const [cryptoData, setCryptoData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrypto, setSelectedCrypto] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [selectedCoins, setSelectedCoins] = useState([]);
  const { user } = useAuth();
  const { isDarkMode } = useTheme();

  const conversionRates = { USD: 1, EUR: 0.87, GBP: 0.74, TRY: 39.67 };
  const currencySymbols = { USD: "$", EUR: "€", GBP: "£", TRY: "₺" };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`http://${API_BASE_URL}/crypto-data`);
      const data = await res.json();
      setCryptoData(data.data);
    } catch (err) {
      console.error("Error fetching crypto data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedCoins = async () => {
    if (user) {
      try {
        const res = await fetch(`http://${API_BASE_URL}/settings/${user.id}`);
        const data = await res.json();
        if (data.selectedCoins) {
          setSelectedCoins(data.selectedCoins);
        }
      } catch (err) {
        console.error("Error loading user settings:", err);
      }
    } else {
      const stored = await AsyncStorage.getItem("guest_selectedCoins");
      if (stored) setSelectedCoins(JSON.parse(stored));
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    loadSelectedCoins();

    const interval = setInterval(() => {
      fetchData();
    }, 15000); // Refresh every 15 seconds

    return () => clearInterval(interval); // Clean up on unmount
  }, [user, fetchData]);

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
    .filter((item) => item.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((item) => selectedCoins.length === 0 || selectedCoins.includes(item.symbol));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Crypto Prices</Text>

      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={currency}
          onValueChange={(value) => setCurrency(value)}
          style={styles.picker}
          itemStyle={styles.pickerItem}
          dropdownIconColor={isDarkMode ? "#f1f5f9" : "#333"}
        >
          <Picker.Item label="USD" value="USD" />
          <Picker.Item label="EUR" value="EUR" />
          <Picker.Item label="GBP" value="GBP" />
          <Picker.Item label="TRY" value="TRY" />
        </Picker>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by symbol"
        placeholderTextColor={isDarkMode ? "#94a3b8" : "#888"}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <View style={styles.headerRow}>
        <Text style={styles.headerCell}>Symbol</Text>
        <Text style={styles.headerCell}>Price</Text>
        <Text style={styles.headerCell}>Daily</Text>
        <Text style={styles.headerCell}>Action</Text>
      </View>

      {filteredData.map((item, index) => {
        const rate = conversionRates[currency] || 1;
        const symbol = currencySymbols[currency] || "$";
        const price = (item.price ?? 0) * rate;
        const dailyChange = item.dailyChange?.toFixed(2) || "0.00";

        return (
          <View key={index} style={styles.row}>
            <Text style={styles.cell}>{item.symbol}</Text>
            <Text style={styles.cell}>
              {symbol}
              {price.toLocaleString()}
            </Text>
            <Text
              style={[
                styles.cell,
                +dailyChange > 0 ? styles.green : styles.red,
              ]}
            >
              {dailyChange}%
            </Text>
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={() => {
                setSelectedCrypto(item);
                setViewMode("details");
              }}
            >
              <Text style={styles.detailsButtonText}>Details</Text>
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
