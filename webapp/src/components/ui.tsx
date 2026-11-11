import { i18n } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { assets, type DataMeta, type Symbol } from '@investing-hub/shared/contracts';
import { percent, utc } from '../lib/format';

export function Coin({ symbol, small = false }: { symbol: Symbol; small?: boolean }) {
  useTranslation();
  const a = assets.find((a) => a.symbol === symbol)!;
  return (
    <span
      className={`coin-icon ${small ? 'small' : ''}`}
      style={{ '--coin-color': a.color } as React.CSSProperties}
      aria-hidden="true"
    >
      {a.glyph}
    </span>
  );
}
export function Change({ value }: { value: number | null | undefined }) {
  useTranslation();
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className={value >= 0 ? 'positive change' : 'negative change'}>
      {value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {percent(value)}
    </span>
  );
}
export function Status({ meta, failed = false }: { meta?: DataMeta; failed?: boolean }) {
  useTranslation();
  if (!meta)
    return (
      <span className="status muted">
        <i className="status-dot offline" />
        {failed ? i18n.t('ui.providerUnavailable') : i18n.t('ui.connectingToMarketData')}
      </span>
    );
  return (
    <span
      className={`status ${meta.stale || failed ? 'warning-text' : ''}`}
      title={i18n.t('ui.sourceTimes', {
        source: utc(meta.sourceTime),
        fetched: utc(meta.fetchedAt),
      })}
    >
      <i className={`status-dot ${meta.stale || failed ? 'offline' : ''}`} />
      {meta.stale || failed ? i18n.t('ui.staleLastAvailableData') : i18n.t('ui.publicMarketData')}
      <span className="status-time"> · {utc(meta.fetchedAt)}</span>
    </span>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  useTranslation();
  return (
    <div className="empty-state" role="alert">
      <AlertCircle size={26} />
      <strong>{i18n.t('ui.dataIsTakingABreak')}</strong>
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={15} />
          {i18n.t('common:action.retry')}
        </button>
      )}
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  useTranslation();
  return (
    <div className="notice" role="status">
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  );
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  useTranslation();
  return (
    <div className="skeletons" role="status" aria-label={i18n.t('ui.loadingData')}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
export function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: ReactNode;
  icon: ReactNode;
}) {
  useTranslation();
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
