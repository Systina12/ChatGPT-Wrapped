import type { ParsedExport, ParseWarning } from "../../types/export";
import { DEFAULT_OPTIONS, type ReportOptions } from "../../types/options";
import type { TimelineBucket, WrappedData } from "../../types/wrapped";
import { CalendarCache } from "../stats/calendarCache";
import { buildOverviewData, buildWrappedData } from "../stats/builder";
import {
  availableYears,
  dateBounds,
  scopeExport,
  validateOptions,
} from "../stats/scope";
export const MAX_MONTHS = 1200;
function emptyMonth(key: string): TimelineBucket {
  return {
    key,
    conversation_count: 0,
    message_count: 0,
    user_message_count: 0,
    assistant_message_count: 0,
    character_count: 0,
    user_character_count: 0,
    assistant_character_count: 0,
    image_count: 0,
    voice_count: 0,
    file_count: 0,
  };
}
export function fillMonths(
  data: WrappedData,
  options: ReportOptions,
  warnings: ParseWarning[],
): void {
  const bounds = dateBounds(options);
  const first = bounds?.[0].slice(0, 7) || data.timeline.months[0]?.key;
  const last = bounds?.[1].slice(0, 7) || data.timeline.months.at(-1)?.key;
  if (!first || !last) return;
  const index = (key: string) =>
    Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
  const start = index(first),
    end = index(last);
  if (end - start + 1 > MAX_MONTHS) {
    warnings.push({
      code: "month_span_limited",
      message: `Month span exceeds ${MAX_MONTHS}; showing active months / 跨度异常，仅展示活动月份`,
    });
    return;
  }
  const existing = new Map(data.timeline.months.map((m) => [m.key, m]));
  data.timeline.months = Array.from({ length: end - start + 1 }, (_, i) => {
    const value = start + i;
    const key = `${String(Math.floor(value / 12)).padStart(4, "0")}-${String((value % 12) + 1).padStart(2, "0")}`;
    return existing.get(key) || emptyMonth(key);
  });
}
export function buildReport(
  parsed: ParsedExport,
  input: ReportOptions = DEFAULT_OPTIONS,
  settings: {
    cache?: CalendarCache;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): WrappedData {
  const options = validateOptions(input);
  const cache =
    settings.cache?.timezone === options.timezone
      ? settings.cache
      : new CalendarCache(options.timezone);
  const progress = (completed: number) => settings.onProgress?.(completed, 12);
  progress(0);
  const scoped = scopeExport(parsed, options, cache);
  const report = buildWrappedData(scoped, options.timezone, cache, progress);
  const warnings = scoped.warnings.map(({ code, message }) => ({
    code,
    message,
  }));
  fillMonths(report, options, warnings);
  report.meta.schema_version = 2;
  report.meta.parse_warning_count = warnings.length;
  report.meta.table_counts.parse_warnings = warnings.length;
  report.options = options;
  report.warnings = warnings;
  report.available_years = availableYears(parsed, options.timezone, cache);
  report.comparison = null;
  if (/^\d{4}$/.test(options.year) && Number(options.year) > 1) {
    const year = String(Number(options.year) - 1).padStart(4, "0");
    const previousScope = scopeExport(parsed, { ...options, year }, cache);
    progress(11);
    const previous = buildOverviewData(previousScope, options.timezone, cache);
    const count = previousScope.messages.length;
    report.comparison = {
      year,
      has_data: count > 0,
      overview: previous,
      message_count: count,
      message_growth_percent: count
        ? ((report.meta.table_counts.messages - count) / count) * 100
        : null,
    };
  }
  progress(12);
  return report;
}
