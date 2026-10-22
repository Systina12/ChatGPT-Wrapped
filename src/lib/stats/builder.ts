import { mergeAssets, classifyAsset, assetExtension } from "../export/assets";
import type {
  ParsedAsset,
  ParsedConversation,
  ParsedExport,
  ParsedMessage,
} from "../../types/export";
import type {
  ActivityStats,
  AssetCategory,
  AssetStats,
  ConversationStats,
  ConversationSummary,
  DayPeriod,
  Distribution,
  FrequentWordStats,
  HighlightStats,
  KeyCount,
  LanguageStats,
  LargestAsset,
  MessageStats,
  MetricBucket,
  ModelStats,
  ModelUsage,
  OverviewStats,
  QualityStats,
  TimelineBucket,
  TimelineStats,
  TopConversation,
  TopMessage,
  WrappedData,
  WrappedMeta,
} from "../../types/wrapped";
import {
  excerpt,
  textTerms,
  topTerms,
  messageTextStats,
  forEachTermCount,
} from "./text";
import { topK } from "./topK";
import {
  calendarDate,
  dayOrdinal,
  dayKey,
  dayPeriod,
  hourKey,
  isoOrNull,
  longestGap,
  longestStreak,
  monthKey,
  toDate,
  weekdayKey,
  yearKey,
} from "./time";

import { CalendarCache } from "./calendarCache";

const TOP_N = 20;

interface MessageWithStats {
  message: ParsedMessage;
  day: string | null;
  characterCount: number;
  createdAt: Date | null;
  calendarAt: Date | null;
  textStats: ReturnType<typeof messageTextStats>;
}

interface AssetWithStats extends ParsedAsset {
  category: AssetCategory;
}

interface BuildContext {
  timezone: string;
  parsed: ParsedExport;
  conversations: ParsedConversation[];
  messages: MessageWithStats[];
  assets: AssetWithStats[];
  aggregates?: ConversationAggregate[];
  messageTimes?: Map<string, Date | null>;
}

interface ConversationAggregate {
  rowId: number;
  conversationId: string;
  source: string;
  title: string | null;
  createdAt: Date | null;
  createdAtText: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  characterCount: number;
  userCharacterCount: number;
  assistantCharacterCount: number;
  assetCount: number;
  isArchived: boolean;
  isStarred: boolean;
  isShared: boolean;
}

function buildContext(
  parsed: ParsedExport,
  timezone: string,
  cache: CalendarCache,
): BuildContext {
  return {
    parsed,
    timezone,
    conversations: parsed.conversations,
    messages: parsed.messages.map((message) => {
      const textStats = messageTextStats(message);
      return {
        message,
        characterCount: textStats.characterCount,
        textStats,
        ...cache.forMessage(message),
      };
    }),
    assets: mergeAssets(parsed.assets).map((asset) => ({
      ...asset,
      category: classifyAsset(asset),
    })),
  };
}

export function buildOverviewData(
  parsed: ParsedExport,
  timezone: string,
  cache: CalendarCache,
): OverviewStats {
  function* messages() {
    for (const message of parsed.messages)
      yield {
        message,
        characterCount: messageTextStats(message).characterCount,
        createdAt: cache.forMessage(message).createdAt,
      };
  }
  const assets = mergeAssets(parsed.assets).map((asset) => ({
    ...asset,
    category: classifyAsset(asset),
  }));
  return overviewFor(
    parsed.conversations.length,
    messages(),
    dedupedAssetCounts(assets),
    timezone,
  );
}

export function buildWrappedData(
  parsed: ParsedExport,
  timezone = "UTC",
  cache = new CalendarCache(timezone),
  onProgress?: (completed: number) => void,
): WrappedData {
  const context = buildContext(parsed, timezone, cache);
  onProgress?.(1);
  const timelineStats = timeline(context);
  onProgress?.(2);
  const activityStats = activity(context.messages);
  onProgress?.(3);
  const modelStatsValue = modelStats(context.messages);
  onProgress?.(4);
  const conversations = conversationStats(context);
  onProgress?.(5);
  const messages = messageStats(context.messages);
  onProgress?.(6);
  const assets = assetStats(context);
  onProgress?.(7);
  const language = languageStats(context.messages);
  onProgress?.(8);
  const frequent_words = frequentWords(context.messages, (fraction) =>
    onProgress?.(8 + fraction),
  );
  onProgress?.(9);
  const quality = qualityStats(context, conversations);
  const highlightStats = highlights(
    context,
    timelineStats,
    activityStats,
    modelStatsValue,
    conversations,
    messages,
    quality,
  );
  onProgress?.(10);
  return {
    meta: meta(context),
    overview: overview(context),
    timeline: timelineStats,
    activity: activityStats,
    conversations,
    messages,
    models: modelStatsValue,
    assets,
    language,
    frequent_words,
    quality,
    highlights: highlightStats,
  };
}

