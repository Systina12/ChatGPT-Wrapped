export type CountMap = Record<string, number>;

export interface Distribution {
  zero: number;
  one_to_two: number;
  three_to_five: number;
  six_to_ten: number;
  eleven_to_thirty: number;
  thirty_one_to_one_hundred: number;
  over_one_hundred: number;
}

export interface MetricBucket extends CountMap {
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

export interface WrappedData {
  meta: {
    generated_at: string;
    schema_version: number;
    table_counts: Record<string, number>;
    parse_warning_count: number;
  };
  overview: Record<string, unknown>;
  timeline: Record<string, unknown>;
  activity: Record<string, unknown>;
  conversations: Record<string, unknown>;
  messages: Record<string, unknown>;
  models: Record<string, unknown>;
  assets: Record<string, unknown>;
  language: Record<string, unknown>;
  frequent_words: Record<string, unknown>;
  quality: Record<string, unknown>;
  highlights: Record<string, unknown>;
}
