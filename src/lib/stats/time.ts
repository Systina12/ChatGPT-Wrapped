export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function yearKey(value: Date): string {
  return String(value.getUTCFullYear()).padStart(4, "0");
}

export function monthKey(value: Date): string {
  return `${yearKey(value)}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function hourKey(value: Date): string {
  return String(value.getUTCHours()).padStart(2, "0");
}

export function weekdayKey(value: Date): string {
  const day = value.getUTCDay();
  return String(day === 0 ? 6 : day - 1);
}

export function dayPeriod(value: Date): string {
  const hour = value.getUTCHours();
  if (hour < 6) return "late_night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function longestStreak(dayKeys: Iterable<string>): Record<string, number | string | null> {
  const dates = [...new Set(dayKeys)].map(parseDay).filter(isDate).sort((left, right) => left.getTime() - right.getTime());
  if (dates.length === 0) {
    return { days: 0, start: null, end: null };
  }

  let bestStart = dates[0];
  let bestEnd = dates[0];
  let currentStart = dates[0];
  let currentEnd = dates[0];

  dates.slice(1).forEach((date) => {
    if (daysBetween(currentEnd, date) === 1) {
      currentEnd = date;
    } else {
      if (daysBetween(currentStart, currentEnd) > daysBetween(bestStart, bestEnd)) {
        bestStart = currentStart;
        bestEnd = currentEnd;
      }
      currentStart = date;
      currentEnd = date;
    }
  });

  if (daysBetween(currentStart, currentEnd) > daysBetween(bestStart, bestEnd)) {
    bestStart = currentStart;
    bestEnd = currentEnd;
  }

  return {
    days: daysBetween(bestStart, bestEnd) + 1,
    start: dayKey(bestStart),
    end: dayKey(bestEnd),
  };
}

export function longestGap(dayKeys: Iterable<string>): Record<string, number | string | null> {
  const dates = [...new Set(dayKeys)].map(parseDay).filter(isDate).sort((left, right) => left.getTime() - right.getTime());
  if (dates.length < 2) {
    return { days: 0, start: null, end: null };
  }

  let bestStart = dates[0];
  let bestEnd = dates[1];
  let bestDays = daysBetween(bestStart, bestEnd) - 1;

  for (let index = 0; index < dates.length - 1; index += 1) {
    const left = dates[index];
    const right = dates[index + 1];
    const gapDays = daysBetween(left, right) - 1;
    if (gapDays > bestDays) {
      bestStart = left;
      bestEnd = right;
      bestDays = gapDays;
    }
  }

  return {
    days: Math.max(bestDays, 0),
    start: dayKey(bestStart),
    end: dayKey(bestEnd),
  };
}

function parseDay(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDate(value: Date | null): value is Date {
  return value !== null;
}

function daysBetween(left: Date, right: Date): number {
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}
