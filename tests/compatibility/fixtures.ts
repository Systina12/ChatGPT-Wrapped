import type { ExportEntry, JsonObject } from "../../src/types/export";
import { DEFAULT_OPTIONS, type ReportOptions } from "../../src/types/options";

export const BASELINE_COMMIT = "429eedcd6dc29fa02c061257c2e418d764f3ee40";
export const FIXED_TIME = "2025-02-01T12:00:00.000Z";
type Variant = "rich" | "empty" | "partial" | "branches" | "overlap" | "long";
export interface CompatibilityCase {
  id: string;
  variant: Variant;
  options: ReportOptions;
}
const scenario = (
  id: string,
  options: Partial<ReportOptions> = {},
  variant: Variant = "rich",
): CompatibilityCase => ({ id, variant, options: { ...DEFAULT_OPTIONS, ...options } });

export const compatibilityCases: CompatibilityCase[] = [
  scenario("utc-current-dialogue"),
  scenario("utc-all-branches-roles", { branches: "all", roles: "all" }),
  scenario("users-without-groups", { roles: "user", includeGroups: false }),
  scenario("year-2024", { year: "2024" }),
  scenario("year-2025-user", { year: "2025", roles: "user" }),
  scenario("year-without-data", { year: "2022" }),
  scenario("shanghai-year-boundary", { timezone: "Asia/Shanghai", year: "2025" }),
  scenario("new-york-spring", { timezone: "America/New_York", year: "custom", start: "2024-03-09", end: "2024-03-11" }),
  scenario("new-york-fall", { timezone: "America/New_York", year: "custom", start: "2024-11-02", end: "2024-11-04" }),
  scenario("single-inclusive-day", { year: "custom", start: "2024-03-10", end: "2024-03-10" }),
  scenario("kiritimati-year-boundary", { timezone: "Pacific/Kiritimati", year: "2025", branches: "all" }),
  scenario("adak-year-boundary", { timezone: "America/Adak", year: "2024", roles: "all" }),
  scenario("bounded-extreme-span", { year: "custom", start: "0001-01-01", end: "9999-12-31" }),
  scenario("empty-default", {}, "empty"),
  scenario("empty-fixed-year", { year: "2024" }, "empty"),
  scenario("partial-main-shards", {}, "partial"),
  scenario("branch-fallback-and-cycle", {}, "branches"),
  scenario("branch-all-history", { branches: "all", roles: "all" }, "branches"),
  scenario("overlapping-shards", {}, "overlap"),
  scenario("overlapping-shards-all", { branches: "all", roles: "all" }, "overlap"),
  scenario("long-text-streaming", {}, "long"),
  scenario("long-text-user-recalculation", { roles: "user", year: "2024" }, "long"),
];

function entry(name: string, value: unknown): ExportEntry {
  const text = JSON.stringify(value);
  return { name, path: name, text, size: new TextEncoder().encode(text).length };
}
function message(id: string, role: string, instant: string | null, text: string): JsonObject {
  return {
    id, author: { role }, create_time: instant ? Date.parse(instant) / 1000 : null,
    content: { content_type: "text", parts: [text] },
    metadata: role === "assistant" ? { model_slug: "gpt-4o" } : {},
  };
}
function conversation(id: string, first: string | null, last: string | null): JsonObject {
  return {
    id, title: `Synthetic <${id}> & "title"\u0000`,
    create_time: 978307200, update_time: 1893456000,
    current_node: "answer", is_archived: true, is_starred: id === "spring",
    mapping: {
      root: { parent: null, message: message(`${id}-user`, "user", first, "人工智能 编程 alpha alpha ? https://example.invalid") },
      bridge: { parent: "root", message: null },
      answer: { parent: "bridge", message: message(`${id}-assistant`, "assistant", last, "机器学习 数据分析 beta ! ```code```") },
      alternate: { parent: "root", message: message(`${id}-tool`, "tool", last, "深度学习 大模型 提示词 gamma") },
    },
  };
}
function mapping(c: JsonObject): Record<string, JsonObject> {
  return c.mapping as Record<string, JsonObject>;
}

