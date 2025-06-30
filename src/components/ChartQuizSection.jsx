import React, { useState } from "react";
import { Line } from "react-chartjs-2";
import { Chart, LineElement, PointElement, LinearScale, Title, Tooltip } from "chart.js";
import bearish from "../assets/images/Bearish-Engulfing.png";
import hammer from "../assets/images/Hammer-Candle.png";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;

Chart.register(LineElement, PointElement, LinearScale, Title, Tooltip);

const ChartQuizSection = () => {
  const [showVisualQuiz, setShowVisualQuiz] = useState(false);
  const [selectedVisualIndex, setSelectedVisualIndex] = useState(0);
  const [selectedVisualOption, setSelectedVisualOption] = useState(null);
  const [isVisualAnswered, setIsVisualAnswered] = useState(false);
  const [selectedGraphIndex, setSelectedGraphIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);

  const visualQuestions = [
    {
      image: bearish,
      question: "The following candle pattern is called a _______________.",
      options: ["Evening Star", "Shooting Star", "Bearish Engulfing", "Inside Candle"],
      correct: 2,
      explanation:
        "A Bearish Engulfing pattern is a strong sign that a price trend might be about to drop after rising for a while...",
    },
    {
      image: hammer,
      question: "The following candle pattern is called a _______________.",
      options: ["Doji Candle", "Hammer Candle", "Bearish Engulfing", "Bullish Candle"],
      correct: 1,
      explanation:
        "A hammer candle has a small body and a long lower shadow. It's considered bullish after a downtrend as it signals potential reversal.",
    },
  ];

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

  const handleVisualOption = (index) => {
    setSelectedVisualOption(index);
    setIsVisualAnswered(true);
  };

  const goToNextVisual = () => {
    setSelectedVisualIndex((prev) => Math.min(prev + 1, visualQuestions.length - 1));
    setSelectedVisualOption(null);
    setIsVisualAnswered(false);
  };

  const goToPrevVisual = () => {
    setSelectedVisualIndex((prev) => Math.max(prev - 1, 0));
    setSelectedVisualOption(null);
    setIsVisualAnswered(false);
  };

  const handleOptionClick = (index) => {
    setSelectedOption(index);
    setIsAnswered(true);
  };

  const goToNextQuestion = () => {
    setCurrentQuestionIndex((prevIndex) => Math.min(prevIndex + 1, questions[selectedGraphIndex].length - 1));
    setSelectedOption(null);
    setIsAnswered(false);
  };

  const goToPreviousQuestion = () => {
    setCurrentQuestionIndex((prevIndex) => Math.max(prevIndex - 1, 0));
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
    <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 sm:p-6 rounded-lg shadow-md mt-4 sm:mt-8 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400 text-center mb-4">
        {showVisualQuiz ? "Candlestick Pattern Recognition" : "Interactive Coin Price Charts"}
      </h2>

      <div className="flex flex-wrap justify-center gap-4 mb-6">
        <button
          onClick={() => setShowVisualQuiz(false)}
          className={`px-4 py-2 rounded-lg ${!showVisualQuiz ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700"}`}
        >
          Line Chart Quiz
        </button>
        <button
          onClick={() => setShowVisualQuiz(true)}
          className={`px-4 py-2 rounded-lg ${showVisualQuiz ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700"}`}
        >
          Candlestick Image Quiz
        </button>
      </div>

      {showVisualQuiz ? (
        <div>
          <div className="flex justify-center mb-4">
            <img src={visualQuestions[selectedVisualIndex].image} alt="candlestick" className="rounded-lg max-h-96 max-w-full" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold mb-4">{visualQuestions[selectedVisualIndex].question}</h3>
          {visualQuestions[selectedVisualIndex].options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleVisualOption(i)}
              className={`block w-full text-left px-4 py-2 rounded-lg mb-2 border transition text-base ${
                isVisualAnswered && i === visualQuestions[selectedVisualIndex].correct
                  ? "bg-green-500 text-white"
                  : isVisualAnswered && i === selectedVisualOption
                  ? "bg-red-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
              disabled={isVisualAnswered}
            >
              {opt}
            </button>
          ))}
          {isVisualAnswered && (
            <div className={`mt-4 p-4 rounded-lg shadow ${
              selectedVisualOption === visualQuestions[selectedVisualIndex].correct
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}>
              <strong>
                {selectedVisualOption === visualQuestions[selectedVisualIndex].correct
                  ? "✅ Correct! Keep going"
                  : "❌ Incorrect! Good try"}
              </strong>
              <p className="mt-2 text-sm font-medium text-black dark:text-black">
                {visualQuestions[selectedVisualIndex].explanation}
              </p>
            </div>
          )}
          <div className="flex justify-between mt-6">
            <button
              onClick={goToPrevVisual}
              disabled={selectedVisualIndex === 0}
              className={`px-4 py-2 rounded-lg ${
                selectedVisualIndex === 0
                  ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Previous
            </button>
            <button
              onClick={goToNextVisual}
              disabled={selectedVisualIndex === visualQuestions.length - 1}
              className={`px-4 py-2 rounded-lg ${
                selectedVisualIndex === visualQuestions.length - 1
                  ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap justify-center gap-4 mb-6">
            {graphs.map((graph, index) => (
              <button
                key={index}
                onClick={() => switchGraph(index)}
                className={`px-4 py-2 rounded-lg ${
                  selectedGraphIndex === index
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {graph.title}
              </button>
            ))}
          </div>

          <div className="w-full md:w-4/5 lg:w-2/3 mx-auto">
            <Line
              data={{
                labels: currentGraph.labels,
                datasets: [
                  {
                    label: "Coin Price ($)",
                    data: currentGraph.data,
                    borderColor: "#4caf50",
                    backgroundColor: "rgba(76, 175, 80, 0.2)",
                    pointRadius: 5,
                    pointHoverRadius: 8,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
              }}
            />
          </div>

          <div className="mt-8">
            <h3 className="text-lg sm:text-xl font-bold mb-4">
              {questions[selectedGraphIndex][currentQuestionIndex].question}
            </h3>
            {questions[selectedGraphIndex][currentQuestionIndex].options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleOptionClick(i)}
                className={`block w-full text-left px-4 py-2 rounded-lg mb-2 border transition text-base ${
                  isAnswered && i === questions[selectedGraphIndex][currentQuestionIndex].correct
                    ? "bg-green-500 text-white"
                    : isAnswered && i === selectedOption
                    ? "bg-red-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
                disabled={isAnswered}
              >
                {option}
              </button>
            ))}
            <div className="flex justify-between mt-4">
              <button
                onClick={goToPreviousQuestion}
                disabled={currentQuestionIndex === 0}
                className={`px-4 py-2 rounded-lg ${
                  currentQuestionIndex === 0
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                Previous
              </button>
              <button
                onClick={goToNextQuestion}
                disabled={currentQuestionIndex === questions[selectedGraphIndex].length - 1}
                className={`px-4 py-2 rounded-lg ${
                  currentQuestionIndex === questions[selectedGraphIndex].length - 1
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartQuizSection;