import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import CodeEditor from "@rivascva/react-native-code-editor";
import { API_BASE_URL } from "../env-config";
const MobileCodeEditor = () => {
  const [code, setCode] = useState("// Write your code here...");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Code Editor</Text>
      <CodeEditor
        style={styles.editor}
        language="javascript"
        showLineNumbers
        syntaxHighlighting
        value={code}
        onChange={(text) => setCode(text)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  editor: {
    height: 250,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    fontSize: 14,
    padding: 10,
  },
});

export default MobileCodeEditor;
