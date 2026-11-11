import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

const allQuestions = [
  {
    question: "quizSection.whatIsTheNativeCryptocurrencyOfEthereum",
    options: ["Bitcoin", "Ether", "Solana", "Cardano"],
    correct: 1,
  },
  {
    question: "quizSection.whichConsensusAlgorithmDoesBitcoinUse",
    options: [
      "quizSection.proofOfStake",
      "quizSection.proofOfWork",
      "quizSection.delegatedProofOfStake",
      "quizSection.proofOfAuthority",
    ],
    correct: 1,
  },
  {
    question: "quizSection.whichCryptocurrencyIsKnownAsDigitalGold",
    options: ["Ethereum", "Ripple", "Bitcoin", "Litecoin"],
    correct: 2,
  },
  {
    question: "quizSection.whichBlockchainPlatformIntroducedSmartContracts",
    options: ["Bitcoin", "Ethereum", "Polkadot", "Solana"],
    correct: 1,
  },
  {
    question: "quizSection.whatDoesDappStandFor",
    options: [
      "quizSection.decentralizedApplication",
      "quizSection.digitalApplication",
      "quizSection.dataApplication",
      "quizSection.distributedApplication",
    ],
    correct: 0,
  },
  {
    question: "quizSection.whichBlockchainUsesTheProofOfStake",
    options: ["Bitcoin", "Ethereum", "Cardano", "Polkadot"],
    correct: 2,
  },
  {
    question: "quizSection.whoIsTheFounderOfEthereum",
    options: [
      "quizSection.vitalikButerin",
      "quizSection.satoshiNakamoto",
      "quizSection.charlesHoskinson",
      "quizSection.gavinWood",
    ],
    correct: 0,
  },
  {
    question: "quizSection.whichCryptocurrencyWasTheFirstToImplement",
    options: ["Bitcoin", "Ethereum", "Ripple", "Litecoin"],
    correct: 1,
  },
  {
    question: "quizSection.whichPlatformIsKnownForDecentralizedFinance",
    options: ["Ethereum", "Bitcoin", "Solana", "Polkadot"],
    correct: 0,
  },
  {
    question: "quizSection.whichCoinUsesTheSymbolBtc",
    options: ["Bitcoin", "Ethereum", "Cardano", "Ripple"],
    correct: 0,
  },
  {
    question: "quizSection.whatIsTheMaximumSupplyOfBitcoin",
    options: [
      "quizSection.21Million",
      "quizSection.50Million",
      "quizSection.100Million",
      "quizSection.1Billion",
    ],
    correct: 0,
  },
  {
    question: "quizSection.whatIsThePrimaryUseOfEthereum",
    options: [
      "quizSection.digitalCurrency",
      "quizSection.smartContracts",
      "quizSection.privacyTransactions",
      "quizSection.decentralizedStorage",
    ],
    correct: 1,
  },
  {
    question: "quizSection.whichCryptocurrencyIsKnownForBeingHighly",
    options: ["Bitcoin", "Polkadot", "Ripple", "Litecoin"],
    correct: 1,
  },
  {
    question: "quizSection.whichCryptocurrencyPlatformUsesTheGasToken",
    options: ["Ethereum", "Polkadot", "Cardano", "Solana"],
    correct: 0,
  },
  {
    question: "quizSection.whichBlockchainPlatformIsKnownForCross",
    options: ["Polkadot", "Bitcoin", "Ethereum", "Litecoin"],
    correct: 0,
  },
  {
    question: "quizSection.whichCryptocurrencyIsConsideredAStablecoin",
    options: ["Bitcoin", "Ethereum", "Tether", "Cardano"],
    correct: 2,
  },
  {
    question: "quizSection.whatIsTheLargestBlockchainByMarket",
    options: ["Ethereum", "Bitcoin", "Solana", "Cardano"],
    correct: 1,
  },
  {
    question: "quizSection.whichBlockchainPlatformHasTheLargestDefi",
    options: ["Ethereum", "Bitcoin", "Polkadot", "Cardano"],
    correct: 0,
  },
  {
    question: "quizSection.whatIsThePurposeOfAHard",
    options: [
      "quizSection.upgradeFunctionality",
      "quizSection.increaseTheBlockSize",
      "quizSection.makeANewCryptocurrency",
      "quizSection.fixSecurityIssues",
    ],
    correct: 2,
  },
  {
    question: "quizSection.whichBlockchainUsesProofOfWorkAs",
    options: ["Bitcoin", "Ethereum", "Polkadot", "Cardano"],
    correct: 0,
  },
  {
    question: "quizSection.whichCryptocurrencyIsConsideredTheFirstAltcoin",
    options: ["Ethereum", "Litecoin", "quizSection.bitcoinCash", "Ripple"],
    correct: 1,
  },
  {
    question: "quizSection.whichCryptocurrencyIntroducedTheConceptOfStaking",
    options: ["Ethereum", "Bitcoin", "Cardano", "Polkadot"],
    correct: 2,
  },
];

