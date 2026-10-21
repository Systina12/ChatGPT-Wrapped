import { z } from "zod";
import type { WrappedData } from "../../types/wrapped";
import { DEFAULT_OPTIONS } from "../../types/options";
import { validateOptions } from "../stats/scope";
import { isCalendarDay, toDate } from "../stats/time";
export const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const count = z.number().finite().int().nonnegative();
const positive = z.number().finite().nonnegative();
const nullableText = z.string().nullable();
const timestamp = z
  .string()
  .refine(
    (v) => !!toDate(v) && isCalendarDay(v.slice(0, 10)),
    "Invalid timestamp",
  )
  .nullable();
const day = z
  .string()
  .refine(isCalendarDay, "Invalid calendar date")
  .nullable();
const counts = z.record(z.string(), count);
const keyCount = z.object({ key: z.string(), count });
const terms = z.array(z.object({ term: z.string(), count }));
const distribution = z.object({
  zero: count,
  one_to_two: count,
  three_to_five: count,
  six_to_ten: count,
  eleven_to_thirty: count,
  thirty_one_to_one_hundred: count,
  over_one_hundred: count,
});
const metric = {
  conversation_count: count,
  message_count: count,
  user_message_count: count,
  assistant_message_count: count,
  character_count: count,
  user_character_count: count,
  assistant_character_count: count,
  image_count: count,
  file_count: count,
  voice_count: count,
};
const bucket = z
  .object({ key: z.string(), ...metric })
  .catchall(z.union([count, z.string()]));
const calendarBucket = bucket.refine(
  (v) =>
    (/^\d{4}$/.test(v.key) && +v.key > 0) ||
    (/^\d{4}-\d{2}$/.test(v.key) && isCalendarDay(`${v.key}-01`)) ||
    isCalendarDay(v.key),
  "Invalid timeline key",
);
const yearBucket = bucket.refine(
  (v) => /^\d{4}$/.test(v.key) && +v.key > 0,
  "Invalid year key",
);
const monthBucket = bucket.refine(
  (v) => /^\d{4}-\d{2}$/.test(v.key) && isCalendarDay(`${v.key}-01`),
  "Invalid month key",
);
const dayBucket = bucket.refine((v) => isCalendarDay(v.key), "Invalid day key");
const dateRange = z
  .object({ days: count, start: day, end: day })
  .refine((v) => !v.start || !v.end || v.start <= v.end, "Invalid date range");
const summary = z.object({
  conversation_id: z.string(),
  title: nullableText,
  created_at: timestamp,
  message_count: count,
  character_count: count,
});
const topConversation = summary.extend({
  user_message_count: count,
  assistant_message_count: count,
  asset_count: count,
  value: positive.nullable(),
});
const topMessage = z.object({
  message_id: nullableText,
  conversation_id: nullableText,
  role: nullableText,
  created_at: timestamp,
  character_count: count,
  text_excerpt: nullableText,
});
const model = z.object({
  model: z.string(),
  message_count: count,
  character_count: count,
  first_seen_at: timestamp,
  last_seen_at: timestamp,
});
const overview = z.object({
  conversation_count: count,
  user_message_count: count,
  assistant_message_count: count,
  image_count: count,
  file_count: count,
  voice_count: count,
  user_character_count: count,
  assistant_character_count: count,
  total_character_count: count,
  first_seen_at: timestamp,
  last_seen_at: timestamp,
  known_days: count.nullable(),
});
const options = z.unknown().transform((value, context) => {
  try {
    return validateOptions(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid options",
    });
    return z.NEVER;
  }
});
const warning = z.object({ code: z.string(), message: z.string() });
const year = z
  .string()
  .regex(/^\d{4}$/)
  .refine((v) => +v > 0);
const comparison = z
  .object({
    year,
    has_data: z.boolean(),
    overview,
    message_count: count,
    message_growth_percent: z.number().finite().nullable(),
  })
  .nullable();
