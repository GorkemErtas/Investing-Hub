import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api, symbolFor } from "../services/api";
export function PredictionStatus({ base }: { base: string }) {
  const [reason, setReason] = useState("Checking publication status…");
  const [forecast, setForecast] = useState<{
    price: number;
    target: string;
  } | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const current =
    forecast && Date.parse(forecast.target) > clock ? forecast : null;
  useEffect(() => {
    setForecast(null);
    let active = true;
    void api
      .prediction(symbolFor(base))
      .then((value) => {
        if (active) {
          setReason(value.reason);
          if (
            value.status === "experimental" &&
            value.predictedValue !== null &&
            value.targetTimestamp
          )
            setForecast({
              price: value.predictedValue,
              target: value.targetTimestamp,
            });
        }
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
        {current ? "Experimental price prediction" : "No published forecast"}
      </Text>
      {current && (
        <Text style={{ color: "#172b3a" }}>
          {current.price.toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
          USDT / Target UTC date {current.target.slice(0, 10)}
        </Text>
      )}
      <Text style={{ color: "#172b3a" }}>{reason}</Text>
    </View>
  );
}
