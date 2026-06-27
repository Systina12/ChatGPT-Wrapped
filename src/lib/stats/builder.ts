import type { ParsedAsset, ParsedConversation, ParsedExport, ParsedMessage } from "../../types/export";
import type { Distribution, MetricBucket, TopConversation, TopMessage, WrappedData } from "../../types/wrapped";
import {
  codeBlockCount,
  excerpt,
  frequentTerms,
  languageBucket,
  languageCounts,
  punctuationCounts,
  urlCount,
  visibleCharCount,
} from "./text";
import {
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

const TOP_N = 20;

interface MessageWithStats extends ParsedMessage {
  characterCount: number;
  createdAt: Date | null;
}

interface AssetWithStats extends ParsedAsset {
  category: "image" | "voice" | "file";
}

interface BuildContext {
  parsed: ParsedExport;
  conversations: ParsedConversation[];
  messages: MessageWithStats[];
  assets: AssetWithStats[];
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

export function buildWrappedData(parsed: ParsedExport): WrappedData {
  const context: BuildContext = {
    parsed,
    conversations: parsed.conversations,
    messages: parsed.messages.map((message) => ({
      ...message,
      characterCount: visibleCharCount(message.text),
      createdAt: firstDate(message.createTime, message.createTimeText),
    })),
    assets: parsed.assets.map((asset) => ({ ...asset, category: assetCategory(asset) })),
  };

  return {
    meta: meta(context),
    overview: overview(context),
    timeline: timeline(context),
    activity: activity(context.messages),
    conversations: conversationStats(context),
    messages: messageStats(context.messages),
    models: modelStats(context.messages),
    assets: assetStats(context),
    language: languageStats(context.messages),
    frequent_words: frequentWords(context.messages),
    quality: qualityStats(context),
    highlights: highlights(context),
  };
}

function meta(context: BuildContext): WrappedData["meta"] {
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

function overview(context: BuildContext): Record<string, unknown> {
  const userMessages = context.messages.filter((message) => message.role === "user");
  const assistantMessages = context.messages.filter((message) => message.role === "assistant");
  const userCharacterCount = sum(userMessages.map((message) => message.characterCount));
  const assistantCharacterCount = sum(assistantMessages.map((message) => message.characterCount));
  const instants = [
    ...context.conversations.flatMap((conversation) => [
      toDate(conversation.createTime),
      toDate(conversation.updateTime),
      toDate(conversation.createTimeText),
      toDate(conversation.updateTimeText),
    ]),
    ...context.messages.flatMap((message) => [
      toDate(message.createTime),
      toDate(message.updateTime),
      toDate(message.createTimeText),
      toDate(message.updateTimeText),
    ]),
  ].filter(isDate);
  const first = instants.length ? new Date(Math.min(...instants.map((date) => date.getTime()))) : null;
  const last = instants.length ? new Date(Math.max(...instants.map((date) => date.getTime()))) : null;
  const assetCounts = dedupedAssetCounts(context.assets);

  return {
    conversation_count: context.conversations.filter((conversation) => conversation.source === "conversation").length,
    user_message_count: userMessages.length,
    assistant_message_count: assistantMessages.length,
    image_count: assetCounts.image,
    file_count: assetCounts.file,
    voice_count: assetCounts.voice,
    user_character_count: userCharacterCount,
    assistant_character_count: assistantCharacterCount,
    total_character_count: userCharacterCount + assistantCharacterCount,
    first_seen_at: isoOrNull(first),
    last_seen_at: isoOrNull(last),
    known_days: first && last ? daysInclusive(first, last) : null,
  };
}

function timeline(context: BuildContext): Record<string, unknown> {
  const buckets = {
    years: new Map<string, MetricBucket>(),
    months: new Map<string, MetricBucket>(),
    days: new Map<string, MetricBucket>(),
  };

  context.conversations.forEach((conversation) => {
    if (conversation.source !== "conversation") {
      return;
    }
    const createdAt = firstDate(conversation.createTime, conversation.createTimeText);
    if (createdAt) {
      addBucketMetric(buckets, createdAt, "conversation_count", 1);
    }
  });

  context.messages.forEach((message) => {
    if (!message.createdAt) {
      return;
    }
    const role = message.role || "unknown";
    addBucketMetric(buckets, message.createdAt, "message_count", 1);
    addBucketMetric(buckets, message.createdAt, `${role}_message_count`, 1);
    addBucketMetric(buckets, message.createdAt, "character_count", message.characterCount);
    addBucketMetric(buckets, message.createdAt, `${role}_character_count`, message.characterCount);
  });

  const messageTimes = new Map(context.messages.map((message) => [message.messageId, message.createdAt]));
  context.assets.forEach((asset) => {
    if (asset.source === "library_file") {
      return;
    }
    const createdAt = asset.messageId ? messageTimes.get(asset.messageId) : null;
    if (createdAt) {
      addBucketMetric(buckets, createdAt, `${asset.category}_count`, 1);
    }
  });

  const days = [...buckets.days.keys()].sort();
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

function activity(messages: MessageWithStats[]): Record<string, unknown> {
  const byHour = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [String(index).padStart(2, "0"), 0]));
  const byWeekday = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [String(index), 0]));
  const byPeriod = { late_night: 0, morning: 0, afternoon: 0, evening: 0 };
  const weekdayVsWeekend = { weekday: 0, weekend: 0 };

  messages.forEach((message) => {
    if (!message.createdAt) {
      return;
    }
    byHour[hourKey(message.createdAt)] += 1;
    byWeekday[weekdayKey(message.createdAt)] += 1;
    byPeriod[dayPeriod(message.createdAt) as keyof typeof byPeriod] += 1;
    weekdayVsWeekend[message.createdAt.getUTCDay() === 0 || message.createdAt.getUTCDay() === 6 ? "weekend" : "weekday"] += 1;
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

function conversationStats(context: BuildContext): Record<string, unknown> {
  const ordinary = ordinaryAggregates(context);
  return {
    message_count_distribution: distribution(ordinary.map((item) => item.messageCount)),
    character_count_distribution: distribution(ordinary.map((item) => item.characterCount)),
    short_conversation_count: ordinary.filter((item) => item.messageCount <= 2).length,
    long_conversation_count: ordinary.filter((item) => item.messageCount >= 30).length,
    archived_count: ordinary.filter((item) => item.isArchived).length,
    starred_count: ordinary.filter((item) => item.isStarred).length,
    shared_count: ordinary.filter((item) => item.isShared).length,
    longest_by_messages: topConversations(ordinary, "messageCount"),
    longest_by_characters: topConversations(ordinary, "characterCount"),
    most_assets: topConversations(ordinary, "assetCount"),
    earliest: firstConversation(ordinary),
    latest: lastConversation(ordinary),
  };
}

function messageStats(messages: MessageWithStats[]): Record<string, unknown> {
  const user = messages.filter((message) => message.role === "user");
  const assistant = messages.filter((message) => message.role === "assistant");
  const punctuation = { question_marks: 0, exclamation_marks: 0 };
  let urls = 0;
  let codeBlocks = 0;

  messages.forEach((message) => {
    const counts = punctuationCounts(message.text);
    punctuation.question_marks += counts.question_marks;
    punctuation.exclamation_marks += counts.exclamation_marks;
    urls += urlCount(message.text);
    codeBlocks += codeBlockCount(message.text);
  });

  return {
    user_length_distribution: distribution(user.map((message) => message.characterCount)),
    assistant_length_distribution: distribution(assistant.map((message) => message.characterCount)),
    all_length_distribution: distribution(messages.map((message) => message.characterCount)),
    user_to_assistant_character_ratio: safeRatio(sum(user.map((message) => message.characterCount)), sum(assistant.map((message) => message.characterCount))),
    question_marks: punctuation.question_marks,
    exclamation_marks: punctuation.exclamation_marks,
    url_count: urls,
    code_block_count: codeBlocks,
    longest_user_messages: topMessages(user),
    longest_assistant_messages: topMessages(assistant),
  };
}

function modelStats(messages: MessageWithStats[]): Record<string, unknown> {
  const byModel = new Map<string, { messageCount: number; characterCount: number; firstSeenAt: Date | null; lastSeenAt: Date | null }>();
  const monthly = new Map<string, Map<string, number>>();

  messages.filter((message) => message.role === "assistant").forEach((message) => {
    const model = message.modelSlug || "unknown";
    const stats = byModel.get(model) || { messageCount: 0, characterCount: 0, firstSeenAt: null, lastSeenAt: null };
    stats.messageCount += 1;
    stats.characterCount += message.characterCount;
    if (message.createdAt) {
      stats.firstSeenAt = minDate(stats.firstSeenAt, message.createdAt);
      stats.lastSeenAt = maxDate(stats.lastSeenAt, message.createdAt);
      const month = monthKey(message.createdAt);
      const monthCounter = monthly.get(month) || new Map<string, number>();
      monthCounter.set(model, (monthCounter.get(model) || 0) + 1);
      monthly.set(month, monthCounter);
    }
    byModel.set(model, stats);
  });

  const models = [...byModel.entries()]
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
    most_used_model: models[0] || null,
    monthly_primary_model: Object.fromEntries([...monthly.entries()].sort().map(([month, counter]) => [month, maxMapping(Object.fromEntries(counter))?.key || null])),
  };
}

function assetStats(context: BuildContext): Record<string, unknown> {
  const messageTimes = new Map(context.messages.map((message) => [message.messageId, message.createdAt]));
  const usableAssets = context.assets.filter((asset) => asset.source !== "library_file");
  const mime = counter(usableAssets.map((asset) => asset.mimeType || "unknown"));
  const extensions = counter(usableAssets.map((asset) => asset.fileExtension || suffix(asset.displayName) || "unknown"));
  const monthly = new Map<string, Map<string, number>>();

  usableAssets.forEach((asset) => {
    const createdAt = asset.messageId ? messageTimes.get(asset.messageId) : null;
    if (!createdAt) {
      return;
    }
    const month = monthKey(createdAt);
    const monthCounter = monthly.get(month) || new Map<string, number>();
    monthCounter.set(asset.category, (monthCounter.get(asset.category) || 0) + 1);
    monthly.set(month, monthCounter);
  });

  return {
    total_count: usableAssets.length,
    by_category: Object.fromEntries(counter(usableAssets.map((asset) => asset.category))),
    by_mime_type: counterItems(mime),
    by_extension: counterItems(extensions),
    size_distribution: distribution(usableAssets.map((asset) => asset.sizeBytes || 0)),
    monthly: Object.fromEntries([...monthly.entries()].sort().map(([month, values]) => [month, Object.fromEntries(values)])),
    largest_assets: largestAssets(context.assets),
  };
}

function languageStats(messages: MessageWithStats[]): Record<string, unknown> {
  const totals = { chinese_characters: 0, english_words: 0, digit_characters: 0 };
  const buckets = new Map<string, number>();
  messages.forEach((message) => {
    const counts = languageCounts(message.text);
    totals.chinese_characters += counts.chinese_characters;
    totals.english_words += counts.english_words;
    totals.digit_characters += counts.digit_characters;
    incrementMap(buckets, languageBucket(message.text));
  });
  return {
    totals,
    message_buckets: Object.fromEntries(buckets),
  };
}

function frequentWords(messages: MessageWithStats[]): Record<string, unknown> {
  const monthly = new Map<string, Array<string | null>>();
  messages.forEach((message) => {
    if (!message.createdAt) {
      return;
    }
    const month = monthKey(message.createdAt);
    const texts = monthly.get(month) || [];
    texts.push(message.text);
    monthly.set(month, texts);
  });
  return {
    all: frequentTerms(messages.map((message) => message.text), 50),
    user: frequentTerms(messages.filter((message) => message.role === "user").map((message) => message.text), 50),
    assistant: frequentTerms(messages.filter((message) => message.role === "assistant").map((message) => message.text), 50),
    monthly: Object.fromEntries([...monthly.entries()].sort().map(([month, texts]) => [month, frequentTerms(texts, 10)])),
  };
}

function qualityStats(context: BuildContext): Record<string, unknown> {
  const ordinary = ordinaryAggregates(context);
  return {
    feedback_count: context.parsed.feedback.length,
    feedback_by_rating: Object.fromEntries(counter(context.parsed.feedback.map((item) => item.rating || "unknown"))),
    shared_conversation_count: new Set(context.parsed.shares.map((item) => item.conversationId).filter(Boolean)).size,
    conversations_with_feedback_count: new Set(context.parsed.feedback.map((item) => item.conversationId).filter(Boolean)).size,
    high_interaction_conversations: topConversations(ordinary, "messageCount"),
    high_asset_conversations: topConversations(ordinary, "assetCount"),
    high_character_conversations: topConversations(ordinary, "characterCount"),
  };
}

function highlights(context: BuildContext): Record<string, unknown> {
  const ordinary = ordinaryAggregates(context);
  const timelineStats = timeline(context);
  const activityStats = activity(context.messages);
  const modelStatsValue = modelStats(context.messages);
  return {
    most_active_day: timelineStats.most_active_day,
    most_active_month: timelineStats.most_active_month,
    longest_conversation_by_messages: topConversations(ordinary, "messageCount", 1)[0] || null,
    longest_conversation_by_characters: topConversations(ordinary, "characterCount", 1)[0] || null,
    most_asset_conversation: topConversations(ordinary, "assetCount", 1)[0] || null,
    most_used_model: modelStatsValue.most_used_model,
    most_active_hour: activityStats.most_active_hour,
    most_active_weekday: activityStats.most_active_weekday,
    longest_user_message: topMessages(context.messages.filter((message) => message.role === "user"), 1)[0] || null,
    longest_assistant_message: topMessages(context.messages.filter((message) => message.role === "assistant"), 1)[0] || null,
    first_conversation: firstConversation(ordinary),
    latest_conversation: lastConversation(ordinary),
  };
}

function conversationAggregates(context: BuildContext): ConversationAggregate[] {
  const aggregates = new Map<number, ConversationAggregate>();
  context.conversations.forEach((conversation) => {
    const createdAt = firstDate(conversation.createTime, conversation.createTimeText);
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
    if (!message.conversationId) {
      return;
    }
    const rowId = byConversationId.get(message.conversationId)?.[0];
    const aggregate = rowId ? aggregates.get(rowId) : undefined;
    if (!aggregate) {
      return;
    }
    aggregate.messageCount += 1;
    aggregate.characterCount += message.characterCount;
    if (message.role === "user") {
      aggregate.userMessageCount += 1;
      aggregate.userCharacterCount += message.characterCount;
    } else if (message.role === "assistant") {
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

function ordinaryAggregates(context: BuildContext): ConversationAggregate[] {
  return conversationAggregates(context).filter((item) => item.source === "conversation");
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
  buckets: { years: Map<string, MetricBucket>; months: Map<string, MetricBucket>; days: Map<string, MetricBucket> },
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

function sortedBucket(bucket: Map<string, MetricBucket>): Array<Record<string, unknown>> {
  return [...bucket.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({ key, ...value }));
}

function maxBucket(bucket: Map<string, MetricBucket>, metric: string): Record<string, unknown> | null {
  const items = [...bucket.entries()];
  if (items.length === 0) {
    return null;
  }
  const [key, value] = items.reduce((best, item) => ((item[1][metric] || 0) > (best[1][metric] || 0) ? item : best));
  return { key, ...value };
}

function maxMapping(values: Record<string, number>): { key: string; count: number } | null {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return null;
  }
  const [key, count] = entries.reduce((best, item) => (item[1] > best[1] ? item : best));
  return { key, count };
}

function topConversations(items: ConversationAggregate[], metric: keyof ConversationAggregate, limit = TOP_N): TopConversation[] {
  return [...items]
    .sort((left, right) => Number(right[metric] || 0) - Number(left[metric] || 0))
    .slice(0, limit)
    .map((item) => ({
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

function topMessages(messages: MessageWithStats[], limit = TOP_N): TopMessage[] {
  return [...messages]
    .sort((left, right) => right.characterCount - left.characterCount)
    .slice(0, limit)
    .map((message) => ({
      message_id: message.messageId,
      conversation_id: message.conversationId,
      role: message.role,
      created_at: isoOrNull(message.createdAt),
      character_count: message.characterCount,
      text_excerpt: excerpt(message.text, 360),
    }));
}

function largestAssets(assets: AssetWithStats[], limit = TOP_N): Array<Record<string, unknown>> {
  return assets
    .filter((asset) => asset.sizeBytes)
    .sort((left, right) => (right.sizeBytes || 0) - (left.sizeBytes || 0))
    .slice(0, limit)
    .map((asset) => ({
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

function firstConversation(items: ConversationAggregate[]): Record<string, unknown> | null {
  const dated = items.filter((item) => item.createdAt);
  if (dated.length === 0) {
    return null;
  }
  return conversationSummary(dated.reduce((best, item) => (item.createdAt! < best.createdAt! ? item : best)));
}

function lastConversation(items: ConversationAggregate[]): Record<string, unknown> | null {
  const dated = items.filter((item) => item.createdAt);
  if (dated.length === 0) {
    return null;
  }
  return conversationSummary(dated.reduce((best, item) => (item.createdAt! > best.createdAt! ? item : best)));
}

function conversationSummary(item: ConversationAggregate): Record<string, unknown> {
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

function assetCategory(asset: ParsedAsset): "image" | "voice" | "file" {
  const mime = (asset.mimeType || "").toLowerCase();
  const suffixes = new Set([suffix(asset.fileExtension), suffix(asset.displayName), suffix(asset.localPath)].filter(Boolean));
  if (mime.startsWith("image/") || intersects(suffixes, ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "heic"])) {
    return "image";
  }
  if (mime.startsWith("audio/") || intersects(suffixes, ["mp3", "m4a", "wav", "ogg", "opus", "flac", "aac"])) {
    return "voice";
  }
  return "file";
}

function dedupedAssetCounts(assets: AssetWithStats[]): Record<"image" | "voice" | "file", number> {
  const seen = { image: new Set<string>(), voice: new Set<string>(), file: new Set<string>() };
  assets.forEach((asset) => {
    if (asset.source === "library_file") {
      return;
    }
    seen[asset.category].add(assetIdentity(asset));
  });
  return {
    image: seen.image.size,
    voice: seen.voice.size,
    file: seen.file.size,
  };
}

function assetIdentity(asset: AssetWithStats): string {
  if (asset.source === "library_file") {
    return `library:${asset.localPath}`;
  }
  if (asset.messageId) {
    return `message:${asset.messageId}:${asset.localPath}`;
  }
  return `asset:${asset.localPath}`;
}

function suffix(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const text = value.toLowerCase().replace(/^\./, "");
  return text.includes(".") ? text.split(".").pop() || "" : text;
}

function counter(values: Iterable<string>): Map<string, number> {
  const output = new Map<string, number>();
  for (const value of values) {
    incrementMap(output, value);
  }
  return output;
}

function counterItems(values: Map<string, number>): Array<{ key: string; count: number }> {
  return [...values.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([key, count]) => ({ key, count }));
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

function daysInclusive(first: Date, last: Date): number {
  const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  return Math.floor((end - start) / 86_400_000) + 1;
}

function intersects(values: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => values.has(candidate));
}

function isDate(value: Date | null): value is Date {
  return value !== null;
}