function meta(context: BuildContext): WrappedMeta {
  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    table_counts: {
      source_files: context.parsed.sourceFiles.length,
      metadata: Object.keys(context.parsed.metadata).length,
      conversations: context.parsed.conversations.length,
      messages: context.parsed.messages.length,
      assets: context.parsed.assets.length,
      asset_name_map: Object.keys(context.parsed.assetNameMap).length,
      library_files: context.parsed.libraryFiles.length,
      feedback: context.parsed.feedback.length,
      shares: context.parsed.shares.length,
      group_chats: context.parsed.groupChats.length,
      users: context.parsed.users.length,
      settings: context.parsed.settings.length,
      parse_warnings: context.parsed.warnings.length,
    },
    parse_warning_count: context.parsed.warnings.length,
  };
}

function overview(context: BuildContext): OverviewStats {
  return overviewFor(
    context.conversations.length,
    context.messages,
    dedupedAssetCounts(context.assets),
    context.timezone,
  );
}

function overviewFor(
  conversationCount: number,
  messages: Iterable<
    Pick<MessageWithStats, "message" | "characterCount" | "createdAt">
  >,
  assetCounts: Record<AssetCategory, number>,
  timezone: string,
): OverviewStats {
  let users = 0,
    assistants = 0,
    userCharacters = 0,
    assistantCharacters = 0,
    characters = 0;
  let first: Date | null = null,
    last: Date | null = null;
  for (const item of messages) {
    characters += item.characterCount;
    if (item.message.role === "user") {
      users++;
      userCharacters += item.characterCount;
    }
    if (item.message.role === "assistant") {
      assistants++;
      assistantCharacters += item.characterCount;
    }
    if (item.createdAt) {
      first = minDate(first, item.createdAt);
      last = maxDate(last, item.createdAt);
    }
  }
  return {
    conversation_count: conversationCount,
    user_message_count: users,
    assistant_message_count: assistants,
    image_count: assetCounts.image,
    file_count: assetCounts.file,
    voice_count: assetCounts.voice,
    user_character_count: userCharacters,
    assistant_character_count: assistantCharacters,
    total_character_count: characters,
    first_seen_at: isoOrNull(first),
    last_seen_at: isoOrNull(last),
    known_days:
      first && last
        ? dayOrdinal(dayKey(calendarDate(last, timezone))) -
          dayOrdinal(dayKey(calendarDate(first, timezone))) +
          1
        : null,
  };
}

function timeline(context: BuildContext): TimelineStats {
  const buckets = {
    years: new Map<string, MetricBucket>(),
    months: new Map<string, MetricBucket>(),
    days: new Map<string, MetricBucket>(),
  };

  context.conversations.forEach((conversation) => {
    const createdAt = firstDate(
      conversation.createTime,
      conversation.createTimeText,
    );
    if (createdAt) {
      addBucketMetric(
        buckets,
        calendarDate(createdAt, context.timezone),
        "conversation_count",
        1,
      );
    }
  });

  context.messages.forEach((message) => {
    if (!message.createdAt) {
      return;
    }
    const role = message.message.role || "unknown";
    // Resolve each bucket once for all four message metrics.
    const day = message.day!;
    for (const [map, key] of [
      [buckets.years, day.slice(0, 4)],
      [buckets.months, day.slice(0, 7)],
      [buckets.days, day],
    ] as const) {
      let bucket = map.get(key);
      if (!bucket) map.set(key, (bucket = metricBucket()));
      bucket.message_count++;
      bucket.character_count += message.characterCount;
      bucket[`${role}_message_count`] =
        (bucket[`${role}_message_count`] || 0) + 1;
      bucket[`${role}_character_count`] =
        (bucket[`${role}_character_count`] || 0) + message.characterCount;
    }
  });

  const messageTimes = selectedMessageTimes(context);
  context.assets.forEach((asset) => {
    if (asset.source === "library_file") {
      return;
    }
    const createdAt = asset.messageId
      ? messageTimes.get(`${asset.conversationId}\0${asset.messageId}`)
      : null;
    if (createdAt) {
      addBucketMetric(buckets, createdAt, `${asset.category}_count`, 1);
    }
  });

  const days = [...buckets.days.entries()]
    .filter(([, value]) => value.message_count > 0)
    .map(([key]) => key)
    .sort();
  return {
    years: sortedBucket(buckets.years),
    months: sortedBucket(buckets.months),
    days: sortedBucket(buckets.days),
    most_active_day: maxBucket(buckets.days, "message_count"),
    most_active_month: maxBucket(buckets.months, "message_count"),
    most_active_year: maxBucket(buckets.years, "message_count"),
    longest_active_streak: longestStreak(days),
    longest_inactive_gap: longestGap(days),
  };
}

