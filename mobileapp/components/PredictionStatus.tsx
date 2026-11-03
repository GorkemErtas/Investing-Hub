import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api, symbolFor } from "../services/api";
export function PredictionStatus({ base }: { base: string }) {
  const [reason, setReason] = useState("Checking publication status…");
  useEffect(() => {
    let active = true;
    void api
      .prediction(symbolFor(base))
      .then((value) => {
        if (active) setReason(value.reason);
      })
      .catch(() => {
        if (active)
          setReason(
            "Prediction service unavailable. No forecast is published.",
          );
      });
    return () => {
      active = false;
    };
  }, [base]);
  return (
    <View style={{ padding: 16, backgroundColor: "#dce7ef", borderRadius: 10 }}>
      <Text style={{ fontWeight: "bold", color: "#172b3a" }}>
        No published forecast · Experimental research
      </Text>
      <Text style={{ color: "#172b3a" }}>{reason}</Text>
    </View>
  );
}
