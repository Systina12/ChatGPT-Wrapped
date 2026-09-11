import { Activity, Clock3 } from "lucide-react";
import type { BarDatum } from "../../lib/report/selectors";
import { BarChart } from "../ui/BarChart";
import { EmptyChart } from "../ui/EmptyChart";
import { Panel } from "../ui/Panel";

interface RhythmSectionProps {
  monthly: BarDatum[];
  hourly: BarDatum[];
}

export function RhythmSection({ monthly, hourly }: RhythmSectionProps) {
  return (
    <section className="chart-grid">
      <Panel title="Monthly rhythm" subtitle="Messages across the last twelve active months" icon={<Activity size={18} />}>
        {monthly.length ? (
          <BarChart items={monthly} className="month-chart" ariaLabel="Monthly message counts" />
        ) : (
          <EmptyChart message="No dated messages were found." />
        )}
      </Panel>

      <Panel title="When you show up" subtitle="Message volume by hour (UTC in the export)" icon={<Clock3 size={18} />}>
        {hourly.length ? (
          <BarChart items={hourly} className="hour-chart" ariaLabel="Hourly message counts" />
        ) : (
          <EmptyChart message="No hourly activity was found." />
        )}
      </Panel>
    </section>
  );
}