const base = z.object({
  meta: z.object({
    generated_at: z
      .string()
      .refine((v) => !!toDate(v), "Invalid generated date"),
    schema_version: z.union([z.literal(1), z.literal(2)]),
    table_counts: z
      .object({
        source_files: count,
        metadata: count,
        conversations: count,
        messages: count,
        assets: count,
        asset_name_map: count,
        library_files: count,
        feedback: count,
        shares: count,
        group_chats: count,
        users: count,
        settings: count,
        parse_warnings: count,
      })
      .catchall(count),
    parse_warning_count: count,
  }),
  overview,
  timeline: z.object({
    years: z.array(yearBucket),
    months: z.array(monthBucket),
    days: z.array(dayBucket),
    most_active_day: dayBucket.nullable(),
    most_active_month: monthBucket.nullable(),
    most_active_year: yearBucket.nullable(),
    longest_active_streak: dateRange,
    longest_inactive_gap: dateRange,
  }),
  activity: z.object({
    by_hour: counts.refine((v) =>
      Object.keys(v).every((k) => /^(?:[01]\d|2[0-3])$/.test(k)),
    ),
    by_weekday: counts.refine((v) =>
      Object.keys(v).every((k) => /^[0-6]$/.test(k)),
    ),
    by_day_period: z.object({
      late_night: count,
      morning: count,
      afternoon: count,
      evening: count,
    }),
    weekday_vs_weekend: z.object({ weekday: count, weekend: count }),
    most_active_hour: keyCount
      .refine((v) => /^(?:[01]\d|2[0-3])$/.test(v.key))
      .nullable(),
    most_active_weekday: keyCount
      .refine((v) => /^[0-6]$/.test(v.key))
      .nullable(),
  }),
  conversations: z.object({
    message_count_distribution: distribution,
    character_count_distribution: distribution,
    short_conversation_count: count,
    long_conversation_count: count,
    archived_count: count,
    starred_count: count,
    shared_count: count,
    longest_by_messages: z.array(topConversation),
    longest_by_characters: z.array(topConversation),
    most_assets: z.array(topConversation),
    earliest: summary.nullable(),
    latest: summary.nullable(),
  }),
  messages: z.object({
    user_length_distribution: distribution,
    assistant_length_distribution: distribution,
    all_length_distribution: distribution,
    user_to_assistant_character_ratio: positive.nullable(),
    question_marks: count,
    exclamation_marks: count,
    url_count: count,
    code_block_count: count,
    longest_user_messages: z.array(topMessage),
    longest_assistant_messages: z.array(topMessage),
  }),
  models: z.object({
    models: z.array(model),
    most_used_model: model.nullable(),
    monthly_primary_model: z.record(z.string(), nullableText),
  }),
  assets: z.object({
    total_count: count,
    by_category: counts,
    by_mime_type: z.array(keyCount),
    by_extension: z.array(keyCount),
    size_distribution: distribution,
    monthly: z.record(z.string(), counts),
    largest_assets: z.array(
      z.object({
        local_path: z.string(),
        display_name: nullableText,
        category: z.enum(["image", "voice", "file"]),
        mime_type: nullableText,
        file_extension: nullableText,
        size_bytes: count.nullable(),
        conversation_id: nullableText,
        message_id: nullableText,
      }),
    ),
  }),
  language: z.object({
    totals: z.object({
      chinese_characters: count,
      english_words: count,
      digit_characters: count,
    }),
    message_buckets: counts,
  }),
  frequent_words: z.object({
    all: terms,
    user: terms,
    assistant: terms,
    monthly: z.record(z.string(), terms),
  }),
  quality: z.object({
    feedback_count: count,
    feedback_by_rating: counts,
    shared_conversation_count: count,
    conversations_with_feedback_count: count,
    high_interaction_conversations: z.array(topConversation),
    high_asset_conversations: z.array(topConversation),
    high_character_conversations: z.array(topConversation),
  }),
  highlights: z.object({
    most_active_day: dayBucket.nullable(),
    most_active_month: monthBucket.nullable(),
    longest_conversation_by_messages: topConversation.nullable(),
    longest_conversation_by_characters: topConversation.nullable(),
    most_asset_conversation: topConversation.nullable(),
    most_used_model: model.nullable(),
    most_active_hour: keyCount
      .refine((v) => /^(?:[01]\d|2[0-3])$/.test(v.key))
      .nullable(),
    most_active_weekday: keyCount
      .refine((v) => /^[0-6]$/.test(v.key))
      .nullable(),
    longest_user_message: topMessage.nullable(),
    longest_assistant_message: topMessage.nullable(),
    first_conversation: summary.nullable(),
    latest_conversation: summary.nullable(),
  }),
});
export const reportSchema = base.extend({
  options,
  warnings: z.array(warning),
  available_years: z.array(year),
  comparison,
});
export function restoreReport(value: unknown): WrappedData {
  const version = (value as { meta?: { schema_version?: unknown } } | null)
    ?.meta?.schema_version;
  if (version !== 1 && version !== 2)
    throw new Error("Unsupported report schema_version / 不支持的报告版本");
  const result =
    version === 1 ? base.safeParse(value) : reportSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Invalid report / 报告结构损坏: ${issue.path.join(".")} — ${issue.message}`,
    );
  }
  if (version === 2) return result.data as WrappedData;
  return {
    ...result.data,
    meta: { ...result.data.meta, schema_version: 2, parse_warning_count: 1 },
    options: { ...DEFAULT_OPTIONS, roles: "all", branches: "all" },
    warnings: [
      {
        code: "legacy_report",
        message:
          "Version 1 summary; original scope cannot be recovered / 旧版汇总，无法还原原始筛选口径",
      },
    ],
    available_years: result.data.timeline.years.map((v) => v.key),
    comparison: null,
  };
}
export function restoreReportText(text: string): WrappedData {
  if (new Blob([text]).size > MAX_REPORT_BYTES)
    throw new Error("Report import exceeds 20 MiB / 汇总报告超过 20 MiB");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid report JSON / 报告 JSON 无法解析");
  }
  return restoreReport(value);
}
export async function readReportFile(file: File): Promise<WrappedData> {
  if (file.size > MAX_REPORT_BYTES)
    throw new Error("Report import exceeds 20 MiB / 汇总报告超过 20 MiB");
  return restoreReportText(await file.text());
}
