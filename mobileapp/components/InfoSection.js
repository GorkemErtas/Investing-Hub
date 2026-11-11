import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

const infoPool = [
  {
    title: "infoSection.whatIsCryptocurrency",
    text: "infoSection.cryptocurrencyIsATypeOfDigitalOr",
  },
  {
    title: "infoSection.howDoesBlockchainWork",
    text: "infoSection.blockchainIsADistributedLedgerTechnologyThat",
  },
  {
    title: "infoSection.bitcoinTheFirstCryptocurrency",
    text: "infoSection.bitcoinWasIntroducedIn2009ByAn",
  },
  {
    title: "infoSection.ethereumAndSmartContracts",
    text: "infoSection.ethereumIsADecentralizedPlatformThatEnables",
  },
  {
    title: "infoSection.whatIsASmartContract",
    text: "infoSection.aSmartContractIsASelfExecuting",
  },
  {
    title: "infoSection.decentralizedFinanceDefi",
    text: "infoSection.defiRefersToFinancialServicesThatOperate",
  },
  {
    title: "infoSection.proofOfWorkVsProofOfStake",
    text: "infoSection.proofOfWorkPowAndProofOf",
  },
  {
    title: "infoSection.bitcoinMining",
    text: "infoSection.bitcoinMiningIsTheProcessOfVerifying",
  },
  {
    title: "infoSection.whatIsAnAltcoin",
    text: "infoSection.altcoinsAreAnyCryptocurrenciesOtherThanBitcoin",
  },
  {
    title: "infoSection.stablecoinsABridgeBetweenCryptoAndFiat",
    text: "infoSection.stablecoinsAreCryptocurrenciesDesignedToMaintainA",
  },
];

const InfoSection = () => {
  useTranslation();
  const [index, setIndex] = useState(0);
  const { isDarkMode } = useTheme();
  const styles = getStyles(isDarkMode);

  const nextParagraph = () => {
    setIndex((prev) => (prev + 1) % infoPool.length);
  };

  const prevParagraph = () => {
    setIndex((prev) => (prev - 1 + infoPool.length) % infoPool.length);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{i18n.t(infoPool[index].title)}</Text>
      <Text style={styles.text}>{i18n.t(infoPool[index].text)}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={prevParagraph} style={styles.button}>
          <Text
            style={[
              styles.buttonText,
              { color: isDarkMode ? "#fff" : "#172b3a" },
            ]}
          >
            {i18n.t("common:action.previous")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextParagraph} style={styles.buttonNext}>
          <Text style={styles.buttonText}>{i18n.t("common:action.next")}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 15,
      backgroundColor: isDark ? "#0f172a" : "#fff",
      alignItems: "center",
    },
    title: {
      fontSize: 22,
      fontWeight: "bold",
      color: isDark ? "#60a5fa" : "#1E40AF",
      textAlign: "center",
      marginBottom: 10,
    },
    text: {
      fontSize: 16,
      color: isDark ? "#f1f5f9" : "#333",
      textAlign: "center",
      marginBottom: 15,
    },
    buttonContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
      marginTop: 10,
    },
    button: {
      backgroundColor: isDark ? "#475569" : "#d1d5db",
      padding: 10,
      borderRadius: 5,
      flex: 1,
      marginHorizontal: 5,
      alignItems: "center",
    },
    buttonNext: {
      backgroundColor: "#3b82f6",
      padding: 10,
      borderRadius: 5,
      flex: 1,
      marginHorizontal: 5,
      alignItems: "center",
    },
    buttonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "bold",
    },
  });

export default InfoSection;
