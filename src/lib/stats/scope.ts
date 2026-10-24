import type {
  ConversationSource,
  JsonObject,
  ParsedConversation,
  ParsedExport,
  ParsedFeedback,
  ParsedMessage,
  ParseWarning,
} from "../../types/export";
import { DEFAULT_OPTIONS, type ReportOptions } from "../../types/options";
import { isCalendarDay, toDate } from "./time";
import { CalendarCache } from "./calendarCache";
import { conversationMaps } from "../export/identity";

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
  if (
    options.year === "custom" &&
    options.start &&
    options.end &&
    options.start > options.end
  )
    throw new Error("Start date must precede end / 起始日期不能晚于结束日期");
  if (options.year === "custom" && (!options.start || !options.end))
    throw new Error(
      "Custom range requires both dates / 自定义范围需要起止日期",
    );
  return {
    timezone: options.timezone,
    year: options.year,
    start: options.year === "custom" ? options.start : "",
    end: options.year === "custom" ? options.end : "",
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
  cache = new CalendarCache(timezone),
): string[] {
  return cache.availableYears(parsed.messages);
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
  cache = new CalendarCache(input.timezone),
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
  const eligibleIds = conversationMaps<true>();
  for (const c of eligible) eligibleIds[c.source].set(c.conversationId, true);
  // Ancillary exports have no source field. Resolve ambiguous IDs against the
  // original message pair, indexing only references that actually need it.
  const ambiguousIds = new Set<string>();
  for (const c of parsed.conversations)
    if (
      c.source === "group_chat" &&
      eligibleIds.conversation.has(c.conversationId)
    )
      ambiguousIds.add(c.conversationId);
  const ambiguousLinks = new Map<string, Map<string, ConversationSource | null>>();
  if (ambiguousIds.size) {
    const remember = (id: string | null, mid: string | null) => {
      if (!id || !mid || !ambiguousIds.has(id)) return;
      let ids = ambiguousLinks.get(id);
      if (!ids) ambiguousLinks.set(id, (ids = new Map()));
      ids.set(mid, null);
    };
    for (const item of parsed.feedback)
      remember(item.conversationId, item.messageId);
    for (const file of parsed.libraryFiles)
      remember(file.initiatingConversationId, file.originationMessageId);
    for (const asset of parsed.assets)
      if (asset.source !== "library_file" && !asset.conversationSource)
        remember(asset.conversationId, asset.messageId);
    if (ambiguousLinks.size)
      for (const message of parsed.messages) {
        const ids = message.conversationId
          ? ambiguousLinks.get(message.conversationId)
          : undefined;
        if (
          ids?.has(message.messageId) &&
          ids.get(message.messageId) !== "conversation"
        )
          ids.set(message.messageId, message.source);
      }
  }
  // If even the full pair (or a conversation-only reference) is ambiguous,
  // ordinary-conversation ancillary exports take precedence.
  const relatedSource = (
    id: string | null,
    mid?: string | null,
  ): ConversationSource =>
    (id && mid && ambiguousLinks.get(id)?.get(mid)) ||
    (id && !eligibleIds.conversation.has(id) ? "group_chat" : "conversation");
  const firstTimes = conversationMaps<number>();
  const conversationIds = conversationMaps<true>();
  let undated = 0;
  const messages = parsed.messages.filter((message) => {
    if (
      (message.conversationId &&
        !eligibleIds[message.source].has(message.conversationId)) ||
      (!options.includeGroups && message.source === "group_chat")
    )
      return false;
    const branch =
      message.source === "conversation" && message.conversationId
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
    const { createdAt: date, day } = cache.forMessage(message);
    if (bounds) {
      if (!date) {
        undated++;
        return false;
      }
      const key = day!;
      if (key < bounds[0] || key > bounds[1]) return false;
    }
    if (date && message.conversationId) {
      const time = date.getTime();
      const times = firstTimes[message.source];
      if (time < (times.get(message.conversationId) ?? Infinity))
        times.set(message.conversationId, time);
    }
    if (message.conversationId) {
      conversationIds[message.source].set(message.conversationId, true);
    }
    return true;
  });
  if (undated)
    warnings.push({
      code: "undated_messages_excluded",
      message: `${undated} undated messages excluded by date range / 条无日期消息已排除`,
    });
  // Index the smaller side of the selection/reference join. Text-heavy exports
  // need no message-sized index; narrow selections need no attachment-sized one.
  // Nested maps preserve exact pairs without delimiter-key collisions.
  const scopedLinks = conversationMaps<Map<string, boolean>>();
  // Without a conversation ID, references intentionally match any selected
  // message with that ID, preserving the existing unscoped-reference contract.
  const unscopedLinks = new Map<string, boolean>();
  const forEachReference = (
    visit: (
      source: ConversationSource,
      conversationId: string | null,
      messageId: string,
    ) => void,
  ) => {
    const include = (
      conversationId: string | null,
      messageId: string | null,
      source: ConversationSource = relatedSource(conversationId, messageId),
    ) => {
      if (
        messageId &&
        (!conversationId || conversationIds[source].has(conversationId))
      )
        visit(source, conversationId, messageId);
    };
    for (const asset of parsed.assets)
      if (asset.source !== "library_file")
        include(asset.conversationId, asset.messageId, asset.conversationSource);
    for (const item of parsed.feedback)
      include(item.conversationId, item.messageId, item.conversationSource);
    for (const file of parsed.libraryFiles)
      include(file.initiatingConversationId, file.originationMessageId);
  };
  const reference = (
    source: ConversationSource,
    conversationId: string | null,
    messageId: string,
    selected = false,
  ) => {
    if (!conversationId) {
      unscopedLinks.set(messageId, selected);
      return;
    }
    let ids = scopedLinks[source].get(conversationId);
    if (!ids) scopedLinks[source].set(conversationId, (ids = new Map()));
    ids.set(messageId, selected);
  };
  let referenceCount = 0;
  let hasUnscoped = false;
  forEachReference((_source, conversationId) => {
    referenceCount++;
    if (!conversationId) hasUnscoped = true;
  });
  if (referenceCount > messages.length) {
    for (const message of messages) {
      if (message.conversationId)
        reference(message.source, message.conversationId, message.messageId, true);
      if (hasUnscoped) unscopedLinks.set(message.messageId, true);
    }
  } else if (referenceCount) {
    forEachReference(reference);
    for (const message of messages) {
      const ids = message.conversationId
        ? scopedLinks[message.source].get(message.conversationId)
        : undefined;
      if (ids?.has(message.messageId)) ids.set(message.messageId, true);
      if (unscopedLinks.has(message.messageId))
        unscopedLinks.set(message.messageId, true);
    }
  }
  const linked = (item: {
    conversationSource?: ConversationSource;
    conversationId: string | null;
    messageId: string | null;
  }) => {
    if (!item.conversationId)
      return !!item.messageId && unscopedLinks.get(item.messageId) === true;
    const source =
      item.conversationSource || relatedSource(item.conversationId, item.messageId);
    return item.messageId
      ? scopedLinks[source].get(item.conversationId)?.get(item.messageId) === true
      : conversationIds[source].has(item.conversationId);
  };
  const preserveEmpty =
    !bounds && options.roles === "all" && options.branches === "all";
  const conversations = eligible
    .filter((c) => preserveEmpty || conversationIds[c.source].has(c.conversationId))
    .map((c) => ({
      ...c,
      createTime: firstTimes[c.source].has(c.conversationId)
        ? firstTimes[c.source].get(c.conversationId)! / 1000
        : null,
      createTimeText: null,
      updateTime: null,
      updateTimeText: null,
    }));
  const feedback: ParsedFeedback[] = [];
  for (const item of parsed.feedback) {
    if (!linked(item)) continue;
    const source =
      item.conversationSource || relatedSource(item.conversationId, item.messageId);
    feedback.push(
      source === "group_chat" && !item.conversationSource
        ? { ...item, conversationSource: source }
        : item,
    );
  }
  return {
    ...parsed,
    conversations,
    messages,
    warnings,
    assets: parsed.assets.filter(
      (a) => a.source !== "library_file" && linked(a),
    ),
    feedback,
    shares: parsed.shares.filter(
      (s) =>
        !!s.conversationId &&
        conversationIds[relatedSource(s.conversationId)].has(s.conversationId),
    ),
    groupChats: parsed.groupChats.filter(
      (g) => options.includeGroups && conversationIds.group_chat.has(g.id),
    ),
    libraryFiles: parsed.libraryFiles.filter((f) =>
      linked({
        conversationId: f.initiatingConversationId,
        messageId: f.originationMessageId,
      }),
    ),
  };
}
