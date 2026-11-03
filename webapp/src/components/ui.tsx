import { AlertCircle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { assets, type DataMeta, type Symbol } from '@investing-hub/shared/contracts';
import { percent, utc } from '../lib/format';

export function Coin({ symbol, small = false }: { symbol: Symbol; small?: boolean }) {
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
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className={value >= 0 ? 'positive change' : 'negative change'}>
      {value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {percent(value)}
    </span>
  );
}
export function Status({ meta, failed = false }: { meta?: DataMeta; failed?: boolean }) {
  if (!meta)
    return (
      <span className="status muted">
        <i className="status-dot offline" />
        {failed ? 'Provider unavailable' : 'Connecting to market data'}
      </span>
    );
  return (
    <span
      className={`status ${meta.stale || failed ? 'warning-text' : ''}`}
      title={`Source: ${meta.provider}; latest source ${utc(meta.sourceTime)}; fetched ${utc(meta.fetchedAt)}`}
    >
      <i className={`status-dot ${meta.stale || failed ? 'offline' : ''}`} />
      {meta.stale || failed ? 'Stale · last available data' : 'Public market data'}
      <span className="status-time"> · {utc(meta.fetchedAt)}</span>
    </span>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <AlertCircle size={26} />
      <strong>Data is taking a break</strong>
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={15} />
          Try again
        </button>
      )}
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status">
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  );
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeletons" role="status" aria-label="Loading data">
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
