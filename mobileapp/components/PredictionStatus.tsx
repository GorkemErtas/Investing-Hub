import { formatAmount, formatDay } from "../services/format";
import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api, symbolFor } from "../services/api";
export function PredictionStatus({ base }: { base: string }) {
  useTranslation();
  const [reason, setReason] = useState(
    "predictionStatus.checkingPublicationStatus",
  );
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
          setReason(
            value.status === "experimental"
              ? "common:prediction.note"
              : "predictionStatus.expired",
          );
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
            "predictionStatus.predictionServiceUnavailableNoForecastIsPublished",
          );
      });
    return () => {
      active = false;
    };
  }, [base]);
  return (
    <View style={{ padding: 16, backgroundColor: "#dce7ef", borderRadius: 10 }}>
      <Text style={{ fontWeight: "bold", color: "#172b3a" }}>
        {current
          ? i18n.t("predictionStatus.experimentalPricePrediction")
          : i18n.t("predictionStatus.noPublishedForecast")}
      </Text>
      {current && (
        <Text style={{ color: "#172b3a" }}>
          {formatAmount(current.price)} USDT /{" "}
          {i18n.t("common:prediction.targetDate")} {formatDay(current.target)}
        </Text>
      )}
      <Text style={{ color: "#172b3a" }}>{i18n.t(reason)}</Text>
    </View>
  );
}
