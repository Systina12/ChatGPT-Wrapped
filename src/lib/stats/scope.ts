import type {
  JsonObject,
  ParsedConversation,
  ParsedExport,
  ParsedMessage,
  ParseWarning,
} from "../../types/export";
import { DEFAULT_OPTIONS, type ReportOptions } from "../../types/options";
import { calendarDate, dayKey, isCalendarDay, toDate } from "./time";

export function validateOptions(value: unknown): ReportOptions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid report options / 统计选项无效");
  const options = value as ReportOptions;
  if (typeof options.timezone !== "string" || !options.timezone.trim())
    throw new Error("Invalid timezone / 时区无效");
  try {
    new Intl.DateTimeFormat("en", { timeZone: options.timezone }).format();
  } catch {
    throw new Error("Invalid timezone / 时区无效");
  }
  if (
    typeof options.year !== "string" ||
    (!["all", "custom"].includes(options.year) &&
      !(/^\d{4}$/.test(options.year) && Number(options.year) > 0))
  )
    throw new Error("Invalid year / 年份无效");
  if (
    !["user", "dialogue", "all"].includes(options.roles) ||
    !["current", "all"].includes(options.branches) ||
    typeof options.includeGroups !== "boolean"
  )
    throw new Error("Invalid report option enum / 统计选项枚举无效");
  if (
    typeof options.start !== "string" ||
    typeof options.end !== "string" ||
    (options.start && !isCalendarDay(options.start)) ||
    (options.end && !isCalendarDay(options.end))
  )
    throw new Error("Invalid calendar date / 日期无效");
  if (options.start && options.end && options.start > options.end)
    throw new Error("Start date must precede end / 起始日期不能晚于结束日期");
  if (options.year === "custom" && (!options.start || !options.end))
    throw new Error(
      "Custom range requires both dates / 自定义范围需要起止日期",
    );
  return {
    timezone: options.timezone,
    year: options.year,
    start: options.start,
    end: options.end,
    roles: options.roles,
    branches: options.branches,
    includeGroups: options.includeGroups,
  };
}
export function dateBounds(options: ReportOptions): [string, string] | null {
  if (options.year === "custom") return [options.start, options.end];
  return options.year === "all"
    ? null
    : [`${options.year}-01-01`, `${options.year}-12-31`];
}
export function messageDate(message: ParsedMessage): Date | null {
  return toDate(message.createTime) || toDate(message.createTimeText);
}
export function availableYears(
  parsed: ParsedExport,
  timezone: string,
): string[] {
  const years = new Set<string>();
  for (const message of parsed.messages) {
    const date = messageDate(message);
    if (date) years.add(dayKey(calendarDate(date, timezone)).slice(0, 4));
  }
  return [...years].sort().reverse();
}
const object = (value: unknown): value is JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);
function currentNodes(
  conversation: ParsedConversation,
  warnings: ParseWarning[],
): Set<string> | null {
  const raw = object(conversation.raw) ? conversation.raw : {};
  const mapping = object(raw.mapping) ? raw.mapping : {};
  let node = conversation.currentNode;
  const warn = (code: string) =>
    warnings.push({ code, message: `${code}: ${conversation.conversationId}` });
  if (!node || !Object.hasOwn(mapping, node) || !object(mapping[node])) {
    warn("current_branch_unavailable");
    return null;
  }
  const seen = new Set<string>();
  while (node) {
    if (seen.has(node)) {
      warn("branch_cycle");
      break;
    }
    const item: unknown = mapping[node];
    if (!Object.hasOwn(mapping, node) || !object(item)) {
      warn("branch_parent_missing");
      break;
    }
    seen.add(node);
    node = typeof item.parent === "string" ? item.parent : null;
  }
  return seen;
}
export function scopeExport(
  parsed: ParsedExport,
  input: ReportOptions = DEFAULT_OPTIONS,
): ParsedExport {
  const options = validateOptions(input);
  const bounds = dateBounds(options);
  const warnings = [...parsed.warnings];
  const eligible = parsed.conversations.filter(
    (c) => options.includeGroups || c.source !== "group_chat",
  );
  const branches = new Map<string, Set<string> | null>();
  if (options.branches === "current")
    for (const c of eligible)
      if (c.source === "conversation")
        branches.set(c.conversationId, currentNodes(c, warnings));
  const eligibleIds = new Set(eligible.map((c) => c.conversationId));
  const firstTimes = new Map<string, number>();
  let undated = 0;
  const messages = parsed.messages.filter((message) => {
    if (
      (message.conversationId && !eligibleIds.has(message.conversationId)) ||
      (!options.includeGroups && message.source === "group_chat")
    )
      return false;
    const branch = message.conversationId
      ? branches.get(message.conversationId)
      : null;
    if (branch && (!message.nodeId || !branch.has(message.nodeId)))
      return false;
    if (
      (options.roles === "user" && message.role !== "user") ||
      (options.roles === "dialogue" &&
        message.role !== "user" &&
        message.role !== "assistant")
    )
      return false;
    const date = messageDate(message);
    if (bounds) {
      if (!date) {
        undated++;
        return false;
      }
      const key = dayKey(calendarDate(date, options.timezone));
      if (key < bounds[0] || key > bounds[1]) return false;
    }
    if (date && message.conversationId) {
      const time = date.getTime();
      if (time < (firstTimes.get(message.conversationId) ?? Infinity))
        firstTimes.set(message.conversationId, time);
    }
    return true;
  });
  if (undated)
    warnings.push({
      code: "undated_messages_excluded",
      message: `${undated} undated messages excluded by date range / 条无日期消息已排除`,
    });
  const conversationIds = new Set(
    messages.map((m) => m.conversationId).filter((id): id is string => !!id),
  );
  const messageKeys = new Set(
    messages.map((m) => `${m.conversationId}\0${m.messageId}`),
  );
  const messageIds = new Set(messages.map((m) => m.messageId));
  const linked = (item: {
    conversationId: string | null;
    messageId: string | null;
  }) =>
    item.messageId
      ? item.conversationId
        ? messageKeys.has(`${item.conversationId}\0${item.messageId}`)
        : messageIds.has(item.messageId)
      : !!item.conversationId && conversationIds.has(item.conversationId);
  const preserveEmpty =
    !bounds && options.roles === "all" && options.branches === "all";
  const conversations = eligible
    .filter((c) => preserveEmpty || conversationIds.has(c.conversationId))
    .map((c) => ({
      ...c,
      createTime: firstTimes.has(c.conversationId)
        ? firstTimes.get(c.conversationId)! / 1000
        : null,
      createTimeText: null,
      updateTime: null,
      updateTimeText: null,
    }));
  return {
    ...parsed,
    conversations,
    messages,
    warnings,
    assets: parsed.assets.filter(
      (a) => a.source !== "library_file" && linked(a),
    ),
    feedback: parsed.feedback.filter(linked),
    shares: parsed.shares.filter(
      (s) => !!s.conversationId && conversationIds.has(s.conversationId),
    ),
    groupChats: parsed.groupChats.filter(
      (g) => options.includeGroups && conversationIds.has(g.id),
    ),
    libraryFiles: parsed.libraryFiles.filter((f) =>
      linked({
        conversationId: f.initiatingConversationId,
        messageId: f.originationMessageId,
      }),
    ),
  };
}
