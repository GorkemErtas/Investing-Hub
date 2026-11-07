import { useId } from 'react';

export function AnalyticsPlot({
  title,
  values,
  histogram = false,
  labels,
}: {
  title: string;
  values: (number | null)[];
  histogram?: boolean;
  labels?: string[];
}) {
  const id = useId();
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!finite.length) return <p className="muted">Insufficient observations for this chart.</p>;
  const low = Math.min(0, ...finite),
    high = Math.max(...finite, low + 1e-8),
    span = high - low;
  const y = (v: number) => 138 - ((v - low) / span) * 116;
  const segments: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (segments.at(-1)!.length) segments.push([]);
    } else segments.at(-1)!.push(`${14 + (i * 570) / Math.max(1, values.length - 1)},${y(v)}`);
  });
  return (
    <figure className="analytics-plot">
      <figcaption>{title}</figcaption>
      <svg viewBox="0 0 600 170" role="img" aria-labelledby={id}>
        <title id={id}>
          {`${title}. ${finite.length} observations. Missing samples remain gaps. Range ${low.toFixed(4)} to ${high.toFixed(4)}.`}
        </title>
        <line x1="12" x2="588" y1={y(0)} y2={y(0)} className="analytics-axis" />
        <text x="14" y="12">
          {high.toFixed(histogram ? 0 : 4)}
        </text>
        {histogram
          ? values.map((v, i) =>
              v === null ? null : (
                <rect
                  key={i}
                  x={14 + (i * 570) / values.length}
                  y={y(v)}
                  width={Math.max(1, 570 / values.length - 3)}
                  height={Math.max(0, y(0) - y(v))}
                  rx="2"
                  className="analytics-bar"
                >
                  <title>{`${labels?.[i] ?? i}: ${v}`}</title>
                </rect>
              ),
            )
          : segments
              .filter((points) => points.length)
              .map((points, i) => (
                <polyline key={i} className="analytics-line" points={points.join(' ')} />
              ))}
        {!histogram &&
          values.map((v, i) =>
            v === null ? null : (
              <circle
                key={i}
                cx={14 + (i * 570) / Math.max(1, values.length - 1)}
                cy={y(v)}
                r="2"
                fill="currentColor"
              >
                <title>{`${labels?.[i] ?? i}: ${v.toFixed(5)}`}</title>
              </circle>
            ),
          )}
        <text x="14" y="163">
          {labels?.[0] ?? 'Earlier'}
        </text>
        <text x="586" y="163" textAnchor="end">
          {labels?.at(-1) ?? 'Latest'}
        </text>
      </svg>
    </figure>
  );
}
