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
  { question: "What is the native cryptocurrency of Ethereum?", options: ["Bitcoin", "Ether", "Solana", "Cardano"], correct: 1 },
  { question: "Which consensus algorithm does Bitcoin use?", options: ["Proof of Stake", "Proof of Work", "Delegated Proof of Stake", "Proof of Authority"], correct: 1 },
  { question: "Which cryptocurrency is known as 'digital gold'?", options: ["Ethereum", "Ripple", "Bitcoin", "Litecoin"], correct: 2 },
  { question: "Which blockchain platform introduced smart contracts?", options: ["Bitcoin", "Ethereum", "Polkadot", "Solana"], correct: 1 },
  { question: "What does DApp stand for?", options: ["Decentralized Application", "Digital Application", "Data Application", "Distributed Application"], correct: 0 },
  { question: "Which blockchain uses the Proof of Stake algorithm?", options: ["Bitcoin", "Ethereum", "Cardano", "Polkadot"], correct: 2 },
  { question: "Who is the founder of Ethereum?", options: ["Vitalik Buterin", "Satoshi Nakamoto", "Charles Hoskinson", "Gavin Wood"], correct: 0 },
  { question: "Which cryptocurrency was the first to implement smart contracts?", options: ["Bitcoin", "Ethereum", "Ripple", "Litecoin"], correct: 1 },
  { question: "Which platform is known for decentralized finance (DeFi)?", options: ["Ethereum", "Bitcoin", "Solana", "Polkadot"], correct: 0 },
  { question: "Which coin uses the symbol 'BTC'?", options: ["Bitcoin", "Ethereum", "Cardano", "Ripple"], correct: 0 },
  { question: "What is the maximum supply of Bitcoin?", options: ["21 million", "50 million", "100 million", "1 billion"], correct: 0 },
  { question: "What is the primary use of Ethereum?", options: ["Digital currency", "Smart contracts", "Privacy transactions", "Decentralized storage"], correct: 1 },
  { question: "Which cryptocurrency is known for being highly scalable?", options: ["Bitcoin", "Polkadot", "Ripple", "Litecoin"], correct: 1 },
  { question: "Which cryptocurrency platform uses the 'GAS' token?", options: ["Ethereum", "Polkadot", "Cardano", "Solana"], correct: 0 },
  { question: "Which blockchain platform is known for cross-chain compatibility?", options: ["Polkadot", "Bitcoin", "Ethereum", "Litecoin"], correct: 0 },
  { question: "Which cryptocurrency is considered a stablecoin?", options: ["Bitcoin", "Ethereum", "Tether", "Cardano"], correct: 2 },
  { question: "What is the largest blockchain by market capitalization?", options: ["Ethereum", "Bitcoin", "Solana", "Cardano"], correct: 1 },
  { question: "Which blockchain platform has the largest DeFi ecosystem?", options: ["Ethereum", "Bitcoin", "Polkadot", "Cardano"], correct: 0 },
  { question: "What is the purpose of a hard fork in a blockchain?", options: ["Upgrade functionality", "Increase the block size", "Make a new cryptocurrency", "Fix security issues"], correct: 2 },
  { question: "Which blockchain uses 'Proof of Work' as its consensus?", options: ["Bitcoin", "Ethereum", "Polkadot", "Cardano"], correct: 0 },
  { question: "Which cryptocurrency is considered the first 'altcoin'?", options: ["Ethereum", "Litecoin", "Bitcoin Cash", "Ripple"], correct: 1 },
  { question: "Which cryptocurrency introduced the concept of 'staking'?", options: ["Ethereum", "Bitcoin", "Cardano", "Polkadot"], correct: 2 },
];

const getRandomQuestions = () => {
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10);
};

const Quiz = () => {
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
      <Text style={styles.header}>Crypto Quiz</Text>

      <View style={styles.quizContainer}>
        {isTestFinished ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultText}>Test Completed</Text>
            <Text style={styles.scoreText}>Your Final Score: {score} / {questions.length}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.question}>{questions[currentQuestion].question}</Text>

            {questions[currentQuestion].options.map((option, index) => (
              <TouchableOpacity
                key={index}
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
                <Text style={styles.optionText}>{option}</Text>
              </TouchableOpacity>
            ))}

            {isAnswered && (
              <TouchableOpacity onPress={handleNextQuestion} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>Next Question</Text>
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
