import { describe, expect, it } from "vitest";
import { parseExportEntries } from "../src/lib/export/parser";
import { buildReport } from "../src/lib/report/engine";
import { prepareReportDownload } from "../src/lib/report/download";
import { MAX_REPORT_BYTES, restoreReportText } from "../src/lib/report/restore";
import { scopeExport } from "../src/lib/stats/scope";
import { DEFAULT_OPTIONS } from "../src/types/options";
import { conversation, fixture, jsonEntry, message } from "./fixtures";

const stamp = (value: string) => Date.parse(value) / 1000;
function single(id: string, mid: string, role = "user") {
  return {
    id, current_node: "n", mapping: {
      n: { parent: null, message: {
        ...message(mid, role), metadata: { attachments: [{ id: "shared.pdf", size_bytes: 10 }] },
      } },
    },
  };
}

describe("parser identity integrity", () => {
  it("preserves NUL-containing ID pairs through parsing, filtering and report round trips", async () => {
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [single("a\0b", "c"), single("a", "b\0c", "assistant")]),
      jsonEntry("message_feedback.json", [
        { id: "user", conversation_id: "a\0b", message_id: "c", rating: "thumbsUp" },
        { id: "assistant", conversation_id: "a", message_id: "b\0c", rating: "thumbsDown" },
      ]),
    ]);
    expect(parsed.messages.map((m) => [m.conversationId, m.messageId])).toEqual([["a\0b", "c"], ["a", "b\0c"]]);
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.warnings).toEqual([]);
    const all = buildReport(parsed);
    expect(all.meta.table_counts.messages).toBe(2);
    expect(all.assets.total_count).toBe(2);
    expect(all.conversations.ranking?.map((r) => r.message_count)).toEqual([1, 1]);
    expect(restoreReportText(prepareReportDownload(all).text)).toEqual(all);
    const users = scopeExport(parsed, { ...DEFAULT_OPTIONS, roles: "user" });
    expect(users.messages).toHaveLength(1);
    expect(users.assets.map((a) => a.conversationId)).toEqual(["a\0b"]);
    expect(users.feedback.map((f) => f.id)).toEqual(["user"]);
  });

  it("replaces one overlapping NUL ID without deleting the other conversation's history or assets", async () => {
    const first = single("a\0b", "c");
    const second = single("a", "b\0c");
    const replacement = single("a", "replacement");
    replacement.mapping.n.message.metadata.attachments[0] = { id: "new.pdf", size_bytes: 20 };
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [first, second]),
      jsonEntry("conversations-1.json", [replacement]),
    ]);
    expect(parsed.messages.map((m) => m.messageId)).toEqual(["c", "replacement"]);
    expect(parsed.assets.map((a) => [a.conversationId, a.messageId, a.localPath])).toEqual([
      ["a\0b", "c", "shared.pdf"], ["a", "replacement", "new.pdf"],
    ]);
  });
});

