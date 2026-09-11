import { FileJson, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { buildReportViewModel } from "../../lib/report/selectors";
import type { WrappedData } from "../../types/wrapped";
import { DetailSection } from "./DetailSection";
import { OverviewSection } from "./OverviewSection";
import { RhythmSection } from "./RhythmSection";
import { UsageSection } from "./UsageSection";

export function Report({ data }: { data: WrappedData }) {
  const view = useMemo(() => buildReportViewModel(data), [data]);

  return (
    <>
      <OverviewSection
        rangeStart={view.rangeStart}
        rangeEnd={view.rangeEnd}
        metrics={view.metrics}
        headline={view.headline}
        insights={view.insights}
      />
      <RhythmSection monthly={view.monthly} hourly={view.hourly} />
      <UsageSection models={view.models} languages={view.languages} dayPeriods={view.dayPeriods} weekdays={view.weekdays} />
      <DetailSection conversations={view.conversations} words={view.words} />

      <details className="raw-details">
        <summary>
          <FileJson size={17} /> Open raw WrappedData JSON
        </summary>
        <pre>{view.rawJson}</pre>
      </details>

      <footer className="report-footer">
        <ShieldCheck size={16} />
        This report was generated locally from your export. Nothing was uploaded.
      </footer>
    </>
  );
}
