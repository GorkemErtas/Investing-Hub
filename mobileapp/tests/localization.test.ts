import { beforeEach, expect, it, vi } from "vitest";
import { languageStorageKey } from "@investing-hub/shared/localization";
import { formatChartTick } from "../services/format";
const { values, getItem, setItem } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem, setItem },
}));
import {
  i18n,
  loadLanguage,
  changeLanguage,
  userError,
} from "../services/i18n";
beforeEach(async () => {
  values.clear();
  vi.clearAllMocks();
  await i18n.changeLanguage("tr-TR");
});
it("uses Turkish for existing guests without a preference and persists English independently", async () => {
  values.set("theme", "dark");
  values.set("guest_selectedCoins", '["BTC"]');
  await loadLanguage();
  expect(formatChartTick("2026-11-11T00:15:00.000Z", true)).toBe("00:15 UTC");
  expect(i18n.t("common:nav.portfolio")).toBe("Portföy");
  await changeLanguage("en-US");
  expect(i18n.t("common:nav.portfolio")).toBe("Portfolio");
  expect(values.get(languageStorageKey)).toBe("en-US");
  expect(values.get("theme")).toBe("dark");
  expect(values.get("guest_selectedCoins")).toBe('["BTC"]');
  await i18n.changeLanguage("tr-TR");
  await loadLanguage();
  expect(i18n.language).toBe("en-US");
  expect(setItem).toHaveBeenCalledTimes(1);
});
it("preserves invalid stored data and reports persistence failure while keeping the selected session language", async () => {
  values.set(languageStorageKey, "bad-locale");
  await expect(loadLanguage()).rejects.toThrow();
  expect(i18n.language).toBe("tr-TR");
  expect(values.get(languageStorageKey)).toBe("bad-locale");
  setItem.mockRejectedValueOnce(new Error("storage denied"));
  await expect(changeLanguage("en-US")).rejects.toThrow();
  expect(i18n.language).toBe("en-US");
});
it("uses a deterministic fallback and updates errors with the active locale", async () => {
  expect(i18n.t("unknown.key")).toBe(i18n.t("common:errors.SERVICE_ERROR"));
  const key = userError({
    code: "INVALID_CREDENTIALS",
    message: "private response",
  });
  expect(i18n.t(key)).toBe("E-posta veya parola hatalı.");
  await changeLanguage("en-US");
  expect(i18n.t(key)).toBe("Email or password is incorrect.");
  expect(i18n.t("unknown.key")).toBe(i18n.t("common:errors.SERVICE_ERROR"));
});