function activity(messages: MessageWithStats[]): ActivityStats {
  const byHour = Object.fromEntries(
    Array.from({ length: 24 }, (_, index) => [
      String(index).padStart(2, "0"),
      0,
    ]),
  );
  const byWeekday = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [String(index), 0]),
  );
  const byPeriod: Record<DayPeriod, number> = {
    late_night: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
  };
  const weekdayVsWeekend = { weekday: 0, weekend: 0 };

  messages.forEach((message) => {
    if (!message.createdAt) {
      return;
    }
    byHour[hourKey(message.calendarAt!)] += 1;
    byWeekday[weekdayKey(message.calendarAt!)] += 1;
    byPeriod[dayPeriod(message.calendarAt!)] += 1;
    weekdayVsWeekend[
      message.calendarAt!.getUTCDay() === 0 ||
      message.calendarAt!.getUTCDay() === 6
        ? "weekend"
        : "weekday"
    ] += 1;
  });

  return {
    by_hour: byHour,
    by_weekday: byWeekday,
    by_day_period: byPeriod,
    weekday_vs_weekend: weekdayVsWeekend,
    most_active_hour: maxMapping(byHour),
    most_active_weekday: maxMapping(byWeekday),
  };
}

function conversationStats(context: BuildContext): ConversationStats {
  const ordinary = selectedAggregates(context);
  const ranking = topConversations(ordinary, "messageCount", ordinary.length);
  return {
    message_count_distribution: distribution(
      ordinary.map((item) => item.messageCount),
    ),
    character_count_distribution: distribution(
      ordinary.map((item) => item.characterCount),
    ),
    short_conversation_count: ordinary.filter((item) => item.messageCount <= 2)
      .length,
    long_conversation_count: ordinary.filter((item) => item.messageCount >= 30)
      .length,
    archived_count: ordinary.filter((item) => item.isArchived).length,
    starred_count: ordinary.filter((item) => item.isStarred).length,
    shared_count: ordinary.filter((item) => item.isShared).length,
    longest_by_messages: ranking.slice(0, TOP_N),
    longest_by_characters: topConversations(ordinary, "characterCount"),
    most_assets: topConversations(ordinary, "assetCount"),
    ranking,
    earliest: firstConversation(ordinary),
    latest: lastConversation(ordinary),
  };
}

function messageStats(messages: MessageWithStats[]): MessageStats {
  const user = messages.filter((message) => message.message.role === "user");
  const assistant = messages.filter(
    (message) => message.message.role === "assistant",
  );
  const punctuation = { question_marks: 0, exclamation_marks: 0 };
  let urls = 0;
  let codeBlocks = 0;

  messages.forEach((message) => {
    const counts = message.textStats;
    punctuation.question_marks += counts.question_marks;
    punctuation.exclamation_marks += counts.exclamation_marks;
    urls += counts.urls;
    codeBlocks += counts.codeBlocks;
  });

  return {
    user_length_distribution: distribution(
      user.map((message) => message.characterCount),
    ),
    assistant_length_distribution: distribution(
      assistant.map((message) => message.characterCount),
    ),
    all_length_distribution: distribution(
      messages.map((message) => message.characterCount),
    ),
    user_to_assistant_character_ratio: safeRatio(
      sum(user.map((message) => message.characterCount)),
      sum(assistant.map((message) => message.characterCount)),
    ),
    question_marks: punctuation.question_marks,
    exclamation_marks: punctuation.exclamation_marks,
    url_count: urls,
    code_block_count: codeBlocks,
    longest_user_messages: topMessages(user),
    longest_assistant_messages: topMessages(assistant),
  };
}

