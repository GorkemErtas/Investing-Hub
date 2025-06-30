import React, { useState } from "react";
import VideoSection from "../components/VideoSection";
import QuizSection from "../components/QuizSection";
import InfoSection from "../components/InfoSection";
import ChartQuizSection from "../components/ChartQuizSection";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;


export default function LearningHub() {
  const [activeTab, setActiveTab] = useState("videos");

  const renderTabContent = () => {
    switch (activeTab) {
      case "videos":
        return <VideoSection />;
      case "quiz":
        return <QuizSection />;
      case "info":
        return <InfoSection />;
      case "chart":
        return <ChartQuizSection />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 dark:bg-gray-900 text-black dark:text-white min-h-screen">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-blue-700 dark:text-blue-400">
          Welcome to the Learning Hub
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2">
          Explore cryptocurrencies and blockchain through videos, quizzes, and educational articles.
        </p>
      </header>

      {/* Tab Buttons */}
      <div className="flex justify-center gap-4 mb-8 flex-wrap">
        <button
          onClick={() => setActiveTab("videos")}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            activeTab === "videos"
              ? "bg-blue-600 text-white"
              : "bg-gray-300 dark:bg-gray-700 text-black dark:text-white"
          }`}
        >
          🎥 Videos
        </button>
        <button
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            activeTab === "info"
              ? "bg-blue-600 text-white"
              : "bg-gray-300 dark:bg-gray-700 text-black dark:text-white"
          }`}
        >
          📘 Info
        </button>
        <button
          onClick={() => setActiveTab("quiz")}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            activeTab === "quiz"
              ? "bg-blue-600 text-white"
              : "bg-gray-300 dark:bg-gray-700 text-black dark:text-white"
          }`}
        >
          🧠 Quiz
        </button>
        <button
          onClick={() => setActiveTab("chart")}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            activeTab === "chart"
              ? "bg-blue-600 text-white"
              : "bg-gray-300 dark:bg-gray-700 text-black dark:text-white"
          }`}
        >
          📈 Chart Quiz
        </button>
      </div>

      {/* Tab Content */}
      <div className="w-full max-w-4xl mx-auto">
        {renderTabContent()}
      </div>
    </div>
  );
}
