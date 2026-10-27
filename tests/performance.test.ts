import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { File as NodeFile } from "node:buffer";
import {
  filesToExportEntries,
  readBoundedZipText,
  readJsonEntry,
  ImportLimitError,
} from "../src/lib/export/fileInput";
import { parseExportEntries } from "../src/lib/export/parser";
import { buildReport } from "../src/lib/report/engine";
import { DEFAULT_OPTIONS } from "../src/types/options";
import { scopeExport } from "../src/lib/stats/scope";
import { topK } from "../src/lib/stats/topK";
import {
  chineseTerms,
  frequentTerms,
  messageTextStats,
  topTerms,
} from "../src/lib/stats/text";
import { conversation, fixture, jsonEntry, message } from "./fixtures";

it("keeps an explicit extension when overlapping attachment names suggest another suffix", async () => {
  const first = conversation("explicit-extension");
  Object.assign(first.mapping.root.message.metadata, {
    attachments: [
      { id: "shared", file_name: "first.png", size_bytes: 10 },
      { id: "shared", file_name: "second.webm", size_bytes: 20 },
    ],
  });
  const parsed = await parseExportEntries([
    jsonEntry("conversations.json", [first]),
    jsonEntry("conversations-1.json", [{ id: first.id, mapping: {} }]),
    jsonEntry("library_files.json", [{ id: "library", file_id: "lib-first", file_name: "first.png", file_extension: "png", mime_type: "image/png" }]),
  ]);
  const attachment = parsed.assets.find((a) => a.source !== "library_file")!;
  expect(attachment.displayName).toBe("second.webm");
  expect(attachment.fileExtension).toBe("png");
  expect(buildReport(parsed).assets.largest_assets[0].file_extension).toBe("png");
});

it.each([1, 2, 3])("preserves original extension enrichment across %i overlapping shards", async (shards) => {
  const first = conversation("extensions");
  Object.assign(first.mapping.root.message.metadata, {
    attachments: [{ id: "original.webm", mime_type: "audio/webm", size_bytes: 10 }],
  });
  const added = message("added", "assistant");
  Object.assign(added.metadata, {
    attachments: [{ id: "new.webm", mime_type: "audio/webm", size_bytes: 20 }],
  });
  const entries = [
    jsonEntry("conversations.json", [first]),
    jsonEntry("conversations-1.json", [{ id: first.id, current_node: "extra", mapping: { extra: { parent: "answer", message: added } } }]),
    jsonEntry("conversations-2.json", [{ id: first.id, mapping: {} }]),
  ].slice(0, shards);
  const parsed = await parseExportEntries(entries);
  expect(parsed.assets.find((a) => a.localPath === "original.webm")?.fileExtension).toBe(shards > 1 ? "webm" : null);
  if (shards > 1)
    expect(parsed.assets.find((a) => a.localPath === "new.webm")?.fileExtension).toBe(shards > 2 ? "webm" : null);
  expect(parsed.assets).toHaveLength(shards > 1 ? 2 : 1);
});

