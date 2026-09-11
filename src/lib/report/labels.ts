import type { DayPeriod } from "../../types/wrapped";

export type LegendTone = "violet" | "blue" | "mint" | "amber";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const PERIOD_LABELS: Record<DayPeriod, string> = {
  late_night: "Late night",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const LANGUAGE_LABELS: Record<string, string> = {
  chinese: "Chinese",
  english: "English",
  mixed: "Mixed",
  other: "Other",
};

const LANGUAGE_TONES: Record<string, LegendTone> = {
  chinese: "violet",
  english: "blue",
  mixed: "mint",
  other: "amber",
};

export function periodLabel(key: string): string {
  return PERIOD_LABELS[key as DayPeriod] ?? key;
}

export function languageLabel(key: string): string {
  return LANGUAGE_LABELS[key] ?? key;
}

export function languageTone(key: string): LegendTone {
  return LANGUAGE_TONES[key] ?? "violet";
}
