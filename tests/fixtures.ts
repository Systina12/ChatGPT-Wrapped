import { parseExportEntries } from "../src/lib/export/parser";
import type { ExportEntry } from "../src/types/export";
export function jsonEntry(name: string, value: unknown): ExportEntry {
  const text = JSON.stringify(value);
  return {
    name,
    path: name,
    text,
    size: new TextEncoder().encode(text).length,
  };
}
export function message(
  id: string,
  role = "user",
  time: number | null = Date.parse("2024-03-10T07:30:00Z") / 1000,
  text = "人工智能 机器学习 深度学习 数据分析 大模型 提示词 编程",
) {
  return {
    id,
    author: { role },
    create_time: time,
    content: { content_type: "text", parts: [text] },
    metadata: role === "assistant" ? { model_slug: "gpt-4o" } : {},
  };
}
export function conversation(
  id = "conversation-1",
  time = Date.parse("2024-03-10T07:30:00Z") / 1000,
) {
  return {
    id,
    title: `Synthetic <${id}>`,
    create_time: Date.parse("2001-01-01Z") / 1000,
    update_time: Date.parse("2028-01-01Z") / 1000,
    current_node: "answer",
    is_archived: true,
    is_starred: true,
    mapping: {
      root: {
        id: "root",
        parent: null,
        message: message(`${id}-user`, "user", time),
      },
      bridge: { id: "bridge", parent: "root", message: null },
      answer: {
        id: "answer",
        parent: "bridge",
        message: message(`${id}-assistant`, "assistant", time + 60),
      },
      alternate: {
        id: "alternate",
        parent: "root",
        message: message(`${id}-alternate`, "assistant", time + 120),
      },
    },
  };
}
export const fixture = () =>
  parseExportEntries([jsonEntry("conversations.json", [conversation()])]);
export function exportFiles() {
  return [
    jsonEntry("conversations.json", [
      conversation("c1"),
      conversation("old", Date.parse("2023-03-10T07:30Z") / 1000),
    ]),
    jsonEntry("message_feedback.json", [
      {
        id: "f1",
        conversation_id: "c1",
        message_id: "c1-user",
        rating: "thumbsUp",
      },
    ]),
    jsonEntry("shared_conversations.json", [
      { id: "s1", conversation_id: "c1", title: "Synthetic share" },
    ]),
  ];
}
