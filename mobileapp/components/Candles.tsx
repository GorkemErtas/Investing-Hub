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
  const [selected, setSelected] = useState<Candle | null>(null);
  if (!candleData.length) return <Text>No candle data available.</Text>;
  const high = Math.max(...candleData.map((c) => c.high)),
    low = Math.min(...candleData.map((c) => c.low));
  const range = high - low || high * 0.01;
  const y = (price: number) => 10 + ((high - price) / range) * 230;
  const current = selected ?? candleData.at(-1)!;
  return (
    <View>
      <Text style={{ color: "#6b8eab" }}>
        {new Date(current.timestamp).toISOString()} | O {current.open} H{" "}
        {current.high} L {current.low} C {current.close} USDT
      </Text>
      <ScrollView
        horizontal
        accessibilityLabel="OHLC candlestick chart; scroll horizontally and select a candle for exact prices"
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
                  accessibilityLabel={`${new Date(c.timestamp).toISOString()} open ${c.open} high ${c.high} low ${c.low} close ${c.close}`}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}