const getRandomQuestions = () => {
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10);
};

const Quiz = () => {
  useTranslation();
  const [questions, setQuestions] = useState(getRandomQuestions());
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isTestFinished, setIsTestFinished] = useState(false);

  const { isDarkMode } = useTheme();
  const styles = getStyles(isDarkMode);

  useEffect(() => {
    setQuestions(getRandomQuestions());
  }, []);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setIsAnswered(true);
    if (index === questions[currentQuestion].correct) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion === questions.length - 1) {
      setIsTestFinished(true);
    } else {
      setSelectedOption(null);
      setIsAnswered(false);
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>{i18n.t("quizSection.cryptoQuiz")}</Text>

      <View style={styles.quizContainer}>
        {isTestFinished ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultText}>
              {i18n.t("quizSection.testCompleted")}
            </Text>
            <Text style={styles.scoreText}>
              {i18n.t("quizSection.score", { score, total: questions.length })}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.question}>
              {i18n.t(questions[currentQuestion].question)}
            </Text>

            {questions[currentQuestion].options.map((option, index) => (
              <TouchableOpacity
                key={index}
                accessibilityRole="button"
                onPress={() => handleOptionClick(index)}
                style={[
                  styles.optionButton,
                  isAnswered && index === questions[currentQuestion].correct
                    ? styles.correctOption
                    : isAnswered && index === selectedOption
                      ? styles.wrongOption
                      : styles.defaultOption,
                ]}
                disabled={isAnswered}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color:
                        isAnswered &&
                        (index === questions[currentQuestion].correct ||
                          index === selectedOption)
                          ? "#fff"
                          : isDarkMode
                            ? "#f8fafc"
                            : "#172b3a",
                    },
                  ]}
                >
                  {option.startsWith("quizSection.") ? i18n.t(option) : option}
                </Text>
              </TouchableOpacity>
            ))}

            {isAnswered && (
              <TouchableOpacity
                onPress={handleNextQuestion}
                accessibilityRole="button"
                style={styles.nextButton}
              >
                <Text style={styles.nextButtonText}>
                  {i18n.t("quizSection.nextQuestion")}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
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
      flexGrow: 1,
    },
    header: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 10,
      color: isDark ? "#f8fafc" : "#333",
    },
    quizContainer: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: isDark ? "#1e293b" : "#fff",
      padding: 20,
      borderRadius: 8,
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    resultContainer: {
      alignItems: "center",
      padding: 20,
    },
    resultText: {
      fontSize: 20,
      fontWeight: "bold",
      color: isDark ? "#f8fafc" : "#333",
    },
    scoreText: {
      fontSize: 18,
      marginTop: 10,
      color: "#3b82f6",
    },
    question: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 10,
      color: isDark ? "#f1f5f9" : "#222",
    },
    optionButton: {
      padding: 10,
      borderRadius: 5,
      marginVertical: 5,
      alignItems: "center",
    },
    correctOption: {
      backgroundColor: "#22c55e",
    },
    wrongOption: {
      backgroundColor: "#ef4444",
    },
    defaultOption: {
      backgroundColor: isDark ? "#334155" : "#ddd",
    },
    optionText: {
      fontSize: 16,
      color: "#fff",
    },
    nextButton: {
      backgroundColor: "#3b82f6",
      padding: 12,
      borderRadius: 5,
      alignItems: "center",
      marginTop: 10,
    },
    nextButtonText: {
      color: "white",
      fontSize: 16,
      fontWeight: "bold",
    },
  });

export default Quiz;
