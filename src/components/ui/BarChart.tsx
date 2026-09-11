import { formatCompact } from "../../lib/report/format";
import type { BarDatum } from "../../lib/report/selectors";

const MIN_VISIBLE_HEIGHT_PERCENT = 5;

interface BarChartProps {
  items: BarDatum[];
  className: string;
  ariaLabel: string;
}

export function BarChart({ items, className, ariaLabel }: BarChartProps) {
  const max = items.reduce((best, item) => Math.max(best, item.value), 0);
  return (
    <div className="chart-scroll">
      <div className={className} aria-label={ariaLabel}>
        {items.map((item) => (
          <BarColumn key={item.key} item={item} max={max} />
        ))}
      </div>
    </div>
  );
}

function BarColumn({ item, max }: { item: BarDatum; max: number }) {
  const height = max ? Math.max((item.value / max) * 100, item.value ? MIN_VISIBLE_HEIGHT_PERCENT : 0) : 0;
  return (
    <div className="bar-column" title={item.title}>
      <div className="bar-track">
        <span style={{ height: `${height}%` }} />
      </div>
      <strong>{item.value ? formatCompact(item.value) : ""}</strong>
      <small>{item.label}</small>
    </div>
  );
}
