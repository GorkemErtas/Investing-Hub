import React from "react";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const videos = [
  {
    id: 1,
    title: "What is Cryptocurrency?",
    url: "https://www.youtube.com/embed/SSo_EIwHSd4",
  },
  {
    id: 2,
    title: "How Blockchain Works",
    url: "https://www.youtube.com/embed/3xGLc-zz9cA",
  },
  {
    id: 3,
    title: "Understanding Smart Contracts",
    url: "https://www.youtube.com/embed/ZE2HxTmxfrI",
  },
  {
    id: 4,
    title: "A Complete Guide To Candlestick Charts In Under 12 Minutes",
    url: "https://www.youtube.com/embed/UB7Om3JQcGg",
  },
  {
    id: 5,
    title: "How to Read Crypto Charts (Repeatable Chart Analysis Guide)",
    url: "https://www.youtube.com/embed/TuWZzPBunvc",
  },
];

const VideoSection = () => {
  return (
    <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 sm:p-6 rounded-lg shadow-md max-w-screen-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-blue-600 dark:text-blue-400 text-center">Educational Videos</h2>
      <div className="space-y-8">
        {videos.map((video) => (
          <div key={video.id}>
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">{video.title}</h3>
            <div className="relative w-full pb-[56.25%] h-0 overflow-hidden rounded-lg shadow">
              <iframe
                src={video.url}
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full"
              ></iframe>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoSection;
