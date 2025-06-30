import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import PortfolioCustomization from "../components/PortfolioCustomization";
import PortfolioDetails from "../components/PortfolioDetails";
import { API_BASE_URL } from "./env-config";
import { useTheme } from "../context/ThemeContext";

type Transaction = {
  symbol: string;
  action: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  date: string;
};

type Portfolio = {
  _id: string;
  name: string;
  avatar?: string;
  transactions: Transaction[];
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export default function PortfolioScreen() {
  const router = useRouter();
  const [isDetailsVisible, setDetailsVisible] = useState(false);
  const [isCustomizationVisible, setCustomizationVisible] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const { isDarkMode: isDark } = useTheme();

  useEffect(() => {
    const loadData = async () => {
      const userDataString = await AsyncStorage.getItem("user");
      const userData = userDataString ? JSON.parse(userDataString) : null;
      if (userData) {
        setUser(userData);
        const response = await fetch(`http://${API_BASE_URL}/portfolios?userId=${userData.id}`);
        const data = await response.json();
        setPortfolios(data);
      } else {
        router.replace("/auth");
      }
    };

    loadData();
  }, []);

  const reloadPortfolios = async () => {
    try {
      const response = await fetch(`http://${API_BASE_URL}/portfolios?userId=${user?.id}`);
      const data = await response.json();
      setPortfolios(data);
    } catch (error) {
      console.error("Error reloading portfolios:", error);
    }
  };

  const handleCreatePortfolio = () => {
    setSelectedPortfolio(null);
    if (user) {
      setCustomizationVisible(true);
    } else {
      router.replace("/auth");
    }
  };

  const styles = getStyles(isDark);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor={isDark ? "#0f172a" : "#f3f4f6"} />
      {!isCustomizationVisible && !isDetailsVisible ? (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.centeredContainer}>
            <Text style={styles.heading}>Crypto Portfolio Tracker</Text>
            <Text style={styles.subtitle}>
              Keep track of your profits, losses, and portfolio valuation.
            </Text>

            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreatePortfolio}
            >
              <Text style={styles.createButtonText}>Create New Portfolio</Text>
            </TouchableOpacity>

            {portfolios.length > 0 && (
              <View style={styles.portfolioList}>
                <Text style={styles.sectionTitle}>Your Portfolios</Text>
                {portfolios.map((portfolio) => (
                  <View key={portfolio._id} style={styles.portfolioCard}>
                    <View>
                      <Text style={styles.portfolioName}>{portfolio.name}</Text>
                      <Text style={styles.transactionCount}>
                        Transactions: {portfolio.transactions.length}
                      </Text>
                    </View>
                    <View style={styles.buttonGroup}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => {
                          setSelectedPortfolio(portfolio);
                          setCustomizationVisible(true);
                        }}
                      >
                        <Text style={styles.buttonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.viewButton}
                        onPress={() => {
                          setSelectedPortfolio(portfolio);
                          setDetailsVisible(true);
                        }}
                      >
                        <Text style={styles.buttonText}>View Details</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      ) : isCustomizationVisible ? (
        <PortfolioCustomization
          portfolio={selectedPortfolio}
          userId={user?.id}
          onBack={() => {
            setCustomizationVisible(false);
            reloadPortfolios();
          }}
        />
      ) : (
        <PortfolioDetails
          portfolioId={selectedPortfolio?._id}
          onBack={() => {
            setDetailsVisible(false);
            reloadPortfolios();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean) => {
  const topOffset = Platform.OS === "android" ? RNStatusBar.currentHeight || 36 : 0;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "#0f172a" : "#f3f4f6",
      paddingTop: topOffset,
    },
    scrollContainer: {
      padding: 16,
    },
    centeredContainer: {
      alignItems: "center",
      justifyContent: "center",
    },
    heading: {
      fontSize: 24,
      fontWeight: "bold",
      color: isDark ? "#e0f2fe" : "#1E40AF",
      textAlign: "center",
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? "#cbd5e1" : "#4B5563",
      textAlign: "center",
      marginBottom: 16,
    },
    createButton: {
      backgroundColor: "#2563EB",
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    createButtonText: {
      color: "white",
      fontSize: 16,
      fontWeight: "bold",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 8,
      color: isDark ? "#f8fafc" : "#374151",
    },
    portfolioList: {
      width: "100%",
      marginTop: 16,
    },
    portfolioCard: {
      backgroundColor: isDark ? "#1e293b" : "white",
      padding: 12,
      borderRadius: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    portfolioName: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? "#f1f5f9" : "#1E293B",
    },
    transactionCount: {
      fontSize: 14,
      color: isDark ? "#94a3b8" : "#6B7280",
    },
    buttonGroup: {
      flexDirection: "row",
      gap: 10,
    },
    editButton: {
      backgroundColor: "#facc15",
      padding: 8,
      borderRadius: 6,
    },
    viewButton: {
      backgroundColor: "#10b981",
      padding: 8,
      borderRadius: 6,
    },
    buttonText: {
      color: "white",
      fontWeight: "bold",
    },
  });
};
