import type { ParsedMessage } from "../../types/export";
import { calendarDate, dayKey, toDate } from "./time";

/** Owned by one import worker; messages remain immutable for this cache's lifetime. */
export class CalendarCache {
  private readonly dates = new WeakMap<
    ParsedMessage,
    { createdAt: Date | null; calendarAt: Date | null; day: string | null }
  >();
  private readonly years = new WeakMap<
    ParsedMessage[],
    { length: number; values: string[] }
  >();
  constructor(readonly timezone: string) {}
  forMessage(message: ParsedMessage) {
    let dates = this.dates.get(message);
    if (!dates) {
      const createdAt =
        toDate(message.createTime) || toDate(message.createTimeText);
      const calendarAt = createdAt
        ? calendarDate(createdAt, this.timezone)
        : null;
      dates = {
        createdAt,
        calendarAt,
        day: calendarAt ? dayKey(calendarAt) : null,
      };
      this.dates.set(message, dates);
    }
    return dates;
  }
  availableYears(messages: ParsedMessage[]): string[] {
    let cached = this.years.get(messages);
    if (!cached || cached.length !== messages.length) {
      const years = new Set<string>();
      for (const message of messages) {
        const day = this.forMessage(message).day;
        if (day) years.add(day.slice(0, 4));
      }
      cached = { length: messages.length, values: [...years].sort().reverse() };
      this.years.set(messages, cached);
    }
    return [...cached.values];
  }
}
