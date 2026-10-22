import { describe, expect, it } from "vitest";
import { parseExportEntries } from "../src/lib/export/parser";
import { classifyAsset, mergeAssets } from "../src/lib/export/assets";
import {
  readBoundedZipStream,
  type ZipByteStream,
} from "../src/lib/export/fileInput";
import { buildReport } from "../src/lib/report/engine";
import { restoreReport, restoreReportText } from "../src/lib/report/restore";
import { shareSvg, shareText } from "../src/lib/report/share";
import { DEFAULT_OPTIONS } from "../src/types/options";
import type { ParsedAsset } from "../src/types/export";
import { conversation, fixture, jsonEntry, message } from "./fixtures";

function oneConversation(
  content: unknown = { content_type: "text", parts: ["hello"] },
  metadata: unknown = {},
) {
  return {
    id: "c",
    current_node: "n",
    mapping: {
      n: { parent: null, message: { ...message("m"), content, metadata } },
    },
  };
}
const parseOne = (data: unknown, extra: ReturnType<typeof jsonEntry>[] = []) =>
  parseExportEntries([jsonEntry("conversations.json", data), ...extra]);

describe("damaged message data", () => {
  it.each(["corrupt", 42, [], {}, { author: { role: "user" }, content: [] }])(
    "rejects a main file whose only message is invalid: %j",
    async (invalid) => {
      const input = {
        id: "c",
        current_node: "n",
        mapping: { n: { parent: null, message: invalid } },
      };
      await expect(parseOne([input])).rejects.toThrow(/damaged/);
    },
  );
  it("rejects a main file containing only invalid mapping nodes", async () => {
    await expect(
      parseOne([{ id: "c", mapping: { n: "corrupt" } }]),
    ).rejects.toThrow(/damaged/);
  });
  it("preserves valid null placeholders and empty conversations", async () => {
    const result = await parseOne([
      { id: "null-mapping", mapping: null },
      { id: "placeholder", mapping: { n: { parent: null, message: null } } },
    ]);
    expect(result.conversations).toHaveLength(2);
    expect(result.messages).toHaveLength(0);
    expect(result.warnings).toEqual([]);
    expect((await parseOne([])).messages).toEqual([]);
  });
  it("keeps good records and warnings when only some message data is corrupt", async () => {
    const bad = { id: "bad", mapping: { n: { message: "corrupt" } } };
    const result = await parseOne([bad, oneConversation()]);
    expect(result.conversations.map((c) => c.conversationId)).toEqual(["c"]);
    expect(result.messages).toHaveLength(1);
    expect(result.warnings.some((w) => w.code === "invalid_message")).toBe(
      true,
    );
    expect(buildReport(result).meta.table_counts.messages).toBe(1);
  });
  it("keeps valid history within a partly damaged conversation", async () => {
    const input = oneConversation();
    (input.mapping as Record<string, unknown>).broken = {
      parent: "n",
      message: "corrupt",
    };
    const result = await parseOne([input]);
    expect(result.messages).toHaveLength(1);
    expect(result.warnings.some((w) => w.code === "invalid_message")).toBe(
      true,
    );
  });
  it("parses many conversations and marks shares without repeated conversation scans", async () => {
    const inputs = Array.from({ length: 20000 }, (_, i) => ({
      id: `c${i}`,
      current_node: "n",
      mapping: {
        n: { parent: null, message: message(`m${i}`, "user", 1704067200, "") },
      },
    }));
    const parsed = await parseOne(inputs, [
      jsonEntry("shared_conversations.json", [
        { id: "s", conversation_id: "c19999" },
      ]),
    ]);
    expect(parsed.conversations).toHaveLength(20000);
    expect(parsed.messages).toHaveLength(20000);
    expect(parsed.conversations.at(-1)?.isShared).toBe(true);
    const report = buildReport(parsed);
    expect(report.overview.conversation_count).toBe(20000);
    expect(report.conversations.shared_count).toBe(1);
    expect(report.conversations.ranking).toHaveLength(20000);
  }, 30000);
});

