type SparklineProps = {
  points: number[];
  ariaLabel: string;
  width?: number;
  height?: number;
};

export function Sparkline({ points, ariaLabel, width = 88, height = 24 }: SparklineProps) {
  const w = width;
  const h = height;
  const n = points.length;
  const max = Math.max(1, ...points);
  const stepX = n > 1 ? w / (n - 1) : w;
  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const allZero = points.every((v) => v === 0);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} className="stroke-border" strokeWidth={1} />
      {!allZero && (
        <polyline
          points={coords.join(" ")}
          fill="none"
          className="stroke-primary"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
