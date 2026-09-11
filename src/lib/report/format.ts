const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

export const SHORT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

export function formatDate(value: string | number | null | undefined, options = DEFAULT_DATE_OPTIONS): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatHour(value: string | null | undefined): string {
  const hour = Number.parseInt(value ?? "", 10);
  return Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00` : "Unknown";
}

export function formatMonth(key: string): string {
  const date = new Date(`${key}-01T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? key : new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
}

export function formatModel(value: string | null | undefined): string {
  const model = value?.trim() || "Unknown model";
  return model.replace(/^text-/, "").replace(/[-_]/g, " ");
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, total: number): string {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}
