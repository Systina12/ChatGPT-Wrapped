import type { InsightItem } from "../../lib/report/selectors";

export function Insight({ label, value, detail }: InsightItem) {
  return (
    <div className="insight">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
