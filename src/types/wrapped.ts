export type CountMap = Record<string, number>;

export type AssetCategory = "image" | "voice" | "file";
export type DayPeriod = "late_night" | "morning" | "afternoon" | "evening";

export interface KeyCount {
  key: string;
  count: number;
}

export interface TermCount {
  term: string;
  count: number;
}

export interface Distribution {
  zero: number;
  one_to_two: number;
  three_to_five: number;
  six_to_ten: number;
  eleven_to_thirty: number;
  thirty_one_to_one_hundred: number;
  over_one_hundred: number;
}

export interface MetricCounts {
  conversation_count: number;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  character_count: number;
  user_character_count: number;
  assistant_character_count: number;
  image_count: number;
  file_count: number;
  voice_count: number;
}

// Accumulator shape: role-derived keys such as `tool_message_count` are added dynamically.
export type MetricBucket = MetricCounts & CountMap;

export interface TimelineBucket extends MetricCounts {
  key: string;
  [metric: string]: number | string;
}

export interface DateRange {
  days: number;
  start: string | null;
  end: string | null;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string | null;
  created_at: string | null;
  message_count: number;
  character_count: number;
}

export interface TopConversation extends ConversationSummary {
  user_message_count: number;
  assistant_message_count: number;
  asset_count: number;
  value: number | null;
}

export interface TopMessage {
  message_id: string | null;
  conversation_id: string | null;
  role: string | null;
  created_at: string | null;
  character_count: number;
  text_excerpt: string | null;
}

export interface ModelUsage {
  model: string;
  message_count: number;
  character_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface LargestAsset {
  local_path: string;
  display_name: string | null;
  category: AssetCategory;
  mime_type: string | null;
  file_extension: string | null;
  size_bytes: number | null;
  conversation_id: string | null;
  message_id: string | null;
}

export interface WrappedMeta {
  generated_at: string;
  schema_version: number;
  table_counts: Record<string, number>;
  parse_warning_count: number;
}

export interface OverviewStats {
  conversation_count: number;
  user_message_count: number;
  assistant_message_count: number;
  image_count: number;
  file_count: number;
  voice_count: number;
  user_character_count: number;
  assistant_character_count: number;
  total_character_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  known_days: number | null;
}

export interface TimelineStats {
  years: TimelineBucket[];
  months: TimelineBucket[];
  days: TimelineBucket[];
  most_active_day: TimelineBucket | null;
  most_active_month: TimelineBucket | null;
  most_active_year: TimelineBucket | null;
  longest_active_streak: DateRange;
  longest_inactive_gap: DateRange;
}

export interface ActivityStats {
  by_hour: CountMap;
  by_weekday: CountMap;
  by_day_period: Record<DayPeriod, number>;
  weekday_vs_weekend: { weekday: number; weekend: number };
  most_active_hour: KeyCount | null;
  most_active_weekday: KeyCount | null;
}

export interface ConversationStats {
  message_count_distribution: Distribution;
  character_count_distribution: Distribution;
  short_conversation_count: number;
  long_conversation_count: number;
  archived_count: number;
  starred_count: number;
  shared_count: number;
  longest_by_messages: TopConversation[];
  longest_by_characters: TopConversation[];
  most_assets: TopConversation[];
  earliest: ConversationSummary | null;
  latest: ConversationSummary | null;
}

export interface MessageStats {
  user_length_distribution: Distribution;
  assistant_length_distribution: Distribution;
  all_length_distribution: Distribution;
  user_to_assistant_character_ratio: number | null;
  question_marks: number;
  exclamation_marks: number;
  url_count: number;
  code_block_count: number;
  longest_user_messages: TopMessage[];
  longest_assistant_messages: TopMessage[];
}

export interface ModelStats {
  models: ModelUsage[];
  most_used_model: ModelUsage | null;
  monthly_primary_model: Record<string, string | null>;
}

export interface AssetStats {
  total_count: number;
  by_category: CountMap;
  by_mime_type: KeyCount[];
  by_extension: KeyCount[];
  size_distribution: Distribution;
  monthly: Record<string, CountMap>;
  largest_assets: LargestAsset[];
}

export interface LanguageStats {
  totals: {
    chinese_characters: number;
    english_words: number;
    digit_characters: number;
  };
  message_buckets: CountMap;
}

export interface FrequentWordStats {
  all: TermCount[];
  user: TermCount[];
  assistant: TermCount[];
  monthly: Record<string, TermCount[]>;
}

export interface QualityStats {
  feedback_count: number;
  feedback_by_rating: CountMap;
  shared_conversation_count: number;
  conversations_with_feedback_count: number;
  high_interaction_conversations: TopConversation[];
  high_asset_conversations: TopConversation[];
  high_character_conversations: TopConversation[];
}

export interface HighlightStats {
  most_active_day: TimelineBucket | null;
  most_active_month: TimelineBucket | null;
  longest_conversation_by_messages: TopConversation | null;
  longest_conversation_by_characters: TopConversation | null;
  most_asset_conversation: TopConversation | null;
  most_used_model: ModelUsage | null;
  most_active_hour: KeyCount | null;
  most_active_weekday: KeyCount | null;
  longest_user_message: TopMessage | null;
  longest_assistant_message: TopMessage | null;
  first_conversation: ConversationSummary | null;
  latest_conversation: ConversationSummary | null;
}

export interface WrappedData {
  meta: WrappedMeta;
  overview: OverviewStats;
  timeline: TimelineStats;
  activity: ActivityStats;
  conversations: ConversationStats;
  messages: MessageStats;
  models: ModelStats;
  assets: AssetStats;
  language: LanguageStats;
  frequent_words: FrequentWordStats;
  quality: QualityStats;
  highlights: HighlightStats;
}
