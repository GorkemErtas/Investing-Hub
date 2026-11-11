import { formatUtc, formatAmount } from "../services/format";
import { i18n } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
export default function Candles({ candleData }: { candleData: Candle[] }) {
  useTranslation();
  const [selected, setSelected] = useState<Candle | null>(null);
  if (!candleData.length)
    return <Text>{i18n.t("candles.noCandleDataAvailable")}</Text>;
  const high = Math.max(...candleData.map((c) => c.high)),
    low = Math.min(...candleData.map((c) => c.low));
  const range = high - low || high * 0.01;
  const y = (price: number) => 10 + ((high - price) / range) * 230;
  const current = selected ?? candleData.at(-1)!;
  const quote = (c: Candle) =>
    i18n.t("candles.quote", {
      date: formatUtc(c.timestamp),
      open: formatAmount(c.open),
      high: formatAmount(c.high),
      low: formatAmount(c.low),
      close: formatAmount(c.close),
    });
  return (
    <View>
      <Text style={{ color: "#6b8eab" }}>{quote(current)}</Text>
      <ScrollView
        horizontal
        accessibilityLabel={i18n.t(
          "candles.ohlcCandlestickChartScrollHorizontallyAndSelect",
        )}
      >
        <Svg width={candleData.length * 12 + 20} height={260}>
          {candleData.map((c, i) => {
            const color = c.close >= c.open ? "#16a878" : "#e25571";
            return (
              <React.Fragment key={c.timestamp}>
                <Line
                  x1={i * 12 + 10}
                  x2={i * 12 + 10}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={color}
                />
                <Rect
                  x={i * 12 + 6}
                  y={Math.min(y(c.open), y(c.close))}
                  width={8}
                  height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
                  fill={color}
                  onPress={() => setSelected(c)}
                  accessibilityLabel={quote(c)}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}
