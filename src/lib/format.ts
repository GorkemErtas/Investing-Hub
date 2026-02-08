export const money = (value: number | null | undefined, compact = false) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 6 : 2,
        minimumFractionDigits: compact ? 0 : 2,
        notation: compact ? 'compact' : 'standard',
      }).format(value);
export const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export const utc = (value: string | number) =>
  `${new Date(value).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC`;
