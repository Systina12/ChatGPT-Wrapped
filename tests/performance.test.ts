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
import { topK } from "../src/lib/stats/topK";
import {
  chineseTerms,
  frequentTerms,
  messageTextStats,
  topTerms,
} from "../src/lib/stats/text";
import { conversation, fixture, jsonEntry, message } from "./fixtures";

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
    ).rejects.toThrow(/512/);
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
