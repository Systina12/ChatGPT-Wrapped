import { Bot, Languages } from "lucide-react";
import { formatCount } from "../../lib/report/format";
import type { LanguageSegment, RankDatum, WeekdayDatum } from "../../lib/report/selectors";
import { EmptyChart } from "../ui/EmptyChart";
import { Panel } from "../ui/Panel";
import { RankList } from "../ui/RankList";

interface UsageSectionProps {
  models: RankDatum[];
  languages: LanguageSegment[];
  dayPeriods: RankDatum[];
  weekdays: WeekdayDatum[];
}

export function UsageSection({ models, languages, dayPeriods, weekdays }: UsageSectionProps) {
  return (
    <section className="chart-grid">
      <Panel title="Models in the room" subtitle="Assistant messages grouped by model slug" icon={<Bot size={18} />}>
        {models.length ? <RankList items={models} /> : <EmptyChart message="No assistant model metadata was found." />}
      </Panel>

      <Panel title="Language and time of day" subtitle="A lightweight view of how the archive reads" icon={<Languages size={18} />}>
        <div className="split-panel">
          <div>
            <p className="mini-label">Message language buckets</p>
            <LanguageBar segments={languages} />
          </div>
          <div>
            <p className="mini-label">Day periods</p>
            {dayPeriods.length ? (
              <RankList items={dayPeriods} className="period-list" compact />
            ) : (
              <div className="period-list">
                <EmptyChart message="No time-of-day data." />
              </div>
            )}
          </div>
        </div>
        <WeekdayStrip items={weekdays} />
      </Panel>
    </section>
  );
}

function LanguageBar({ segments }: { segments: LanguageSegment[] }) {
  return (
    <>
      <div className="segmented-bar" aria-label="Language distribution">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`segment segment-${segment.tone}`}
            style={{ width: `${segment.share}%` }}
            title={`${segment.label}: ${formatCount(segment.count)}`}
          />
        ))}
      </div>
      <div className="legend-list">
        {segments.map((segment) => (
          <div className="legend-row" key={segment.key}>
            <span>
              <i className={`legend-dot legend-${segment.tone}`} />
              {segment.label}
            </span>
            <strong>{segment.percent}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

function WeekdayStrip({ items }: { items: WeekdayDatum[] }) {
  return (
    <div className="weekday-strip" aria-label="Messages by weekday">
      {items.map((item) => (
        <span key={item.label} title={`${item.label}: ${formatCount(item.value)} messages`} style={{ opacity: item.opacity }}>
          {item.label}
        </span>
      ))}
    </div>
  );
}