function modelStats(messages: MessageWithStats[]): ModelStats {
  const byModel = new Map<
    string,
    {
      messageCount: number;
      characterCount: number;
      firstSeenAt: Date | null;
      lastSeenAt: Date | null;
    }
  >();
  const monthly = new Map<string, Map<string, number>>();

  messages
    .filter((message) => message.message.role === "assistant")
    .forEach((message) => {
      const model = message.message.modelSlug || "unknown";
      const stats = byModel.get(model) || {
        messageCount: 0,
        characterCount: 0,
        firstSeenAt: null,
        lastSeenAt: null,
      };
      stats.messageCount += 1;
      stats.characterCount += message.characterCount;
      if (message.createdAt) {
        stats.firstSeenAt = minDate(stats.firstSeenAt, message.createdAt);
        stats.lastSeenAt = maxDate(stats.lastSeenAt, message.createdAt);
        const month = message.day!.slice(0, 7);
        const monthCounter = monthly.get(month) || new Map<string, number>();
        monthCounter.set(model, (monthCounter.get(model) || 0) + 1);
        monthly.set(month, monthCounter);
      }
      byModel.set(model, stats);
    });

  const models: ModelUsage[] = [...byModel.entries()]
    .map(([model, stats]) => ({
      model,
      message_count: stats.messageCount,
      character_count: stats.characterCount,
      first_seen_at: isoOrNull(stats.firstSeenAt),
      last_seen_at: isoOrNull(stats.lastSeenAt),
    }))
    .sort((left, right) => right.message_count - left.message_count);

  return {
    models,
    most_used_model: models.find((model) => model.model !== "unknown") || null,
    monthly_primary_model: Object.fromEntries(
      [...monthly.entries()]
        .sort()
        .map(([month, counter]) => [
          month,
          maxMapping(
            Object.fromEntries(
              [...counter].filter(([name]) => name !== "unknown"),
            ),
          )?.key || null,
        ]),
    ),
  };
}

function assetStats(context: BuildContext): AssetStats {
  const messageTimes = selectedMessageTimes(context);
  const usableAssets = context.assets.filter(
    (asset) => asset.source !== "library_file",
  );
  const mime = counter(
    usableAssets.map((asset) => asset.mimeType || "unknown"),
  );
  const extensions = counter(
    usableAssets.map((asset) => assetExtension(asset) || "unknown"),
  );
  const monthly = new Map<string, Map<string, number>>();

  usableAssets.forEach((asset) => {
    const createdAt = asset.messageId
      ? messageTimes.get(`${asset.conversationId}\0${asset.messageId}`)
      : null;
    if (!createdAt) {
      return;
    }
    const month = monthKey(createdAt);
    const monthCounter = monthly.get(month) || new Map<string, number>();
    monthCounter.set(
      asset.category,
      (monthCounter.get(asset.category) || 0) + 1,
    );
    monthly.set(month, monthCounter);
  });

  return {
    total_count: usableAssets.length,
    by_category: Object.fromEntries(
      counter(usableAssets.map((asset) => asset.category)),
    ),
    by_mime_type: counterItems(mime),
    by_extension: counterItems(extensions),
    size_distribution: distribution(
      usableAssets.map((asset) => asset.sizeBytes || 0),
    ),
    monthly: Object.fromEntries(
      [...monthly.entries()]
        .sort()
        .map(([month, values]) => [month, Object.fromEntries(values)]),
    ),
    largest_assets: largestAssets(usableAssets),
  };
}

function languageStats(messages: MessageWithStats[]): LanguageStats {
  const totals = {
    chinese_characters: 0,
    english_words: 0,
    digit_characters: 0,
  };
  const buckets = new Map<string, number>();
  messages.forEach((message) => {
    const counts = message.textStats;
    totals.chinese_characters += counts.chinese_characters;
    totals.english_words += counts.english_words;
    totals.digit_characters += counts.digit_characters;
    incrementMap(buckets, counts.bucket);
  });
  return {
    totals,
    message_buckets: Object.fromEntries(buckets),
  };
}

