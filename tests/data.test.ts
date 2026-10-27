import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { File } from "node:buffer";
import { parseExportEntries } from "../src/lib/export/parser";
import {
  filesToExportEntries,
  checkJsonSize,
} from "../src/lib/export/fileInput";
import { buildReport } from "../src/lib/report/engine";
import { DEFAULT_OPTIONS } from "../src/types/options";
import {
  calendarDate,
  dayKey,
  longestStreak,
  toDate,
} from "../src/lib/stats/time";
import { classifyAsset, mergeAssets } from "../src/lib/export/assets";
import type { ParsedAsset } from "../src/types/export";
import { conversation, fixture, jsonEntry, message } from "./fixtures";
const browserFile = (file: File) => file as unknown as globalThis.File;
describe("main input integrity", () => {
  it("rejects missing main files", async () => {
    await expect(parseExportEntries([])).rejects.toThrow(/Missing/);
  });
  it.each(["{", "null", "{}", "[null]", "[{}]"])(
    "rejects damaged main input %s",
    async (text) => {
      await expect(
        parseExportEntries([
          {
            name: "conversations.json",
            path: "conversations.json",
            text,
            size: text.length,
          },
        ]),
      ).rejects.toThrow(/damaged/);
    },
  );
  it("accepts a legitimate empty array", async () => {
    const data = buildReport(
      await parseExportEntries([jsonEntry("conversations.json", [])]),
    );
    expect(data.meta.table_counts.messages).toBe(0);
    expect(data.timeline.most_active_day).toBeNull();
    expect(data.activity.most_active_hour).toBeNull();
  });
  it("keeps warnings when some shards fail", async () => {
    const parsed = await parseExportEntries([
      jsonEntry("conversations-1.json", [conversation()]),
      {
        name: "conversations-2.json",
        path: "conversations-2.json",
        text: "{",
        size: 1,
      },
    ]);
    expect(parsed.messages.length).toBe(3);
    expect(parsed.warnings.some((w) => w.code === "invalid_json")).toBe(true);
  });
});
describe("size limits and selective inflation", () => {
  const limits = { fileBytes: 128, totalBytes: 512 };
  it("enforces an explicit caller budget at the exact boundaries", () => {
    expect(() => checkJsonSize(129, 129, limits)).toThrow(/per-file/);
    expect(() => checkJsonSize(1, 513, limits)).toThrow(/total/);
    expect(() => checkJsonSize(128, 512, limits)).not.toThrow();
  });
  it("does not impose the former per-file or total JSON caps by default", async () => {
    expect(() => checkJsonSize(2 ** 30, 6 * 2 ** 30)).not.toThrow();
    const files = Array.from({ length: 5 }, (_, i) => ({
      name: `conversations-${i}.json`, size: 256 * 1024 * 1024,
    } as globalThis.File));
    expect(await filesToExportEntries(files)).toHaveLength(5);
  });
  it("applies an explicit per-file budget to folders before parsing", async () => {
    const file = {
      name: "conversations.json",
      size: 129,
    } as globalThis.File;
    await expect(filesToExportEntries([file], { limits })).rejects.toThrow(/per-file/);
  });
  it("checks cumulative folder size", async () => {
    const files = Array.from(
      { length: 5 },
      (_, i) =>
        ({
          name: `conversations-${i}.json`,
          size: 128,
        }) as globalThis.File,
    );
    await expect(filesToExportEntries(files, { limits })).rejects.toThrow(/total/);
  });
  it("inflates only relevant JSON and reports progress", async () => {
    const zip = new JSZip();
    zip.file("export/conversations.json", "[]");
    zip.file("export/unrelated.json", "{broken");
    zip.file("export/photo.png", "binary");
    const file = new File(
      [await zip.generateAsync({ type: "uint8array" })],
      "data.zip",
    );
    const progress: unknown[] = [];
    const entries = await filesToExportEntries([browserFile(file)], {
      onProgress: (p) => progress.push(p),
    });
    expect(
      entries.find((e) => e.name === "unrelated.json")?.text,
    ).toBeUndefined();
    expect(entries.find((e) => e.name === "photo.png")?.text).toBeUndefined();
    expect(
      entries.find((e) => e.name === "conversations.json")?.text,
    ).toBeUndefined();
    expect(progress).toHaveLength(0);
    const parsed = await parseExportEntries(entries);
    expect(parsed.messages).toHaveLength(0);
    expect(progress.length).toBe(1);
  });
  it("rejects inconsistent ZIP uncompressed-size metadata", async () => {
    const zip = new JSZip();
    zip.file("conversations.json", " ".repeat(1024) + "[]");
    const bytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    }); // A malformed advertised length must never be treated as valid JSON.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < bytes.length - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50)
        view.setUint32(i + 24, 1, true);
    await expect(
      filesToExportEntries([browserFile(new File([bytes], "bad.zip"))]).then(
        parseExportEntries,
      ),
    ).rejects.toThrow();
  });
  it("supports cancellation", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      filesToExportEntries([], { signal: abort.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
describe("calendar and scale", () => {
  it("computes 150000 messages without argument spreading", async () => {
    const parsed = await fixture();
    const original = parsed.messages[0];
    parsed.messages = Array.from({ length: 150000 }, (_, i) => ({
      ...original,
      messageId: String(i),
      nodeId: "root",
      text: "",
      createTime: 1704067200 + i,
    }));
    const report = buildReport(parsed, { ...DEFAULT_OPTIONS, branches: "all" });
    expect(report.meta.table_counts.messages).toBe(150000);
    expect(report.overview.first_seen_at).toBe("2024-01-01T00:00:00.000Z");
  }, 30000);
  it("rejects invalid timestamp ranges", () => {
    expect(toDate(1e30)).toBeNull();
  });
  it("uses the chosen calendar across midnight", async () => {
    const c = conversation("c", Date.parse("2024-01-01T00:30Z") / 1000);
    const report = buildReport(
      await parseExportEntries([jsonEntry("conversations.json", [c])]),
      { ...DEFAULT_OPTIONS, timezone: "America/Los_Angeles" },
    );
    expect(report.timeline.days[0].key).toBe("2023-12-31");
    expect(report.activity.by_hour["16"]).toBe(2);
    expect(report.activity.by_weekday["6"]).toBe(2);
    expect(report.timeline.months[0].key).toBe("2023-12");
  });
  it.each([
    ["2024-03-09T17:00Z", "2024-03-10T16:00Z", "2024-03-11T16:00Z"],
    ["2024-11-02T16:00Z", "2024-11-03T17:00Z", "2024-11-04T17:00Z"],
  ])("streaks cross DST by calendar day", (...dates) => {
    const keys = dates.map((s) =>
      dayKey(calendarDate(new Date(s), "America/New_York")),
    );
    expect(longestStreak(keys).days).toBe(3);
  });
});
describe("attachment merging", () => {
  it("merges content and metadata before all statistics", async () => {
    const c = conversation();
    const m = c.mapping.root.message as ReturnType<typeof message>;
    m.content = {
      content_type: "multimodal_text",
      parts: [
        {
          asset_pointer: "same",
          content_type: "image_asset_pointer",
          width: 640,
        } as unknown as string,
      ],
    };
    m.metadata = {
      attachments: [
        {
          asset_pointer: "same",
          mime_type: "image/png",
          width: 1280,
          height: 720,
          size_bytes: 100,
        },
      ],
    } as never;
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [c]),
      jsonEntry("library_files.json", [
        { id: "lib", file_id: "same", mime_type: "image/png" },
      ]),
    ]);
    const report = buildReport(parsed);
    expect(report.assets.total_count).toBe(1);
    expect(report.overview.image_count).toBe(1);
    expect(report.timeline.months[0].image_count).toBe(1);
    expect(report.conversations.most_assets[0].asset_count).toBe(1);
    expect(
      parsed.assets.filter((a) => a.source !== "library_file")[0].width,
    ).toBe(1280);
  });
  it("recognizes content types, audio fields and extensions", () => {
    const base = {
      mimeType: null,
      fileExtension: null,
      displayName: null,
      localPath: "opaque",
      raw: { audio_asset_pointer: "opaque" },
    } as ParsedAsset;
    expect(classifyAsset(base)).toBe("voice");
    expect(classifyAsset({ ...base, raw: { audio: true } })).toBe("voice");
    expect(
      classifyAsset({ ...base, mimeType: "image/png", raw: { audio: true } }),
    ).toBe("image");
    expect(
      classifyAsset({ ...base, raw: { content_type: "image_asset_pointer" } }),
    ).toBe("image");
    expect(classifyAsset({ ...base, raw: {}, localPath: "song.opus" })).toBe(
      "voice",
    );
  });
  it("keeps richer metadata and distinguishes messages", () => {
    const base = {
      source: "attachment",
      localPath: "a",
      messageId: "m",
      conversationId: "c",
      raw: {},
      mimeType: null,
      width: 10,
    } as ParsedAsset;
    const merged = mergeAssets([
      base,
      { ...base, mimeType: "image/png", width: 100 },
      { ...base, messageId: "other" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].mimeType).toBe("image/png");
    expect(merged[0].width).toBe(100);
  });
});

it("recognizes an audio pointer directly on message content", async () => {
  const c = conversation();
  const raw = c.mapping.root.message as unknown as Record<string, unknown>;
  raw.content = { content_type: "audio", audio_asset_pointer: "opaque-audio" };
  const report = buildReport(
    await parseExportEntries([jsonEntry("conversations.json", [c])]),
  );
  expect(report.overview.voice_count).toBe(1);
  expect(report.assets.by_category.voice).toBe(1);
});
it("keeps same-ID messages and their attachments isolated across conversations", async () => {
  const first = conversation("one", Date.parse("2023-01-01T12:00Z") / 1000),
    second = conversation("two", Date.parse("2024-02-01T12:00Z") / 1000);
  for (const c of [first, second]) {
    c.mapping.root.message.id = "shared-id";
    c.mapping.root.message.metadata = {
      attachments: [
        { asset_pointer: "same-image.png", mime_type: "image/png" },
      ],
    } as never;
  }
  const report = buildReport(
    await parseExportEntries([
      jsonEntry("conversations.json", [first, second]),
    ]),
  );
  expect(report.meta.table_counts.messages).toBe(4);
  expect(report.assets.total_count).toBe(2);
  expect(report.assets.monthly["2023-01"].image).toBe(1);
  expect(report.assets.monthly["2024-02"].image).toBe(1);
});
