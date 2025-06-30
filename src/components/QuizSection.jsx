import React, { useState, useEffect } from "react";
import axios from 'axios';

// Soru havuzu
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

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


// Rastgele 10 soru seç
const getRandomQuestions = () => {
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10);
};

export default function Quiz() {
  const [questions, setQuestions] = useState(getRandomQuestions());
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isTestFinished, setIsTestFinished] = useState(false);

  useEffect(() => {
    setQuestions(getRandomQuestions());
  }, []);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setIsAnswered(true);
    if (index === questions[currentQuestion].correct) {
      setScore(score + 1);
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
    <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 sm:p-6 rounded-lg shadow-md max-w-screen-md w-full mx-auto mt-6">
      <h1 className="text-2xl font-bold text-center mb-4">Crypto Quiz</h1>

      <div className="bg-white dark:bg-gray-900 shadow-md p-4 sm:p-6 rounded-lg">
        {isTestFinished ? (
          <div className="text-center">
            <h2 className="text-xl font-semibold">Test Completed</h2>
            <p className="mt-2">
              Your Final Score: <span className="font-bold">{score}</span> / {questions.length}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg sm:text-xl font-semibold mb-4">{questions[currentQuestion].question}</h2>

            <div className="flex flex-col space-y-2">
              {questions[currentQuestion].options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleOptionClick(index)}
                  className={`p-2 text-left border rounded-lg transition text-sm sm:text-base ${
                    isAnswered && index === questions[currentQuestion].correct
                      ? "bg-green-500 text-white"
                      : isAnswered && index === selectedOption
                      ? "bg-red-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                  disabled={isAnswered}
                >
                  {option}
                </button>
              ))}
            </div>

            {isAnswered && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleNextQuestion}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
                >
                  Next Question
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
