import { useTranslation } from 'react-i18next';
export function CandleDiagram() {
  const { t } = useTranslation();
  return (
    <svg
      className="candle-diagram"
      viewBox="0 0 500 240"
      role="img"
      aria-label={t('learn.candlestickDiagramShowingACandleSBody')}
    >
      <title>{t('learn.candlestickDiagramShowingACandleSBody')}</title>
      <line x1="235" y1="25" x2="235" y2="215" stroke="currentColor" strokeWidth="3" />
      <rect x="210" y="72" width="50" height="96" fill="var(--accent)" rx="3" />
      <g fill="currentColor" fontSize="15">
        <text x="280" y="32">
          {t('common:chart.high')}
        </text>
        <text x="280" y="80">
          {t('common:chart.close')}
        </text>
        <text x="280" y="175">
          {t('common:chart.open')}
        </text>
        <text x="280" y="220">
          {t('common:chart.low')}
        </text>
        <text x="100" y="124">
          {t('learn.body')}
        </text>
        <text x="100" y="42">
          {t('learn.wick')}
        </text>
      </g>
    </svg>
  );
}
