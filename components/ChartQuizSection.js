import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/*Final update 20.06.2025*/


const screenWidth = Dimensions.get("window").width;

const ChartQuizSection = () => {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();

  const [selectedGraphIndex, setSelectedGraphIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);

  const styles = getStyles(isDarkMode);

  const graphs = [
    {
      title: "Bitcoin Price Chart",
      labels: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Day 8", "Day 9", "Day 10"],
      data: [12000, 12500, 11500, 14000, 13500, 15000, 13000, 15500, 14500, 16000],
    },
    {
      title: "Ethereum Price Chart",
      labels: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Day 8", "Day 9", "Day 10"],
      data: [2000, 2100, 1900, 2200, 2150, 2250, 2100, 2300, 2200, 2400],
    },
  ];

  const currentGraph = graphs[selectedGraphIndex];
  const maxPrice = Math.max(...currentGraph.data);
  const minPrice = Math.min(...currentGraph.data);
  const maxPriceIndex = currentGraph.data.indexOf(maxPrice);
  const minPriceIndex = currentGraph.data.indexOf(minPrice);

  const questions = [
    [
      {
        question: "What is the highest price recorded in Bitcoin chart?",
        options: [
          `Day 1: $${currentGraph.data[0]}`,
          `Day 5: $${currentGraph.data[4]}`,
          `Day ${maxPriceIndex + 1}: $${maxPrice}`,
          `Day 8: $${currentGraph.data[7]}`,
        ],
        correct: 2,
      },
      {
        question: "What is the lowest price recorded in Bitcoin chart?",
        options: [
          `Day ${minPriceIndex + 1}: $${minPrice}`,
          `Day 6: $${currentGraph.data[5]}`,
          `Day 3: $${currentGraph.data[2]}`,
          `Day 9: $${currentGraph.data[8]}`,
        ],
        correct: 0,
      },
      {
        question: "Which day had the largest price increase in Bitcoin chart?",
        options: ["Day 4", "Day 7", "Day 2", "Day 8"],
        correct: 0,
      },
      {
        question: "What is the overall trend of Bitcoin chart?",
        options: ["Uptrend", "Downtrend", "Flat", "Volatile"],
        correct: 0,
      },
    ],
    [
      {
        question: "What is the highest price recorded in Ethereum chart?",
        options: [
          `Day 1: $${currentGraph.data[0]}`,
          `Day 5: $${currentGraph.data[4]}`,
          `Day ${maxPriceIndex + 1}: $${maxPrice}`,
          `Day 8: $${currentGraph.data[7]}`,
        ],
        correct: 2,
      },
      {
        question: "What is the lowest price recorded in Ethereum chart?",
        options: [
          `Day ${minPriceIndex + 1}: $${minPrice}`,
          `Day 6: $${currentGraph.data[5]}`,
          `Day 3: $${currentGraph.data[2]}`,
          `Day 9: $${currentGraph.data[8]}`,
        ],
        correct: 0,
      },
      {
        question: "Which day had the largest price increase in Ethereum chart?",
        options: ["Day 4", "Day 7", "Day 2", "Day 8"],
        correct: 0,
      },
      {
        question: "What is the overall trend of Ethereum chart?",
        options: ["Uptrend", "Downtrend", "Flat", "Volatile"],
        correct: 0,
      },
    ],
  ];

  const handleOptionClick = (index) => {
    setSelectedOption(index);
    setIsAnswered(true);
  };

  const goToNextQuestion = () => {
    setCurrentQuestionIndex((prev) => Math.min(prev + 1, questions[selectedGraphIndex].length - 1));
    setSelectedOption(null);
    setIsAnswered(false);
  };

  const goToPreviousQuestion = () => {
    setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0));
    setSelectedOption(null);
    setIsAnswered(false);
  };

  const switchGraph = (index) => {
    setSelectedGraphIndex(index);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Interactive Coin Price Charts</Text>

      <View style={styles.graphSelection}>
        {graphs.map((graph, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => switchGraph(index)}
            style={[styles.graphButton, selectedGraphIndex === index && styles.selectedGraphButton]}
          >
            <Text style={styles.graphButtonText}>{graph.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chartContainer}>
        <LineChart
          data={{
            labels: currentGraph.labels,
            datasets: [{ data: currentGraph.data }],
          }}
          width={screenWidth - 40}
          height={250}
          chartConfig={{
            backgroundGradientFrom: isDarkMode ? "#1e293b" : "#f3f3f3",
            backgroundGradientTo: isDarkMode ? "#0f172a" : "#fff",
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
            labelColor: () => (isDarkMode ? "#e2e8f0" : "#000"),
            style: { borderRadius: 16 },
          }}
          bezier
        />
      </View>

      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>
          {questions[selectedGraphIndex][currentQuestionIndex].question}
        </Text>

        {questions[selectedGraphIndex][currentQuestionIndex].options.map((option, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => handleOptionClick(index)}
            style={[
              styles.optionButton,
              isAnswered && index === questions[selectedGraphIndex][currentQuestionIndex].correct
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

        <View style={styles.navigationButtons}>
          <TouchableOpacity
            onPress={goToPreviousQuestion}
            disabled={currentQuestionIndex === 0}
            style={[
              styles.navButton,
              currentQuestionIndex === 0 && styles.disabledNavButton,
            ]}
          >
            <Text style={styles.navButtonText}>Previous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goToNextQuestion}
            disabled={currentQuestionIndex === questions[selectedGraphIndex].length - 1}
            style={[
              styles.navButton,
              currentQuestionIndex === questions[selectedGraphIndex].length - 1 && styles.disabledNavButton,
            ]}
          >
            <Text style={styles.navButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const getStyles = (isDark) =>
  StyleSheet.create({
    container: {
      padding: 20,
      backgroundColor: isDark ? "#0f172a" : "#fff",
    },
    title: {
      fontSize: 22,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 10,
      color: isDark ? "#f1f5f9" : "#111827",
    },
    graphSelection: {
      flexDirection: "row",
      justifyContent: "center",
      flexWrap: "wrap",
      marginBottom: 15,
    },
    graphButton: {
      padding: 10,
      margin: 5,
      backgroundColor: isDark ? "#475569" : "#ccc",
      borderRadius: 8,
    },
    selectedGraphButton: {
      backgroundColor: "#4caf50",
    },
    graphButtonText: {
      color: "#fff",
      fontSize: 16,
    },
    chartContainer: {
      alignItems: "center",
      marginBottom: 20,
    },
    questionContainer: {
      padding: 15,
      backgroundColor: isDark ? "#1e293b" : "#f9f9f9",
      borderRadius: 10,
    },
    questionText: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 10,
      color: isDark ? "#f8fafc" : "#111",
    },
    optionButton: {
      padding: 10,
      borderRadius: 8,
      marginBottom: 8,
    },
    correctOption: {
      backgroundColor: "#4caf50",
    },
    wrongOption: {
      backgroundColor: "#e53935",
    },
    defaultOption: {
      backgroundColor: isDark ? "#334155" : "#ddd",
    },
    optionText: {
      fontSize: 16,
      color: "#fff",
    },
    navigationButtons: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 15,
    },
    navButton: {
      padding: 10,
      backgroundColor: "#2196f3",
      borderRadius: 8,
    },
    disabledNavButton: {
      backgroundColor: "#aaa",
    },
    navButtonText: {
      color: "#fff",
      fontSize: 16,
    },
  });

export default ChartQuizSection;