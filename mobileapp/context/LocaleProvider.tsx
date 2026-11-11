import React, { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { Text } from "react-native";
import { i18n, loadLanguage } from "../services/i18n";
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  useTranslation("common", { i18n });
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    let active = true;
    void loadLanguage()
      .catch(() => {
        if (active) setWarning(true);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      {warning && (
        <Text accessibilityRole="alert">{i18n.t("common:storage.read")}</Text>
      )}
      {ready ? children : null}
    </I18nextProvider>
  );
}
