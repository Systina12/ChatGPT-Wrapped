import type { ReactNode } from "react";
import { formatCount } from "../../lib/report/format";

type MetricTone = "default" | "warning" | "calm";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  suffix?: string;
  tone?: MetricTone;
}

export function MetricCard({ icon, label, value, suffix, tone = "default" }: MetricCardProps) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{formatCount(value)}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </div>
  );
}
