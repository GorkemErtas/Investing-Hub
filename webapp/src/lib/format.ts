import { i18n } from './i18n';
import { localeValue, formatDate, formatNumber } from '@investing-hub/shared/localization';
export const number = (value: number | null | undefined, options: Intl.NumberFormatOptions = {}) =>
  formatNumber(value, localeValue(i18n.resolvedLanguage), options);
export const date = (value: string | number | Date) =>
  formatDate(value, localeValue(i18n.resolvedLanguage), true);
export const money = (value: number | null | undefined, compact = false) =>
  value == null
    ? '—'
    : new Intl.NumberFormat(localeValue(i18n.resolvedLanguage), {
        maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 6 : 2,
        minimumFractionDigits: compact ? 0 : 2,
        notation: compact ? 'compact' : 'standard',
      }).format(value);
export const percent = (value: number) =>
  number(value / 100, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: value > 0 ? 'always' : 'auto',
  });
export const utc = (value: string | number) =>
  `${formatDate(value, localeValue(i18n.resolvedLanguage))} UTC`;
