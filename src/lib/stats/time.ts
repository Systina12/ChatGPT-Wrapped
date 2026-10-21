import type { DateRange, DayPeriod } from "../../types/wrapped";

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date =
    typeof value === "number" && Number.isFinite(value)
      ? new Date(value * 1000)
      : typeof value === "string"
        ? new Date(value)
        : null;
  return date &&
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1 &&
    date.getUTCFullYear() <= 9999
    ? date
    : null;
}
const formatters = new Map<string, Intl.DateTimeFormat>();
/** UTC fields represent the selected zone's calendar, not a new instant. */
export function calendarDate(date: Date, timezone = "UTC"): Date {
  if (timezone === "UTC") return date;
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date))
    if (part.type !== "literal") parts[part.type] = part.value;
  return new Date(
    `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
  );
}
export const isoOrNull = (date: Date | null | undefined): string | null =>
  date ? date.toISOString() : null;
export const yearKey = (date: Date): string =>
  String(date.getUTCFullYear()).padStart(4, "0");
export const monthKey = (date: Date): string =>
  `${yearKey(date)}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
export const hourKey = (date: Date): string =>
  String(date.getUTCHours()).padStart(2, "0");
export const weekdayKey = (date: Date): string =>
  String((date.getUTCDay() + 6) % 7);
export function dayPeriod(date: Date): DayPeriod {
  const hour = date.getUTCHours();
  return hour < 6
    ? "late_night"
    : hour < 12
      ? "morning"
      : hour < 18
        ? "afternoon"
        : "evening";
}
export function isCalendarDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !!toDate(value) &&
    dayKey(toDate(value)!) === value
  );
}
export const dayOrdinal = (key: string): number =>
  new Date(`${key}T00:00:00Z`).getTime() / 86_400_000;
export function longestStreak(keys: Iterable<string>): DateRange {
  const days = [...new Set(keys)].filter(isCalendarDay).sort();
  let best: DateRange = { days: 0, start: null, end: null };
  let start = "",
    previous = "",
    length = 0;
  for (const day of days) {
    if (previous && dayOrdinal(day) - dayOrdinal(previous) === 1) length++;
    else {
      start = day;
      length = 1;
    }
    if (length > best.days) best = { days: length, start, end: day };
    previous = day;
  }
  return best;
}
export function longestGap(keys: Iterable<string>): DateRange {
  const days = [...new Set(keys)].filter(isCalendarDay).sort();
  let best: DateRange = { days: 0, start: null, end: null };
  for (let i = 1; i < days.length; i++) {
    const length = dayOrdinal(days[i]) - dayOrdinal(days[i - 1]) - 1;
    if (length > best.days)
      best = { days: length, start: days[i - 1], end: days[i] };
  }
  return best;
}