function frequentWords(
  messages: MessageWithStats[],
  progress?: (fraction: number) => void,
): FrequentWordStats {
  const all = new Map<string, number>(),
    user = new Map<string, number>(),
    assistant = new Map<string, number>();
  const monthly = new Map<string, Map<string, number>>();
  const add = (counter: Map<string, number>, term: string, amount = 1) =>
    counter.set(term, (counter.get(term) || 0) + amount);
  const interval = Math.max(1000, Math.ceil(messages.length / 50));
  messages.forEach((message, index) => {
    const month = message.day?.slice(0, 7) ?? null;
    let monthCounter = month ? monthly.get(month) : undefined;
    if (month && !monthCounter) {
      monthCounter = new Map();
      monthly.set(month, monthCounter);
    }
    const text = message.message.text || "";
    if (text.length > 4096) {
      forEachTermCount(text, (term, count) => {
        add(all, term, count);
        if (message.message.role === "user") add(user, term, count);
        if (message.message.role === "assistant") add(assistant, term, count);
        if (monthCounter) add(monthCounter, term, count);
      });
    } else
      for (const term of textTerms(text)) {
        add(all, term);
        if (message.message.role === "user") add(user, term);
        if (message.message.role === "assistant") add(assistant, term);
        if (monthCounter) add(monthCounter, term);
      }
    if ((index + 1) % interval === 0) progress?.((index + 1) / messages.length);
  });
  return {
    all: topTerms(all, 50),
    user: topTerms(user, 50),
    assistant: topTerms(assistant, 50),
    monthly: Object.fromEntries(
      [...monthly]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, counter]) => [month, topTerms(counter, 10)]),
    ),
  };
}

function qualityStats(
  context: BuildContext,
  conversations: ConversationStats,
): QualityStats {
  return {
    feedback_count: context.parsed.feedback.length,
    feedback_by_rating: Object.fromEntries(
      counter(context.parsed.feedback.map((item) => item.rating || "unknown")),
    ),
    shared_conversation_count: new Set(
      context.parsed.shares.map((item) => item.conversationId).filter(Boolean),
    ).size,
    conversations_with_feedback_count: new Set(
      context.parsed.feedback
        .map((item) => item.conversationId)
        .filter(Boolean),
    ).size,
    high_interaction_conversations: conversations.longest_by_messages,
    high_asset_conversations: conversations.most_assets,
    high_character_conversations: conversations.longest_by_characters,
  };
}

function highlights(
  context: BuildContext,
  timelineStats: TimelineStats,
  activityStats: ActivityStats,
  modelStatsValue: ModelStats,
  conversations: ConversationStats,
  messages: MessageStats,
  quality: QualityStats,
): HighlightStats {
  const ordinary = selectedAggregates(context);
  return {
    most_active_day: timelineStats.most_active_day,
    most_active_month: timelineStats.most_active_month,
    longest_conversation_by_messages:
      conversations.longest_by_messages[0] || null,
    longest_conversation_by_characters:
      conversations.longest_by_characters[0] || null,
    most_asset_conversation: quality.high_asset_conversations[0] || null,
    most_used_model: modelStatsValue.most_used_model,
    most_active_hour: activityStats.most_active_hour,
    most_active_weekday: activityStats.most_active_weekday,
    longest_user_message: messages.longest_user_messages[0] || null,
    longest_assistant_message: messages.longest_assistant_messages[0] || null,
    first_conversation: firstConversation(ordinary),
    latest_conversation: lastConversation(ordinary),
  };
}

