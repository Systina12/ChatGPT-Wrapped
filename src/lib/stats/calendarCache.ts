import type { ParsedMessage } from "../../types/export";
import { calendarDate, toDate } from "./time";

/** Owned by one import worker. Replaced when its data or timezone changes. */
export class CalendarCache {
  private readonly dates = new WeakMap<
    ParsedMessage,
    { createdAt: Date | null; calendarAt: Date | null }
  >();
  constructor(readonly timezone: string) {}
  forMessage(message: ParsedMessage) {
    let dates = this.dates.get(message);
    if (!dates) {
      const createdAt =
        toDate(message.createTime) || toDate(message.createTimeText);
      dates = {
        createdAt,
        calendarAt: createdAt ? calendarDate(createdAt, this.timezone) : null,
      };
      this.dates.set(message, dates);
    }
    return dates;
  }
}