describe("sparse references under report filtering", () => {
  it.each([1, 50])("preserves duplicate feedback with %i references to a small selection", async (count) => {
    const parsed = await fixture();
    parsed.feedback = Array.from({ length: count }, (_, i) => ({
      id: String(i), conversationId: parsed.messages[0].conversationId,
      messageId: parsed.messages[0].messageId, rating: null,
      createTime: null, updateTime: null, raw: null,
    }));
    expect(scopeExport(parsed).feedback).toEqual(parsed.feedback);
    expect(scopeExport(parsed, { ...DEFAULT_OPTIONS, year: "2023" }).feedback).toEqual([]);
  });
  it.each(["user", "dialogue", "all"] as const)(
    "keeps exact scoped and unscoped references for roles=%s",
    async (roles) => {
      const parsed = await parseExportEntries([
        jsonEntry("conversations.json", [conversation("current"), conversation("old")]),
      ]);
      const retained = parsed.messages.find((m) => m.conversationId === "current" && m.role === "user")!;
      const old = parsed.messages.find((m) => m.conversationId === "old" && m.role === "user")!;
      // The same message ID in an excluded conversation must not make its scoped
      // references survive. A reference without a conversation may match either.
      old.messageId = retained.messageId;
      for (const item of parsed.messages)
        if (item.conversationId === "old") item.createTime = Date.parse("2023-03-10T12:00Z") / 1000;
      const refs = [
        ["current", retained.messageId],
        ["old", retained.messageId],
        [null, retained.messageId],
        ["current", "missing"],
        [null, "missing"],
        ["current", null],
        ["old", null],
        [null, null],
        ["current", retained.messageId],
      ] as const;
      parsed.feedback = refs.map(([conversationId, messageId], i) => ({
        id: String(i), conversationId, messageId, rating: "thumbsUp",
        createTime: null, updateTime: null, raw: null,
      }));
      parsed.assets = refs.map(([conversationId, messageId], i) => ({
        source: "attachment", localPath: `file${i}.pdf`, conversationId, messageId,
        displayName: null, mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 1, width: null, height: null, raw: null,
      }));
      parsed.libraryFiles = refs.map(([initiatingConversationId, originationMessageId], i) => ({
        id: String(i), initiatingConversationId, originationMessageId,
        fileId: null, fileName: null, normalizedName: null, mimeType: null,
        fileExtension: null, fileSizeBytes: null, state: null, originationThreadId: null, raw: {},
      }));
      const scoped = scopeExport(parsed, { ...DEFAULT_OPTIONS, roles, year: "2024" });
      expect(scoped.feedback.map((f) => f.id)).toEqual(["0", "2", "5", "8"]);
      expect(scoped.assets.map((a) => a.localPath)).toEqual(["file0.pdf", "file2.pdf", "file5.pdf", "file8.pdf"]);
      expect(scoped.libraryFiles.map((f) => f.id)).toEqual(["0", "2", "5", "8"]);
      expect(parsed.feedback).toHaveLength(9);
      // Recalculation must build a fresh selection, without stale matches.
      const previous = scopeExport(parsed, { ...DEFAULT_OPTIONS, roles, year: "2023" });
      expect(previous.feedback.map((f) => f.id)).toEqual(["1", "2", "6"]);
    },
  );
  it("matches conversation/message pairs containing delimiter characters exactly", async () => {
    const parsed = await fixture();
    const c = parsed.conversations[0];
    parsed.conversations = [{ ...c, conversationId: "a\0b" }, { ...c, conversationId: "a" }];
    parsed.messages = [
      { ...parsed.messages[0], conversationId: "a\0b", messageId: "c", role: "user" },
      { ...parsed.messages[1], conversationId: "a", messageId: "b\0c", role: "assistant" },
    ];
    parsed.feedback = [
      { id: "keep", conversationId: "a\0b", messageId: "c", rating: null, createTime: null, updateTime: null, raw: null },
      { id: "exclude", conversationId: "a", messageId: "b\0c", rating: null, createTime: null, updateTime: null, raw: null },
    ];
    expect(scopeExport(parsed, { ...DEFAULT_OPTIONS, branches: "all", roles: "user" }).feedback.map((f) => f.id)).toEqual(["keep"]);
  });
  it("keeps unscoped references to selected orphan messages, but excludes library assets", async () => {
    const parsed = await fixture();
    parsed.messages = [{ ...parsed.messages[0], conversationId: null }];
    parsed.feedback = [{ id: "orphan", conversationId: null, messageId: parsed.messages[0].messageId, rating: null, createTime: null, updateTime: null, raw: null }];
    parsed.assets = [{ source: "library_file", localPath: "library.pdf", conversationId: null, messageId: parsed.messages[0].messageId, displayName: null, mimeType: null, fileExtension: null, sizeBytes: null, width: null, height: null, raw: null }];
    const scoped = scopeExport(parsed);
    expect(scoped.feedback).toEqual(parsed.feedback);
    expect(scoped.assets).toEqual([]);
    expect(scoped.conversations).toEqual([]);
  });
  it("assigns attachments to the exact message's month for unusual ID pairs", async () => {
    const parsed = await fixture();
    const c = parsed.conversations[0];
    parsed.conversations = [{ ...c, conversationId: "a\0b" }, { ...c, conversationId: "a" }];
    parsed.messages = [
      { ...parsed.messages[0], conversationId: "a\0b", messageId: "c", createTime: Date.parse("2024-03-10T12:00Z") / 1000 },
      { ...parsed.messages[1], conversationId: "a", messageId: "b\0c", createTime: Date.parse("2023-03-10T12:00Z") / 1000 },
    ];
    parsed.assets = parsed.messages.map((m, i) => ({
      source: "attachment", localPath: `file${i}.pdf`, conversationId: m.conversationId,
      messageId: m.messageId, displayName: null, mimeType: "application/pdf",
      fileExtension: "pdf", sizeBytes: 1, width: null, height: null, raw: null,
    }));
    const report = buildReport(parsed, { ...DEFAULT_OPTIONS, branches: "all" });
    expect(report.assets.monthly).toEqual({ "2023-03": { file: 1 }, "2024-03": { file: 1 } });
    expect(report.timeline.months.filter((m) => m.file_count > 0).map((m) => [m.key, m.file_count])).toEqual([["2023-03", 1], ["2024-03", 1]]);
  });
});