function conversationAggregates(
  context: BuildContext,
): ConversationAggregate[] {
  const aggregates = new Map<number, ConversationAggregate>();
  context.conversations.forEach((conversation) => {
    const createdAt = firstDate(
      conversation.createTime,
      conversation.createTimeText,
    );
    aggregates.set(conversation.rowId, {
      rowId: conversation.rowId,
      conversationId: conversation.conversationId,
      source: conversation.source,
      title: conversation.title,
      createdAt,
      createdAtText: isoOrNull(createdAt),
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      characterCount: 0,
      userCharacterCount: 0,
      assistantCharacterCount: 0,
      assetCount: 0,
      isArchived: Boolean(conversation.isArchived),
      isStarred: Boolean(conversation.isStarred),
      isShared: Boolean(conversation.isShared),
    });
  });

  const byConversationId = new Map<string, number[]>();
  aggregates.forEach((item) => {
    const rows = byConversationId.get(item.conversationId) || [];
    rows.push(item.rowId);
    byConversationId.set(item.conversationId, rows);
  });

  context.messages.forEach((message) => {
    if (!message.message.conversationId) {
      return;
    }
    const rowId = byConversationId.get(message.message.conversationId)?.[0];
    const aggregate = rowId ? aggregates.get(rowId) : undefined;
    if (!aggregate) {
      return;
    }
    aggregate.messageCount += 1;
    aggregate.characterCount += message.characterCount;
    if (message.message.role === "user") {
      aggregate.userMessageCount += 1;
      aggregate.userCharacterCount += message.characterCount;
    } else if (message.message.role === "assistant") {
      aggregate.assistantMessageCount += 1;
      aggregate.assistantCharacterCount += message.characterCount;
    }
  });

  context.assets.forEach((asset) => {
    if (asset.source === "library_file" || !asset.conversationId) {
      return;
    }
    const rowId = byConversationId.get(asset.conversationId)?.[0];
    const aggregate = rowId ? aggregates.get(rowId) : undefined;
    if (aggregate) {
      aggregate.assetCount += 1;
    }
  });

  return [...aggregates.values()];
}

function selectedAggregates(context: BuildContext): ConversationAggregate[] {
  return (context.aggregates ??= conversationAggregates(context));
}

function selectedMessageTimes(context: BuildContext) {
  if (!context.messageTimes) {
    context.messageTimes = new Map();
    // Resolve only messages actually referenced by attachments. A text-heavy
    // export must not allocate a second string-keyed index for every message.
    const wanted = new Map<string | null, Set<string>>();
    for (const asset of context.assets) {
      if (asset.source === "library_file" || !asset.messageId) continue;
      let ids = wanted.get(asset.conversationId);
      if (!ids) wanted.set(asset.conversationId, (ids = new Set()));
      ids.add(asset.messageId);
    }
    if (wanted.size)
      for (const item of context.messages) {
        const message = item.message;
        if (wanted.get(message.conversationId)?.has(message.messageId))
          context.messageTimes.set(
            `${message.conversationId}\0${message.messageId}`,
            item.calendarAt,
          );
      }
  }
  return context.messageTimes;
}

function metricBucket(): MetricBucket {
  return {
    conversation_count: 0,
    message_count: 0,
    user_message_count: 0,
    assistant_message_count: 0,
    character_count: 0,
    user_character_count: 0,
    assistant_character_count: 0,
    image_count: 0,
    file_count: 0,
    voice_count: 0,
  };
}

function addBucketMetric(
  buckets: {
    years: Map<string, MetricBucket>;
    months: Map<string, MetricBucket>;
    days: Map<string, MetricBucket>;
  },
  date: Date,
  metric: string,
  amount: number,
): void {
  const targets: Array<[Map<string, MetricBucket>, string]> = [
    [buckets.years, yearKey(date)],
    [buckets.months, monthKey(date)],
    [buckets.days, dayKey(date)],
  ];

  targets.forEach(([bucket, key]) => {
    const current = bucket.get(key) || metricBucket();
    current[metric] = (current[metric] || 0) + amount;
    bucket.set(key, current);
  });
}

function sortedBucket(bucket: Map<string, MetricBucket>): TimelineBucket[] {
  return [...bucket.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, ...value }));
}

function maxBucket(
  bucket: Map<string, MetricBucket>,
  metric: string,
): TimelineBucket | null {
  const items = [...bucket.entries()];
  if (items.length === 0) {
    return null;
  }
  const [key, value] = items.reduce((best, item) =>
    (item[1][metric] || 0) > (best[1][metric] || 0) ? item : best,
  );
  return (value[metric] || 0) > 0 ? { key, ...value } : null;
}

function maxMapping(values: Record<string, number>): KeyCount | null {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return null;
  }
  const [key, count] = entries.reduce((best, item) =>
    item[1] > best[1] ? item : best,
  );
  return count > 0 ? { key, count } : null;
}

function topConversations(
  items: ConversationAggregate[],
  metric: keyof ConversationAggregate,
  limit = TOP_N,
): TopConversation[] {
  const compare = (left: ConversationAggregate, right: ConversationAggregate) =>
    Number(right[metric] || 0) - Number(left[metric] || 0);
  return (
    limit >= items.length
      ? [...items].sort(compare)
      : topK(items, limit, compare)
  ).map((item) => ({
    conversation_id: item.conversationId,
    title: item.title,
    created_at: item.createdAtText,
    message_count: item.messageCount,
    user_message_count: item.userMessageCount,
    assistant_message_count: item.assistantMessageCount,
    character_count: item.characterCount,
    asset_count: item.assetCount,
    value: typeof item[metric] === "number" ? item[metric] : null,
  }));
}

