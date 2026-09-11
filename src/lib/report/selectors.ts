import type { CountMap, KeyCount, WrappedData } from "../../types/wrapped";
import { serializeWrappedData } from "./download";
import { SHORT_DATE_OPTIONS, formatCount, formatDate, formatHour, formatModel, formatMonth, formatPercent } from "./format";
import { DAY_LABELS, languageLabel, languageTone, periodLabel, type LegendTone } from "./labels";

const MONTHS_SHOWN = 12;
const MODELS_SHOWN = 7;
const CONVERSATIONS_SHOWN = 5;
const WORDS_SHOWN = 20;
const YEAR_IN_DAYS = 365;
const MANY_CONVERSATIONS = 1000;
const WEEKDAY_MIN_OPACITY = 0.35;
const WEEKDAY_OPACITY_RANGE = 0.65;
const WEEKDAY_EMPTY_OPACITY = 0.18;
const WORD_BASE_SIZE_REM = 0.92;
const WORD_SIZE_RANGE_REM = 0.86;
const WORD_DEFAULT_SIZE_REM = 1.05;

export interface MetricSummary {
  conversations: number;
  userMessages: number;
  dateSpanDays: number;
  characters: number;
  assets: number;
  parseWarnings: number;
}

export interface InsightItem {
  label: string;
  value: string;
  detail: string;
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  title: string;
}

export interface RankDatum {
  key: string;
  label: string;
  value: number;
}

export interface LanguageSegment {
  key: string;
  label: string;
  tone: LegendTone;
  count: number;
  share: number;
  percent: string;
}

export interface WeekdayDatum {
  label: string;
  value: number;
  opacity: number;
}

export interface ConversationDatum {
  key: string;
  rank: string;
  title: string;
  date: string;
  messageCount: number;
}

export interface WordDatum {
  term: string;
  count: number;
  sizeRem: number;
}

export interface ReportViewModel {
  rangeStart: string | null;
  rangeEnd: string | null;
  metrics: MetricSummary;
  headline: string;
  insights: InsightItem[];
  monthly: BarDatum[];
  hourly: BarDatum[];
  models: RankDatum[];
  languages: LanguageSegment[];
  dayPeriods: RankDatum[];
  weekdays: WeekdayDatum[];
  conversations: ConversationDatum[];
  words: WordDatum[];
  rawJson: string;
}

export function buildReportViewModel(data: WrappedData): ReportViewModel {
  const metrics = selectMetrics(data);
  return {
    rangeStart: formatDate(data.overview.first_seen_at),
    rangeEnd: formatDate(data.overview.last_seen_at),
    metrics,
    headline: headline(metrics),
    insights: selectInsights(data),
    monthly: selectMonthly(data),
    hourly: selectHourly(data),
    models: selectModels(data),
    languages: selectLanguages(data),
    dayPeriods: selectDayPeriods(data),
    weekdays: selectWeekdays(data),
    conversations: selectConversations(data),
    words: selectWords(data),
    rawJson: serializeWrappedData(data),
  };
}

function selectMetrics(data: WrappedData): MetricSummary {
  return {
    conversations: data.overview.conversation_count,
    userMessages: data.overview.user_message_count,
    dateSpanDays: data.overview.known_days ?? 0,
    characters: data.overview.total_character_count,
    assets: data.assets.total_count,
    parseWarnings: data.meta.parse_warning_count,
  };
}

function headline({ userMessages, conversations, dateSpanDays }: MetricSummary): string {
  if (!userMessages && !conversations) return "A blank canvas, waiting for its first question.";
  if (dateSpanDays > YEAR_IN_DAYS) return `A year-spanning archive with ${formatCount(userMessages)} questions in it.`;
  if (conversations > MANY_CONVERSATIONS) return `${formatCount(conversations)} conversations made it into the archive.`;
  return `${formatCount(userMessages)} messages shaped this little corner of your life.`;
}