describe("complete message length statistics", () => {
  it("counts every length boundary and preserves stable top-message ties", async () => {
    const parsed = await fixture();
    const lengths = [0, 1, 2, 3, 5, 6, 10, 11, 30, 31, 100, 101];
    parsed.messages = ["user", "assistant", "tool", null].flatMap((role, r) =>
      [...lengths, ...lengths].map((length, i) => ({
        ...parsed.messages[0], messageId: `${r}-${i}`, role, text: "x".repeat(length),
      })),
    );
    const report = buildReport(parsed, { ...DEFAULT_OPTIONS, branches: "all", roles: "all" });
    const distribution = { zero: 2, one_to_two: 4, three_to_five: 4, six_to_ten: 4, eleven_to_thirty: 4, thirty_one_to_one_hundred: 4, over_one_hundred: 2 };
    expect(report.messages.user_length_distribution).toEqual(distribution);
    expect(report.messages.assistant_length_distribution).toEqual(distribution);
    expect(report.messages.all_length_distribution).toEqual(Object.fromEntries(Object.entries(distribution).map(([k, v]) => [k, v * 4])));
    expect(report.messages.user_to_assistant_character_ratio).toBe(1);
    for (const [role, prefix] of [["user", "0"], ["assistant", "1"]]) {
      const key = role === "user" ? "longest_user_messages" : "longest_assistant_messages";
      expect(report.messages[key].slice(0, 4).map((m) => m.message_id)).toEqual([`${prefix}-11`, `${prefix}-23`, `${prefix}-10`, `${prefix}-22`]);
    }
  });
  it("returns empty role statistics and a null ratio when there are no assistant characters", async () => {
    const parsed = await fixture();
    parsed.messages = [{ ...parsed.messages[0], text: "? ! https://example.test ```code```" }];
    const report = buildReport(parsed, { ...DEFAULT_OPTIONS, branches: "all" });
    expect(report.messages.user_to_assistant_character_ratio).toBeNull();
    expect(report.messages.longest_assistant_messages).toEqual([]);
    expect(Object.values(report.messages.assistant_length_distribution).every((v) => v === 0)).toBe(true);
    expect(report.messages.question_marks).toBe(1);
    expect(report.messages.exclamation_marks).toBe(1);
    expect(report.messages.url_count).toBe(1);
    expect(report.messages.code_block_count).toBe(2);
  });
});

