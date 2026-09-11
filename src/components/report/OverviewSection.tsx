import { Activity, AlertTriangle, Bot, CalendarDays, Languages, MessageCircle, Trophy } from "lucide-react";
import type { InsightItem, MetricSummary } from "../../lib/report/selectors";
import { Insight } from "../ui/Insight";
import { MetricCard } from "../ui/MetricCard";

interface OverviewSectionProps {
  rangeStart: string | null;
  rangeEnd: string | null;
  metrics: MetricSummary;
  headline: string;
  insights: InsightItem[];
}

export function OverviewSection({ rangeStart, rangeEnd, metrics, headline, insights }: OverviewSectionProps) {
  return (
    <>
      <section className="report-heading">
        <div>
          <p className="eyebrow">Personal report</p>
          <h2>Here&apos;s what your archive says.</h2>
        </div>
        <p className="report-range">
          {rangeStart ?? "Unknown start"}
          <span aria-hidden="true">→</span>
          {rangeEnd ?? "Unknown end"}
        </p>
      </section>

      <section className="metrics-grid" aria-label="Overview metrics">
        <MetricCard icon={<MessageCircle size={18} />} label="Conversations" value={metrics.conversations} />
        <MetricCard icon={<Bot size={18} />} label="Your messages" value={metrics.userMessages} />
        <MetricCard icon={<CalendarDays size={18} />} label="Date span" value={metrics.dateSpanDays} suffix="days" />
        <MetricCard icon={<Activity size={18} />} label="Characters" value={metrics.characters} />
        <MetricCard icon={<Languages size={18} />} label="Assets found" value={metrics.assets} />
        <MetricCard
          icon={<AlertTriangle size={18} />}
          label="Parse warnings"
          value={metrics.parseWarnings}
          tone={metrics.parseWarnings ? "warning" : "calm"}
        />
      </section>

      <section className="spotlight-grid">
        <article className="spotlight-card">
          <div className="spotlight-icon">
            <Trophy size={22} />
          </div>
          <div>
            <p className="eyebrow">The headline</p>
            <h2>{headline}</h2>
            <p className="muted">
              The report is computed entirely in your browser, with the raw export available only to this page.
            </p>
          </div>
        </article>
        <div className="quick-insights">
          {insights.map((item) => (
            <Insight key={item.label} {...item} />
          ))}
        </div>
      </section>
    </>
  );
}