describe("ordinary and group conversation namespaces", () => {
  async function colliding(messageId = "same-user", references = 0) {
    const ordinary = conversation("same");
    Object.assign(ordinary.mapping.root.message.metadata, {
      attachments: [{ id: "shared.pdf", size_bytes: 10 }],
    });
    return parseExportEntries([
      jsonEntry("conversations.json", [ordinary]),
      jsonEntry("group_chats.json", { chats: [{ id: "same", name: "Group", messages: [{
        id: messageId, role: "user", text: "group text", created_at: "2025-04-10T12:00:00Z",
        attachments: [{ id: "shared.pdf", size_bytes: 20 }],
      }] }] }),
      jsonEntry("message_feedback.json", Array.from({ length: references }, (_, i) => ({
        id: `f${i}`, conversation_id: "same", message_id: "same-user", rating: "thumbsUp",
      }))),
      jsonEntry("shared_conversations.json", [{ id: "s", conversation_id: "same" }]),
      jsonEntry("library_files.json", references ? [{
        id: "l", initiating_conversation_id: "same", origination_message_id: "same-user",
      }] : []),
    ]);
  }

  it.each(["same-user", "group-message"])("keeps both sources when group message ID is %s", async (mid) => {
    const parsed = await colliding(mid);
    expect(parsed.messages).toHaveLength(4);
    expect(parsed.assets).toHaveLength(2);
    const current = buildReport(parsed);
    expect(current.meta.table_counts.messages).toBe(3);
    expect(current.conversations.ranking?.map((r) => [r.title, r.message_count, r.asset_count])).toEqual([
      ["Synthetic <same>", 2, 1], ["Group", 1, 1],
    ]);
    expect(current.conversations.shared_count).toBe(1);
    expect(current.assets.monthly).toEqual({ "2024-03": { file: 1 }, "2025-04": { file: 1 } });
    expect(current.timeline.months.filter((m) => m.conversation_count).map((m) => [m.key, m.conversation_count])).toEqual([["2024-03", 1], ["2025-04", 1]]);
    const all = buildReport(parsed, { ...DEFAULT_OPTIONS, branches: "all" });
    expect(all.meta.table_counts.messages).toBe(4);
    expect(all.conversations.ranking?.map((r) => r.message_count)).toEqual([3, 1]);
    const withoutGroups = buildReport(parsed, { ...DEFAULT_OPTIONS, includeGroups: false });
    expect(withoutGroups.meta.table_counts.messages).toBe(2);
    expect(withoutGroups.assets.total_count).toBe(1);
    expect(restoreReportText(prepareReportDownload(current).text)).toEqual(current);
  });

  it.each([0, 5])("filters associated data independently with %i ancillary references", async (references) => {
    const parsed = await colliding("same-user", references);
    const scoped = scopeExport(parsed, { ...DEFAULT_OPTIONS, year: "2025" });
    expect(scoped.messages.map((m) => m.source)).toEqual(["group_chat"]);
    expect(scoped.conversations.map((c) => [c.source, c.createTime])).toEqual([["group_chat", stamp("2025-04-10T12:00:00Z")]]);
    expect(scoped.assets.map((a) => [a.conversationSource, a.sizeBytes])).toEqual([["group_chat", 20]]);
    expect(scoped.feedback).toEqual([]);
    expect(scoped.libraryFiles).toEqual([]);
    expect(scoped.shares).toEqual([]);
    expect(scoped.groupChats).toHaveLength(1);
    const ordinary = scopeExport(parsed, { ...DEFAULT_OPTIONS, year: "2024" });
    expect(ordinary.conversations.map((c) => c.source)).toEqual(["conversation"]);
    expect(ordinary.assets.map((a) => a.sizeBytes)).toEqual([10]);
    expect(ordinary.feedback).toHaveLength(references);
    expect(ordinary.shares).toHaveLength(1);
    expect(ordinary.groupChats).toEqual([]);
  });

  it("retains ancillary links to an unambiguous group and unscoped message references", async () => {
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", []),
      jsonEntry("group_chats.json", { chats: [{ id: "g", name: "Group", messages: [{ id: "gm", role: "user", text: "hello", created_at: "2024-03-10T12:00:00Z" }] }] }),
      jsonEntry("message_feedback.json", [{ id: "f", conversation_id: "g", message_id: "gm" }, { id: "unscoped", message_id: "gm" }]),
      jsonEntry("shared_conversations.json", [{ id: "s", conversation_id: "g" }]),
      jsonEntry("library_files.json", [{ id: "l", initiating_conversation_id: "g", origination_message_id: "gm" }]),
    ]);
    const scoped = scopeExport(parsed);
    expect(scoped.feedback).toHaveLength(2);
    expect(scoped.shares).toHaveLength(1);
    expect(scoped.libraryFiles).toHaveLength(1);
    expect(buildReport(parsed).conversations.shared_count).toBe(1);
    expect(scopeExport(parsed, { ...DEFAULT_OPTIONS, includeGroups: false }).feedback).toEqual([]);
  });

  it("resolves source-less ancillary links by message ID when the conversation ID overlaps", async () => {
    const parsed = await colliding("group-message", 1);
    parsed.feedback.push({ id: "group-feedback", conversationId: "same", messageId: "group-message", rating: "thumbsUp", createTime: null, updateTime: null, raw: null });
    parsed.libraryFiles.push({ id: "group-library", initiatingConversationId: "same", originationMessageId: "group-message", fileId: null, fileName: null, normalizedName: null, mimeType: null, fileExtension: null, fileSizeBytes: null, state: null, originationThreadId: null, raw: {} });
    const selected = scopeExport(parsed, { ...DEFAULT_OPTIONS, year: "2025" });
    expect(selected.feedback.map((f) => f.id)).toEqual(["group-feedback"]);
    expect(selected.libraryFiles.map((f) => f.id)).toEqual(["group-library"]);
    expect(scopeExport(parsed, { ...DEFAULT_OPTIONS, year: "2024" }).feedback.map((f) => f.id)).toEqual(["f0"]);
    expect(scopeExport(parsed, { ...DEFAULT_OPTIONS, includeGroups: false }).libraryFiles.map((f) => f.id)).toEqual(["l"]);
    expect(buildReport(parsed).quality.conversations_with_feedback_count).toBe(2);
    expect(buildReport(parsed, { ...DEFAULT_OPTIONS, year: "2025" }).quality.conversations_with_feedback_count).toBe(1);
  });
});

it("keeps original v1 warning totals when a valid near-limit import needs compact download", async () => {
  const v1 = buildReport(await fixture());
  v1.meta.schema_version = 1;
  v1.meta.parse_warning_count = 7;
  v1.meta.table_counts.parse_warnings = 7;
  const sample = v1.conversations.ranking![0];
  const rows = Array.from({ length: 10000 }, (_, i) => ({ ...sample, conversation_id: `synthetic-${i}`, title: "" }));
  v1.conversations.ranking = rows;
  // The input is actually importable. Migration adds enough metadata to exceed
  // the cap, exercising compaction without increasing any production limit.
  const target = MAX_REPORT_BYTES - 64;
  const extra = target - Buffer.byteLength(JSON.stringify(v1));
  const title = "x".repeat(Math.floor(extra / rows.length));
  for (const row of rows) row.title = title;
  rows[0].title += "x".repeat(target - Buffer.byteLength(JSON.stringify(v1)));
  const imported = restoreReportText(JSON.stringify(v1));
  expect(imported.meta.parse_warning_count).toBe(8);
  expect(Buffer.byteLength(JSON.stringify(imported))).toBeGreaterThan(MAX_REPORT_BYTES);
  const download = prepareReportDownload(imported);
  expect(download.compacted).toBe(true);
  const reopened = restoreReportText(download.text);
  expect(reopened.meta.parse_warning_count).toBe(9);
  expect(reopened.meta.table_counts.parse_warnings).toBe(9);
  expect(reopened.warnings?.map((w) => w.code)).toEqual(["legacy_parse_warnings", "legacy_report", "compact_report"]);
  expect(reopened.overview).toEqual(imported.overview);
  expect(reopened.conversations.ranking).toBeUndefined();
}, 30000);