describe("attachment metadata and classification", () => {
  it("classifies each pointer in a mixed media part independently", async () => {
    const parsed = await parseOne([
      oneConversation({
        content_type: "multimodal_text",
        parts: [
          {
            content_type: "video",
            audio_asset_pointer: "audio.wav",
            video_container_asset_pointer: "video.mp4",
            frames_asset_pointers: ["frame.png"],
          },
        ],
      }),
    ]);
    expect(
      Object.fromEntries(
        parsed.assets.map((asset) => [asset.localPath, classifyAsset(asset)]),
      ),
    ).toEqual({
      "audio.wav": "voice",
      "video.mp4": "file",
      "frame.png": "image",
    });
    const report = buildReport(parsed);
    expect(report.overview.image_count).toBe(1);
    expect(report.overview.voice_count).toBe(1);
    expect(report.overview.file_count).toBe(1);
  });
  it.each([false, true])(
    "keeps image classification when a generic duplicate is merged, reversed=%s",
    async (reverse) => {
      const parsed = await parseOne([
        oneConversation(
          {
            content_type: "multimodal_text",
            parts: [
              { content_type: "image_asset_pointer", asset_pointer: "opaque" },
            ],
          },
          { attachments: [{ asset_pointer: "opaque", content_type: "file" }] },
        ),
      ]);
      expect(classifyAsset(parsed.assets[0])).toBe("image");
      expect(buildReport(parsed).assets.by_category.image).toBe(1);
      const specific = {
        ...parsed.assets[0],
        categoryHint: undefined,
        raw: { content_type: "image_asset_pointer" },
      } as ParsedAsset;
      const generic = { ...specific, raw: { content_type: "file" } };
      expect(
        classifyAsset(
          mergeAssets(reverse ? [generic, specific] : [specific, generic])[0],
        ),
      ).toBe("image");
    },
  );
  it("normalizes invalid numeric metadata and produces a report that can be restored", async () => {
    const parsed = await parseOne([
      oneConversation(undefined, {
        attachments: [
          {
            id: "bad-size",
            name: "f.png",
            mime_type: "image/png",
            size_bytes: -50,
            width: -1,
            height: 1.5,
          },
          { id: "zero-size", name: "zero.txt", size_bytes: 0 },
        ],
      }),
    ]);
    expect(parsed.assets[0].sizeBytes).toBeNull();
    expect(parsed.assets[0].width).toBeNull();
    expect(parsed.assets[0].height).toBeNull();
    expect(parsed.assets[1].sizeBytes).toBe(0);
    expect(
      parsed.warnings.some((w) => w.code === "invalid_asset_metadata"),
    ).toBe(true);
    const report = buildReport(parsed);
    expect(
      report.assets.largest_assets.every(
        (a) => a.size_bytes === null || a.size_bytes >= 0,
      ),
    ).toBe(true);
    expect(restoreReportText(JSON.stringify(report))).toEqual(report);
  });
  it("validates negative library sizes without dropping the associated attachment", async () => {
    const parsed = await parseOne(
      [
        oneConversation({
          parts: [
            { asset_pointer: "file-id", content_type: "image_asset_pointer" },
          ],
        }),
      ],
      [
        jsonEntry("library_files.json", [
          {
            id: "lib",
            file_id: "file-id",
            file_size_bytes: -10,
            mime_type: "image/png",
          },
        ]),
      ],
    );
    expect(parsed.libraryFiles[0].fileSizeBytes).toBeNull();
    expect(
      parsed.warnings.some((w) => w.code === "invalid_asset_metadata"),
    ).toBe(true);
    expect(restoreReport(buildReport(parsed)).assets.total_count).toBe(1);
  });
  it("derives extensions from actual paths and keeps extensionless names unknown", async () => {
    const report = buildReport(
      await parseOne([
        oneConversation(
          {
            parts: [
              {
                asset_pointer: "photo.png",
                content_type: "image_asset_pointer",
              },
            ],
          },
          { attachments: [{ id: "readme", name: "README" }] },
        ),
      ]),
    );
    expect(
      Object.fromEntries(
        report.assets.by_extension.map((v) => [v.key, v.count]),
      ),
    ).toEqual({ png: 1, unknown: 1 });
  });
});

