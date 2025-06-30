import React, { useState } from "react";
import { Controlled as ControlledEditor } from "@uiw/react-codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material.css";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const CodeEditor = () => {
  const [code, setCode] = useState("// Write your code here...");

  const handleCodeChange = (value) => {
    setCode(value);
  };

  return (
    <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 sm:p-6 rounded shadow-lg max-w-screen-lg w-full mx-auto mt-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 text-center sm:text-left">
        Code Editor
      </h2>
      <div className="overflow-x-auto rounded">
        <ControlledEditor
          value={code}
          options={{
            mode: "javascript",
            theme: "material",
            lineNumbers: true,
          }}
          onChange={(editor, data, value) => handleCodeChange(value)}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
