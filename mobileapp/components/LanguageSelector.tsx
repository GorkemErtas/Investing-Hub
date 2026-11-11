import React, { useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useTranslation } from "react-i18next";
import { localeValue } from "@investing-hub/shared/localization";
import { changeLanguage } from "../services/i18n";
import { useTheme } from "../context/ThemeContext";
export function LanguageSelector() {
  const { isDarkMode } = useTheme();
  const { t, i18n } = useTranslation("common");
  const [warning, setWarning] = useState(false);
  const color = isDarkMode ? "#f1f5f9" : "#172b3a";
  return (
    <View
      style={[
        styles.control,
        { backgroundColor: isDarkMode ? "#0f172a" : "#e8eef4" },
      ]}
    >
      <Text style={[styles.label, { color }]}>{t("language")}</Text>
      <Picker
        accessibilityLabel={t("language")}
        selectedValue={i18n.resolvedLanguage}
        style={[styles.picker, { color }]}
        dropdownIconColor={color}
        onValueChange={(value) => {
          setWarning(false);
          void changeLanguage(localeValue(value)).catch(() => setWarning(true));
        }}
      >
        <Picker.Item label="Türkçe" value="tr-TR" />
        <Picker.Item label="English" value="en-US" />
      </Picker>
      {warning && <Text accessibilityRole="alert">{t("languageSaved")}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    backgroundColor: "#e8eef4",
    minHeight: 48,
  },
  label: { color: "#172b3a", fontSize: 14 },
  picker: { width: 145, minHeight: 48, color: "#172b3a" },
});