describe("selected conversations and branches", () => {
  it("includes selected groups consistently in overview, timeline, and rankings", async () => {
    const parsed = await parseOne(
      [],
      [
        jsonEntry("group_chats.json", {
          chats: [
            {
              id: "group",
              name: "Synthetic group",
              messages: [
                {
                  id: "gm",
                  role: "user",
                  text: "hello",
                  created_at: "2024-03-10T12:00:00Z",
                },
              ],
            },
          ],
        }),
      ],
    );
    const report = buildReport(parsed);
    expect(report.overview.conversation_count).toBe(1);
    expect(report.meta.table_counts.conversations).toBe(1);
    expect(report.timeline.months[0].conversation_count).toBe(1);
    expect(report.conversations.longest_by_messages[0].conversation_id).toBe(
      "group",
    );
    expect(
      buildReport(parsed, { ...DEFAULT_OPTIONS, includeGroups: false }).overview
        .conversation_count,
    ).toBe(0);
  });
  it.each(["__proto__", "constructor", "toString"])(
    "treats inherited node key %s as dangling and retains history",
    async (current_node) => {
      const input = { ...conversation(), current_node };
      const report = buildReport(await parseOne([input]));
      expect(report.meta.table_counts.messages).toBe(3);
      expect(
        report.warnings?.some((w) => w.code === "current_branch_unavailable"),
      ).toBe(true);
    },
  );
  it("warns when a parent points at an inherited mapping property", async () => {
    const input = conversation();
    input.mapping.root.parent = "__proto__" as never;
    const report = buildReport(await parseOne([input]));
    expect(report.meta.table_counts.messages).toBe(2);
    expect(
      report.warnings?.some((w) => w.code === "branch_parent_missing"),
    ).toBe(true);
  });
  it("retains all conversations for global sorting beyond the legacy Top 20", async () => {
    const inputs = Array.from({ length: 26 }, (_, index) => {
      const mapping = Object.fromEntries(
        Array.from({ length: index + 1 }, (_, i) => [
          `n${i}`,
          {
            parent: i ? `n${i - 1}` : null,
            message: message(`${index}-${i}`, "user", 1704067200, ""),
          },
        ]),
      );
      return { id: `c${index + 1}`, current_node: `n${index}`, mapping };
    });
    const report = buildReport(await parseOne(inputs));
    expect(report.conversations.longest_by_messages).toHaveLength(20);
    expect(report.conversations.ranking).toHaveLength(26);
    expect(
      [...report.conversations.ranking!].sort(
        (a, b) => a.message_count - b.message_count,
      )[0].message_count,
    ).toBe(1);
    expect(restoreReport(report).conversations.ranking).toHaveLength(26);
  });
});

describe("complete report validation and migration", () => {
  it.each([
    "2024-02-30",
    "2024-02-30T00:00:00Z",
    "2024-01-01T24:00:00Z",
    "not-a-date",
  ])("rejects invalid generated_at %s", async (invalid) => {
    const report = buildReport(await fixture());
    report.meta.generated_at = invalid;
    expect(() => restoreReport(report)).toThrow(/Invalid/);
  });
  it.each(["models", "assets", "keywords"])(
    "rejects malformed month dictionary keys in %s",
    async (section) => {
      const report = buildReport(await fixture());
      if (section === "models")
        report.models.monthly_primary_model["2024-99"] = "x";
      if (section === "assets")
        report.assets.monthly["not-a-date"] = { image: 1 };
      if (section === "keywords")
        report.frequent_words.monthly["2024-02-31"] = [];
      expect(() => restoreReport(report)).toThrow(/Invalid/);
    },
  );
  it.each(["not-a-number", -1, Infinity, NaN])(
    "rejects non-count dynamic timeline metric %s",
    async (invalid) => {
      const report = buildReport(await fixture());
      report.timeline.months[0].tool_message_count = invalid;
      expect(() => restoreReport(report)).toThrow(/Invalid/);
    },
  );
  it("retains valid dynamic counts and leap-day timestamps", async () => {
    const report = buildReport(await fixture());
    report.meta.generated_at = "2024-02-29T23:59:59.000Z";
    report.timeline.months[0].tool_message_count = 1;
    expect(restoreReport(report).timeline.months[0].tool_message_count).toBe(1);
  });
  it("preserves original v1 warnings plus the migration notice across a second restore", async () => {
    const report = buildReport(await fixture());
    report.meta.schema_version = 1;
    report.meta.parse_warning_count = 7;
    report.meta.table_counts.parse_warnings = 7;
    const restored = restoreReport(report);
    expect(restored.meta.parse_warning_count).toBe(8);
    expect(restored.meta.table_counts.parse_warnings).toBe(8);
    expect(
      restored.warnings?.find((w) => w.code === "legacy_parse_warnings")
        ?.message,
    ).toContain("7");
    expect(restoreReportText(JSON.stringify(restored))).toEqual(restored);
  });
});