describe("bounded lazy ZIP imports", () => {
  it("reads file ranges, leaves binary assets untouched and consumes one shard at a time", async () => {
    const zip = new JSZip();
    zip.file("export/big.bin", new Uint8Array(2 * 1024 * 1024), {
      compression: "STORE",
    });
    zip.file("export/conversations.json", JSON.stringify([conversation()]));
    zip.file("export/conversations-1.json", "[]");
    const file = new NodeFile(
      [await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })],
      "input.zip",
    ) as unknown as File;
    file.arrayBuffer = async () => {
      throw new Error("whole-file read forbidden");
    };
    const progress: unknown[] = [];
    const entries = await filesToExportEntries([file], {
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toHaveLength(0);
    expect(entries.every((entry) => entry.text === undefined)).toBe(true);
    const shard = entries.find(
      (entry) => entry.name === "conversations-1.json",
    )!;
    expect(await readJsonEntry(shard)).toEqual([]);
    expect(shard.readText).toBeUndefined();
    expect(progress).toHaveLength(1);
    // Parse only the remaining main shard; the already consumed entry is deliberately excluded.
    expect(
      (await parseExportEntries(entries.filter((e) => e !== shard))).messages,
    ).toHaveLength(3);
    expect(progress).toHaveLength(2);
  });
  const consume =
    (chunks: Uint8Array[]) => async (sink: WritableStream<Uint8Array>) => {
      const writer = sink.getWriter();
      for (const chunk of chunks) await writer.write(chunk);
      await writer.close();
    };
  it("counts actual bytes before decoding, across entries including failed JSON", async () => {
    const limits = { fileBytes: 10, totalBytes: 15 };
    await expect(
      readBoundedZipText(
        consume([new Uint8Array(6), new Uint8Array(5)]),
        0,
        undefined,
        undefined,
        limits,
      ),
    ).rejects.toBeInstanceOf(ImportLimitError);
    await expect(
      readBoundedZipText(
        consume([new Uint8Array(6)]),
        10,
        undefined,
        undefined,
        limits,
      ),
    ).rejects.toThrow(/total/);
    const entry = {
      name: "conversations-1.json",
      path: "conversations-1.json",
      size: 1,
      readText: async () => {
        throw new ImportLimitError("limit exceeded");
      },
    };
    await expect(
      parseExportEntries([jsonEntry("conversations.json", []), entry]),
    ).rejects.toThrow("limit exceeded");
  });
  it("decodes UTF-8 split across chunks and cancels during consumption", async () => {
    const bytes = new TextEncoder().encode("人工智能🙂");
    const result = await readBoundedZipText(
      consume([bytes.slice(0, 2), bytes.slice(2, 7), bytes.slice(7)]),
      0,
    );
    expect(result).toEqual({ text: "人工智能🙂", sizeBytes: bytes.length });
    const controller = new AbortController();
    await expect(
      readBoundedZipText(
        async (sink) => {
          const writer = sink.getWriter();
          await writer.write(bytes);
          controller.abort();
          await writer.write(bytes);
        },
        0,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("incremental normalization and compact history", () => {
  it("keeps richer metadata for surviving duplicate paths without restoring removed attachments", async () => {
    const first = conversation();
    Object.assign(first.mapping.root.message.metadata, {
      attachments: [
        {
          id: "retained",
          mime_type: "image/png",
          size_bytes: 1024,
          width: 800,
          height: 600,
        },
        { id: "removed.pdf", mime_type: "application/pdf" },
      ],
    });
    const next = message(`${first.id}-user`);
    Object.assign(next.metadata, { attachments: [{ id: "retained" }] });
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [first]),
      jsonEntry("conversations-1.json", [
        { id: first.id, mapping: { root: { parent: null, message: next } } },
      ]),
    ]);
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]).toMatchObject({
      localPath: "retained",
      mimeType: "image/png",
      sizeBytes: 1024,
      width: 800,
      height: 600,
      categoryHint: "image",
    });
    expect(buildReport(parsed).assets.by_category.image).toBe(1);
  });
  it("replaces changed IDs and attachments while retaining untouched branch links", async () => {
    const first = conversation();
    Object.assign(first.mapping.root.message.metadata, {
      attachments: [{ id: "old.png" }],
    });
    const replacement = message(
      "replacement",
      "user",
      first.mapping.root.message.create_time,
      "new text",
    );
    Object.assign(replacement.metadata, { attachments: [{ id: "new.png" }] });
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [first]),
      jsonEntry("conversations-1.json", [
        {
          id: first.id,
          mapping: { root: { parent: null, message: replacement } },
        },
      ]),
    ]);
    expect(parsed.messages.map((m) => m.messageId)).not.toContain(
      `${first.id}-user`,
    );
    expect(parsed.assets.map((a) => a.localPath)).toEqual(["new.png"]);
    expect(parsed.messages.every((m) => m.raw === null)).toBe(true);
    expect(parsed.assets.every((a) => a.raw === null)).toBe(true);
    expect(parsed.conversations[0].raw).toEqual({
      mapping: {
        root: { parent: null },
        bridge: { parent: "root" },
        answer: { parent: "bridge" },
        alternate: { parent: "root" },
      },
    });
    const report = buildReport(parsed, {
      ...DEFAULT_OPTIONS,
      branches: "current",
    });
    expect(report.meta.table_counts.messages).toBe(2);
    expect(report.assets.total_count).toBe(1);
    expect(report.warnings?.map((w) => w.code)).toContain(
      "conflicting_conversation",
    );
  });
});

describe("exact partial ranking and reusable text analysis", () => {
  it("matches stable full sorting across ties, reverse order, limits and high cardinality", () => {
    const items = Array.from({ length: 20000 }, (_, index) => ({
      index,
      score: ((index * 7919) % 101) - 50,
    }));
    const compare = (a: (typeof items)[number], b: (typeof items)[number]) =>
      b.score - a.score;
    for (const limit of [0, 1, 20, 50, 19999, 20001])
      expect(topK(items, limit, compare)).toEqual(
        [...items].sort(compare).slice(0, limit),
      );
    const terms = new Map(
      items.map((item) => [`term-${item.index}`, item.score + 50]),
    );
    expect(topTerms(terms, 50)).toEqual(
      [...terms]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 50)
        .map(([term, count]) => ({ term, count })),
    );
  });
  it("preserves counts, technical words and text mutation correctness", async () => {
    const parsed = await fixture();
    const item = parsed.messages[0];
    item.text =
      "人工智能 编程 中文 abc 123 ?？!！ https://example.com ```abc```";
    const stats = messageTextStats(item);
    expect(stats.question_marks).toBe(2);
    expect(stats.exclamation_marks).toBe(2);
    expect(stats.digit_characters).toBe(3);
    expect(stats.bucket).toBe("mixed");
    expect(stats.urls).toBe(1);
    const expected = chineseTerms(item.text);
    for (let i = 0; i < 5000; i++)
      chineseTerms(`测试短语${String.fromCharCode(0x4e00 + i)}不同内容`);
    expect(chineseTerms(item.text)).toEqual(expected);
    expect(frequentTerms(["人工智能 编程 人工智能"])).toEqual([
      { term: "人工智能", count: 2 },
      { term: "编程", count: 1 },
    ]);
    item.text = "new text";
    expect(messageTextStats(item).characterCount).toBe(7);
    expect(messageTextStats(item).question_marks).toBe(0);
  });
});
