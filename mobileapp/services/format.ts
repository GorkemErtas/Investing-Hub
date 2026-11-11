import {
  formatNumber,
  formatDate,
  localeValue,
  decimalInput,
  decimalDisplay,
} from "@investing-hub/shared/localization";
import { i18n } from "./i18n";
export const activeLocale = () => localeValue(i18n.resolvedLanguage);
export const formatAmount = (
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
) =>
  formatNumber(value, activeLocale(), { maximumFractionDigits: 8, ...options });
export const formatPrice = (value: number | null | undefined) =>
  formatAmount(value, {
    maximumFractionDigits: value && Math.abs(value) < 1 ? 8 : 2,
    minimumFractionDigits: 2,
  });
export const formatPercent = (value: number) =>
  formatAmount(value / 100, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const formatUtc = (value: string | number | Date) =>
  `${formatDate(value, activeLocale())} UTC`;
export const formatDay = (value: string | number | Date) =>
  `${formatDate(value, activeLocale(), true)} UTC`;
export const formatChartTick = (value: string | number, intraday = false) =>
  `${new Intl.DateTimeFormat(activeLocale(), {
    timeZone: "UTC",
    ...(intraday
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : { day: "2-digit", month: "short" }),
  }).format(new Date(value))} UTC`;
export const formatDecimalInput = (value: string) =>
  decimalInput(value, activeLocale());
export const displayDecimalInput = (value: string | number) =>
  decimalDisplay(value, activeLocale());