function topMessages(
  messages: MessageWithStats[],
  limit = TOP_N,
): TopMessage[] {
  return topK(
    messages,
    limit,
    (left, right) => right.characterCount - left.characterCount,
  ).map((message) => ({
    message_id: message.message.messageId,
    conversation_id: message.message.conversationId,
    role: message.message.role,
    created_at: isoOrNull(message.createdAt),
    character_count: message.characterCount,
    text_excerpt: excerpt(message.message.text, 360),
  }));
}

function largestAssets(
  assets: AssetWithStats[],
  limit = TOP_N,
): LargestAsset[] {
  return topK(
    assets.filter(
      (asset) =>
        asset.sizeBytes !== null &&
        Number.isSafeInteger(asset.sizeBytes) &&
        asset.sizeBytes >= 0,
    ),
    limit,
    (left, right) => (right.sizeBytes || 0) - (left.sizeBytes || 0),
  ).map((asset) => ({
    local_path: asset.localPath,
    display_name: asset.displayName,
    category: asset.category,
    mime_type: asset.mimeType,
    file_extension: asset.fileExtension,
    size_bytes: asset.sizeBytes,
    conversation_id: asset.conversationId,
    message_id: asset.messageId,
  }));
}

function firstConversation(
  items: ConversationAggregate[],
): ConversationSummary | null {
  const dated = items.filter((item) => item.createdAt);
  if (dated.length === 0) {
    return null;
  }
  return conversationSummary(
    dated.reduce((best, item) =>
      item.createdAt! < best.createdAt! ? item : best,
    ),
  );
}

function lastConversation(
  items: ConversationAggregate[],
): ConversationSummary | null {
  const dated = items.filter((item) => item.createdAt);
  if (dated.length === 0) {
    return null;
  }
  return conversationSummary(
    dated.reduce((best, item) =>
      item.createdAt! > best.createdAt! ? item : best,
    ),
  );
}

function conversationSummary(item: ConversationAggregate): ConversationSummary {
  return {
    conversation_id: item.conversationId,
    title: item.title,
    created_at: item.createdAtText,
    message_count: item.messageCount,
    character_count: item.characterCount,
  };
}

function distribution(values: number[]): Distribution {
  const buckets: Distribution = {
    zero: 0,
    one_to_two: 0,
    three_to_five: 0,
    six_to_ten: 0,
    eleven_to_thirty: 0,
    thirty_one_to_one_hundred: 0,
    over_one_hundred: 0,
  };
  values.forEach((value) => {
    if (value <= 0) buckets.zero += 1;
    else if (value <= 2) buckets.one_to_two += 1;
    else if (value <= 5) buckets.three_to_five += 1;
    else if (value <= 10) buckets.six_to_ten += 1;
    else if (value <= 30) buckets.eleven_to_thirty += 1;
    else if (value <= 100) buckets.thirty_one_to_one_hundred += 1;
    else buckets.over_one_hundred += 1;
  });
  return buckets;
}

function dedupedAssetCounts(
  assets: AssetWithStats[],
): Record<AssetCategory, number> {
  const result = { image: 0, voice: 0, file: 0 };
  for (const asset of assets)
    if (asset.source !== "library_file") result[asset.category]++;
  return result;
}

function counter(values: Iterable<string>): Map<string, number> {
  const output = new Map<string, number>();
  for (const value of values) {
    incrementMap(output, value);
  }
  return output;
}

function counterItems(values: Map<string, number>): KeyCount[] {
  return [...values.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([key, count]) => ({ key, count }));
}

function incrementMap(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) || 0) + amount);
}

function firstDate(numeric: unknown, text: unknown): Date | null {
  return toDate(numeric) || toDate(text);
}

function minDate(left: Date | null, right: Date): Date {
  return left && left < right ? left : right;
}

function maxDate(left: Date | null, right: Date): Date {
  return left && left > right ? left : right;
}

function safeRatio(left: number, right: number): number | null {
  return right === 0 ? null : Math.round((left / right) * 10_000) / 10_000;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