describe("share card bounds and period", () => {
  it("labels inclusive custom dates instead of the internal year enum", async () => {
    const data = buildReport(await fixture(), {
      ...DEFAULT_OPTIONS,
      year: "custom",
      start: "2024-03-01",
      end: "2024-03-31",
    });
    const svg = shareSvg(data, {
      keywords: false,
      titles: false,
      language: "en",
    });
    expect(svg).toContain("2024-03-01 → 2024-03-31");
    expect(svg).not.toContain(">custom</text>");
  });
  it("fits full-width titles and explicitly marks longer truncation", () => {
    const fitted = shareText("汉".repeat(50), 80);
    expect(fitted.fontSize * 50).toBeLessThanOrEqual(900);
    expect(fitted.text).toBe("汉".repeat(50));
    expect(shareText("汉".repeat(100), 80).text.endsWith("…")).toBe(true);
  });
});

/** Same byte-reader interface as JSZip; the data chunks bypass ZIP metadata entirely. */
function streamOf(
  chunks: Uint8Array[],
): ZipByteStream & { paused: () => boolean } {
  let paused = false;
  const callbacks: Record<string, (value?: unknown) => void> = {};
  return {
    on(
      event: string,
      callback:
        | ((value: Uint8Array) => void)
        | ((error: Error) => void)
        | (() => void),
    ) {
      callbacks[event] = callback as (value?: unknown) => void;
    },
    pause() {
      paused = true;
    },
    paused: () => paused,
    resume() {
      queueMicrotask(() => {
        for (const chunk of chunks) {
          if (paused) return;
          callbacks.data(chunk);
        }
        if (!paused) callbacks.end();
      });
    },
  };
}
describe("actual decompressed output caps", () => {
  it("pauses as soon as real chunk bytes exceed the per-file cap", async () => {
    const stream = streamOf([new Uint8Array(9), new Uint8Array(8)]);
    await expect(
      readBoundedZipStream(stream, 0, undefined, {
        fileBytes: 16,
        totalBytes: 100,
      }),
    ).rejects.toThrow(/128/);
    expect(stream.paused()).toBe(true);
  });
  it("enforces cumulative real bytes across entries even within the per-file cap", async () => {
    const first = await readBoundedZipStream(
      streamOf([new Uint8Array(12)]),
      0,
      undefined,
      { fileBytes: 16, totalBytes: 24 },
    );
    const stream = streamOf([new Uint8Array(8), new Uint8Array(5)]);
    await expect(
      readBoundedZipStream(stream, first.sizeBytes, undefined, {
        fileBytes: 16,
        totalBytes: 24,
      }),
    ).rejects.toThrow(/512/);
    expect(stream.paused()).toBe(true);
  });
  it("accepts actual output exactly at both limits", async () => {
    const result = await readBoundedZipStream(
      streamOf([new Uint8Array(8), new Uint8Array(8)]),
      8,
      undefined,
      { fileBytes: 16, totalBytes: 24 },
    );
    expect(result.sizeBytes).toBe(16);
    expect(result.chunks).toHaveLength(2);
  });
  it("pauses an already cancelled byte reader", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = streamOf([new Uint8Array(1)]);
    await expect(
      readBoundedZipStream(stream, 0, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(stream.paused()).toBe(true);
  });
});
