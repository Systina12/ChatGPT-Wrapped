import { formatCount } from "../../lib/report/format";
import type { RankDatum } from "../../lib/report/selectors";

const MIN_VISIBLE_WIDTH_PERCENT = 3;

interface RankListProps {
  items: RankDatum[];
  className?: string;
  compact?: boolean;
}

export function RankList({ items, className = "rank-list", compact = false }: RankListProps) {
  const max = items.reduce((best, item) => Math.max(best, item.value), 0);
  return (
    <div className={className}>
      {items.map((item) => (
        <RankRow key={item.key} item={item} max={max} compact={compact} />
      ))}
    </div>
  );
}

function RankRow({ item, max, compact }: { item: RankDatum; max: number; compact: boolean }) {
  const width = max ? Math.max((item.value / max) * 100, item.value ? MIN_VISIBLE_WIDTH_PERCENT : 0) : 0;
  return (
    <div className={compact ? "rank-row rank-row-compact" : "rank-row"}>
      <div className="rank-label">
        <span>{item.label}</span>
        <strong>{formatCount(item.value)}</strong>
      </div>
      <div className="rank-track">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