function selectInsights(data: WrappedData): InsightItem[] {
  const activeHour = data.activity.most_active_hour;
  const mostUsedModel = data.models.most_used_model;
  const streak = data.timeline.longest_active_streak;
  const activeDay = data.highlights.most_active_day;
  return [
    {
      label: "Most active hour",
      value: formatHour(activeHour?.key),
      detail: `${formatCount(activeHour?.count ?? 0)} messages`,
    },
    {
      label: "Most used model",
      value: formatModel(mostUsedModel?.model),
      detail: `${formatCount(mostUsedModel?.message_count ?? 0)} assistant messages`,
    },
    {
      label: "Longest active streak",
      value: `${formatCount(streak.days)} days`,
      detail: `${streak.start ?? "No dated streak"} → ${streak.end ?? "-"}`,
    },
    {
      label: "Busiest day",
      value: formatDate(activeDay?.key, SHORT_DATE_OPTIONS) ?? "Unknown",
      detail: `${formatCount(activeDay?.message_count ?? 0)} messages`,
    },
  ];
}

function selectMonthly(data: WrappedData): BarDatum[] {
  return data.timeline.months.slice(-MONTHS_SHOWN).map((bucket) => {
    const label = formatMonth(bucket.key);
    return {
      key: bucket.key,
      label,
      value: bucket.message_count,
      title: `${label}: ${formatCount(bucket.message_count)} messages`,
    };
  });
}

function selectHourly(data: WrappedData): BarDatum[] {
  return countEntries(data.activity.by_hour)
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item) => ({
      key: item.key,
      label: item.key,
      value: item.count,
      title: `${formatHour(item.key)}: ${formatCount(item.count)} messages`,
    }));
}

function selectModels(data: WrappedData): RankDatum[] {
  return data.models.models.slice(0, MODELS_SHOWN).map((item) => ({
    key: item.model,
    label: formatModel(item.model),
    value: item.message_count,
  }));
}

function selectLanguages(data: WrappedData): LanguageSegment[] {
  const items = countEntries(data.language.message_buckets);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return items.map((item) => ({
    key: item.key,
    label: languageLabel(item.key),
    tone: languageTone(item.key),
    count: item.count,
    share: total ? (item.count / total) * 100 : 0,
    percent: formatPercent(item.count, total),
  }));
}

function selectDayPeriods(data: WrappedData): RankDatum[] {
  return countEntries(data.activity.by_day_period).map((item) => ({
    key: item.key,
    label: periodLabel(item.key),
    value: item.count,
  }));
}

function selectWeekdays(data: WrappedData): WeekdayDatum[] {
  const byWeekday = data.activity.by_weekday;
  const max = Math.max(...Object.values(byWeekday), 1);
  return DAY_LABELS.map((label, index) => {
    const value = byWeekday[String(index)] ?? 0;
    const opacity = value ? WEEKDAY_MIN_OPACITY + (value / max) * WEEKDAY_OPACITY_RANGE : WEEKDAY_EMPTY_OPACITY;
    return { label, value, opacity };
  });
}

function selectConversations(data: WrappedData): ConversationDatum[] {
  return data.conversations.longest_by_messages.slice(0, CONVERSATIONS_SHOWN).map((item, index) => ({
    key: `${item.conversation_id}-${index}`,
    rank: String(index + 1).padStart(2, "0"),
    title: item.title?.trim() || "Untitled conversation",
    date: formatDate(item.created_at, SHORT_DATE_OPTIONS) ?? "Unknown date",
    messageCount: item.message_count,
  }));
}

function selectWords(data: WrappedData): WordDatum[] {
  const words = data.frequent_words.user.slice(0, WORDS_SHOWN);
  const max = words.reduce((best, item) => Math.max(best, item.count), 0);
  return words.map((item) => ({
    term: item.term,
    count: item.count,
    sizeRem: max ? WORD_BASE_SIZE_REM + (item.count / max) * WORD_SIZE_RANGE_REM : WORD_DEFAULT_SIZE_REM,
  }));
}

function countEntries(map: CountMap): KeyCount[] {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}
