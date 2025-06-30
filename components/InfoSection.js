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
    title: "What is Cryptocurrency?",
    text: "Cryptocurrency is a type of digital or virtual currency that uses cryptography for security. Unlike traditional currencies issued by governments, cryptocurrencies operate on decentralized networks based on blockchain technology.",
  },
  {
    title: "How Does Blockchain Work?",
    text: "Blockchain is a distributed ledger technology that records transactions across multiple computers. It ensures data integrity by making it nearly impossible to alter transaction history without altering all subsequent blocks.",
  },
  {
    title: "Bitcoin: The First Cryptocurrency",
    text: "Bitcoin was introduced in 2009 by an anonymous person or group under the pseudonym Satoshi Nakamoto. It is the first decentralized digital currency, operating without a central authority.",
  },
  {
    title: "Ethereum and Smart Contracts",
    text: "Ethereum is a decentralized platform that enables smart contracts—self-executing contracts with the terms of the agreement directly written into code. It was proposed by Vitalik Buterin in 2013 and launched in 2015.",
  },
  {
    title: "What is a Smart Contract?",
    text: "A smart contract is a self-executing contract with terms written directly into code. It automatically enforces agreements without the need for intermediaries.",
  },
  {
    title: "Decentralized Finance (DeFi)",
    text: "DeFi refers to financial services that operate on blockchain technology, eliminating the need for traditional banks. It includes lending, borrowing, and trading platforms that run without central authorities.",
  },
  {
    title: "Proof of Work vs. Proof of Stake",
    text: "Proof of Work (PoW) and Proof of Stake (PoS) are two consensus mechanisms used by blockchains. PoW relies on miners solving complex problems, whereas PoS selects validators based on the number of coins they hold.",
  },
  {
    title: "Bitcoin Mining",
    text: "Bitcoin mining is the process of verifying transactions and adding them to the blockchain. Miners solve cryptographic puzzles to earn newly created bitcoins as rewards.",
  },
  {
    title: "What is an Altcoin?",
    text: "Altcoins are any cryptocurrencies other than Bitcoin. Examples include Ethereum, Cardano, and Solana. They often introduce new features or improvements over Bitcoin.",
  },
  {
    title: "Stablecoins: A Bridge Between Crypto and Fiat",
    text: "Stablecoins are cryptocurrencies designed to maintain a stable value by being pegged to assets like the US dollar or gold. Examples include Tether (USDT) and USD Coin (USDC).",
  },
];

const InfoSection = () => {
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
      <Text style={styles.title}>{infoPool[index].title}</Text>
      <Text style={styles.text}>{infoPool[index].text}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={prevParagraph} style={styles.button}>
          <Text style={styles.buttonText}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextParagraph} style={styles.buttonNext}>
          <Text style={styles.buttonText}>Next</Text>
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