/** Synthetic export payloads, independent of the production parser and builder. */
export function compatibilityEntries(variant: Variant): ExportEntry[] {
  if (variant === "empty") return [entry("conversations.json", [])];
  const spring = conversation("spring", "2024-03-10T06:59:00Z", "2024-03-10T07:01:00Z");
  const fall = conversation("fall", "2024-11-03T05:30:00Z", "2024-11-03T06:30:00Z");
  const boundary = conversation("boundary", "2024-12-31T23:55:00Z", "2025-01-01T00:05:00Z");
  const prior = conversation("prior", "2023-03-10T07:30:00Z", "2023-03-10T07:31:00Z");
  const undated = conversation("undated", null, null);
  (mapping(spring).root.message as JsonObject).metadata = {
    attachments: [
      { id: "photo.png" },
      { id: "photo.png", mime_type: "image/png", width: 640, height: 480, size_bytes: 2048 },
      { id: "clip.webm", mime_type: "audio/webm", size_bytes: 4096 },
    ],
  };
  if (variant === "branches") {
    fall.current_node = "missing";
    mapping(spring).root.parent = "answer";
    mapping(boundary).answer.parent = "missing-parent";
  }
  if (variant === "long") {
    (mapping(spring).root.message as JsonObject).content = {
      content_type: "text",
      parts: ["人工智能 编程 alpha beta ".repeat(2500) + Array.from({ length: 2200 }, (_, i) => `word${i}`).join(" ")],
    };
  }
  const entries = [
    entry("conversations.json", [spring, fall, boundary, prior, undated, { id: "empty", mapping: {} }]),
    entry("export_manifest.json", { export_date: "2025-01-20T00:00:00Z" }),
    entry("library_files.json", [{
      id: "library-photo", file_id: "library-photo", file_name: "photo.png",
      mime_type: "image/png", file_size_bytes: 2048,
      initiating_conversation_id: "spring", origination_message_id: "spring-user",
    }]),
    entry("message_feedback.json", [
      { id: "f1", conversation_id: "spring", message_id: "spring-user", rating: "thumbsUp" },
      { id: "f2", conversation_id: "spring", message_id: "spring-tool", rating: "__proto__" },
      { id: "f3", conversation_id: null, message_id: "boundary-assistant", rating: "thumbsDown" },
      { id: "f4", conversation_id: "prior", rating: "constructor" },
      { id: "f5", conversation_id: "spring", message_id: "missing", rating: "exclude" },
    ]),
    entry("shared_conversations.json", [{ id: "share", conversation_id: "spring", title: "Synthetic share" }]),
    entry("group_chats.json", { chats: [{
      id: "group", name: "Synthetic group", created_at: "2024-03-09T12:00:00Z",
      messages: [
        { id: "group-user", role: "user", text: "人工智能 alpha", created_at: "2024-03-09T12:00:00Z" },
        { id: "group-assistant", role: "assistant", text: "编程 beta", created_at: "2024-03-11T12:00:00Z" },
      ],
    }] }),
    entry("user.json", { id: "synthetic-user", email: "synthetic@example.invalid", chatgpt_plus_user: true }),
    entry("user_settings.json", { user_id: "synthetic-user", habitat_object_version: "synthetic" }),
  ];
  if (variant === "partial") entries.push({ name: "conversations-1.json", path: "conversations-1.json", text: "{broken", size: 7 });
  if (variant === "overlap") entries.push(entry("conversations-1.json", [{
    id: "spring", current_node: "next", mapping: {
      next: { parent: "answer", message: message("spring-next", "assistant", "2024-03-11T12:00:00Z", "编程 delta") },
    },
  }]));
  return entries;
}

export const rejectedInputs = [
  { id: "missing-main", entries: () => [entry("user.json", {})] },
  { id: "broken-main", entries: () => [{ name: "conversations.json", path: "conversations.json", text: "{broken", size: 7 }] },
  { id: "invalid-main", entries: () => [entry("conversations.json", [{ mapping: { node: { message: "damaged" } } }])] },
];
