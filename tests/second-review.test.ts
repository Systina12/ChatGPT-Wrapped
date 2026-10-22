import { describe, expect, it, vi } from "vitest";
import { classifyAsset } from "../src/lib/export/assets";
import { parseExportEntries } from "../src/lib/export/parser";
import { buildReport } from "../src/lib/report/engine";
import {
  prepareReportDownload,
  serializeWrappedData,
} from "../src/lib/report/download";
import {
  MAX_REPORT_BYTES,
  restoreReport,
  restoreReportText,
} from "../src/lib/report/restore";
import { loadReport, saveReport } from "../src/lib/report/storage";
import { CalendarCache } from "../src/lib/stats/calendarCache";
import { validateOptions } from "../src/lib/stats/scope";
import { frequentTerms } from "../src/lib/stats/text";
import { DEFAULT_OPTIONS } from "../src/types/options";
import type { ParsedAsset } from "../src/types/export";
import { conversation, fixture, jsonEntry, message } from "./fixtures";

describe("second review: data integrity", () => {
  it.each(["constructor", "__proto__", "toString"])(
    "imports an attachment with inherited-property suffix %s",
    async (extension) => {
      const c = conversation();
      c.mapping.root.message.content.parts = [
        { content_type: "file", asset_pointer: `synthetic.${extension}` },
      ] as never;
      const parsed = await parseExportEntries([
        jsonEntry("conversations.json", [c]),
      ]);
      expect(parsed.assets[0].mimeType).toBeNull();
      expect(buildReport(parsed).assets.by_category.file).toBe(1);
    },
  );
  it.each(["__proto__", "constructor", "toString"])(
    "preserves feedback key %s across JSON and storage round trips",
    async (key) => {
      const parsed = await fixture();
      parsed.feedback.push({
        id: "f",
        conversationId: "conversation-1",
        messageId: "conversation-1-user",
        rating: key,
        createTime: null,
        updateTime: null,
        raw: {},
      });
      const report = buildReport(parsed);
      const restored = restoreReportText(JSON.stringify(report));
      expect(Object.hasOwn(restored.quality.feedback_by_rating, key)).toBe(
        true,
      );
      expect(restored.quality.feedback_by_rating[key]).toBe(1);
      let saved = "";
      const storage = {
        setItem: (_key: string, value: string) => {
          saved = value;
        },
        getItem: () => saved,
      };
      saveReport(report, storage);
      expect(loadReport(storage).quality.feedback_by_rating[key]).toBe(1);
      expect(Object.getPrototypeOf(restored.quality.feedback_by_rating)).toBe(
        Object.prototype,
      );
    },
  );
  it.each(["bad", -1, Infinity, NaN])(
    "validates values even under __proto__: %s",
    async (value) => {
      const report = buildReport(await fixture());
      report.quality.feedback_by_rating = Object.fromEntries([
        ["__proto__", value],
      ]) as never;
      expect(() => restoreReport(report)).toThrow(/Invalid/);
    },
  );
  it("merges overlapping shards and preserves the union of branch nodes", async () => {
    const first = conversation("c"),
      second = conversation("c");
    delete (first.mapping as Record<string, unknown>).answer;
    delete (second.mapping as Record<string, unknown>).root;
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [first]),
      jsonEntry("conversations-1.json", [second]),
    ]);
    const report = buildReport(parsed);
    expect(parsed.conversations).toHaveLength(1);
    expect(report.overview.conversation_count).toBe(1);
    expect(report.meta.table_counts.messages).toBe(2);
    expect(report.conversations.ranking).toHaveLength(1);
    expect(report.conversations.archived_count).toBe(1);
    expect(
      report.warnings?.some((w) => w.code === "duplicate_conversation"),
    ).toBe(true);
    expect(
      report.warnings?.some((w) => w.code === "branch_parent_missing"),
    ).toBe(false);
  });
  it("keeps a valid node when a later duplicate is damaged and reports the conflict", async () => {
    const first = conversation("c"),
      next = conversation("c");
    next.mapping.root.message = "damaged" as never;
    const report = buildReport(
      await parseExportEntries([
        jsonEntry("conversations.json", [first]),
        jsonEntry("conversations-1.json", [next]),
      ]),
    );
    expect(report.overview.user_message_count).toBe(1);
    expect(
      report.warnings?.some((w) => w.code === "conflicting_conversation"),
    ).toBe(true);
  });
  it("keeps fallback IDs distinct across folders with identical basenames", async () => {
    const a = { ...conversation(), id: undefined },
      b = { ...conversation(), id: undefined };
    const left = jsonEntry("conversations.json", [a]),
      right = jsonEntry("conversations.json", [b]);
    left.path = "a/conversations.json";
    right.path = "b/conversations.json";
    const parsed = await parseExportEntries([left, right]);
    expect(
      new Set(parsed.conversations.map((c) => c.conversationId)).size,
    ).toBe(2);
  });
  it.each(["all", "2024"])(
    "ignores dormant date ordering in %s mode",
    (year) => {
      expect(
        validateOptions({
          ...DEFAULT_OPTIONS,
          year,
          start: "2024-12-31",
          end: "2024-01-01",
        }),
      ).toMatchObject({ start: "", end: "" });
      expect(() =>
        validateOptions({
          ...DEFAULT_OPTIONS,
          year: "custom",
          start: "2024-12-31",
          end: "2024-01-01",
        }),
      ).toThrow(/precede/);
    },
  );
  it("keeps unknown model attribution without presenting it as a known winner", async () => {
    const c = conversation();
    c.mapping.answer.message.metadata = {};
    const report = buildReport(
      await parseExportEntries([jsonEntry("conversations.json", [c])]),
    );
    expect(report.models.models).toMatchObject([
      { model: "unknown", message_count: 1 },
    ]);
    expect(report.models.most_used_model).toBeNull();
    expect(report.models.monthly_primary_model["2024-03"]).toBeNull();
  });
  it.each(["png", "mp3", "README"])(
    "does not treat an extensionless name %s as a suffix",
    (name) => {
      const asset: ParsedAsset = {
        source: "attachment",
        localPath: name,
        displayName: name,
        mimeType: "text/plain",
        fileExtension: null,
        sizeBytes: 1,
        width: null,
        height: null,
        conversationId: "c",
        messageId: "m",
        raw: {},
      };
      expect(classifyAsset(asset)).toBe("file");
      expect(classifyAsset({ ...asset, fileExtension: ".png" })).toBe("image");
    },
  );
  it("synchronizes every warning count after limiting anomalous month spans", async () => {
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [
        conversation("early", Date.parse("1800-01-01Z") / 1000),
        conversation("late", Date.parse("2025-01-01Z") / 1000),
      ]),
    ]);
    const report = buildReport(parsed);
    expect(report.warnings?.some((w) => w.code === "month_span_limited")).toBe(
      true,
    );
    expect(report.meta.parse_warning_count).toBe(report.warnings?.length);
    expect(report.meta.table_counts.parse_warnings).toBe(
      report.warnings?.length,
    );
  });
});

describe("second review: export size and computation", () => {
  it("exports a reopenable compact report from a legitimate large source while retaining full data separately", async () => {
    const records = Array.from({ length: 60000 }, (_, i) => ({
      id: `large-${i}`,
      title: `Synthetic ${i} ${"x".repeat(512)}`,
      current_node: "n",
      mapping: {
        n: { parent: null, message: message(`m${i}`, "user", 1704067200, "") },
      },
    }));
    const source = jsonEntry("conversations.json", records);
    expect(source.size).toBeLessThan(128 * 1024 * 1024);
    const report = buildReport(await parseExportEntries([source]));
    const full = serializeWrappedData(report);
    expect(new Blob([full]).size).toBeGreaterThan(MAX_REPORT_BYTES);
    const result = prepareReportDownload(report);
    expect(result.compacted).toBe(true);
    expect(new Blob([result.text]).size).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    const restored = restoreReportText(result.text);
    expect(restored.overview).toEqual(report.overview);
    expect(restored.conversations.ranking).toBeUndefined();
    expect(restored.warnings?.at(-1)?.code).toBe("compact_report");
    expect(report.conversations.ranking).toHaveLength(60000);
    expect(JSON.parse(full).conversations.ranking).toHaveLength(60000);
  }, 30000);
  it("preserves all fields when ordinary reports fit the reopening limit", async () => {
    const report = buildReport(await fixture());
    const result = prepareReportDownload(report);
    expect(result.compacted).toBe(false);
    expect(restoreReportText(result.text)).toEqual(report);
  });
  it("refuses to label oversized non-ranking data as a reopenable report", async () => {
    const report = buildReport(await fixture());
    report.warnings = [
      { code: "synthetic", message: "x".repeat(MAX_REPORT_BYTES) },
    ];
    expect(() => prepareReportDownload(report)).toThrow(/20 MiB/);
  });
  it("reuses calendar conversions, preserves term totals and reports intermediate statistics progress", async () => {
    const c = conversation();
    c.current_node = "n99";
    c.mapping = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        `n${i}`,
        {
          parent: i ? `n${i - 1}` : null,
          message: message(
            `m${i}`,
            i % 2 ? "user" : "assistant",
            1704067200 + i * 60,
            "讨论设计方案 alpha alpha",
          ),
        },
      ]),
    ) as never;
    const parsed = await parseExportEntries([
      jsonEntry("conversations.json", [c]),
    ]);
    const cache = new CalendarCache("Asia/Shanghai");
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    try {
      const progress: number[] = [];
      const options = {
        ...DEFAULT_OPTIONS,
        timezone: cache.timezone,
        year: "2024",
      };
      const report = buildReport(parsed, options, {
        cache,
        onProgress: (completed) => progress.push(completed),
      });
      expect(spy.mock.calls.length).toBeLessThan(110);
      spy.mockClear();
      const again = buildReport(parsed, options, { cache });
      expect(spy.mock.calls.length).toBeLessThan(10);
      expect(again.overview).toEqual(report.overview);
      expect(report.frequent_words.all).toEqual(
        frequentTerms(parsed.messages.map((m) => m.text)),
      );
      expect(report.frequent_words.user).toEqual(
        frequentTerms(
          parsed.messages.filter((m) => m.role === "user").map((m) => m.text),
        ),
      );
      expect(report.frequent_words.monthly["2024-01"]).toEqual(
        frequentTerms(
          parsed.messages.map((m) => m.text),
          10,
        ),
      );
      expect(progress[0]).toBe(0);
      expect(progress.at(-1)).toBe(12);
      expect(
        progress.filter((value) => value > 0 && value < 12).length,
      ).toBeGreaterThan(5);
      expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    } finally {
      spy.mockRestore();
    }
  });
  it("excludes irrelevant JSON from parsing progress", async () => {
    const progress: { completed: number; total: number }[] = [];
    await parseExportEntries(
      [jsonEntry("conversations.json", []), jsonEntry("unrelated.json", {})],
      (p) => {
        if (p.phase === "parsing") progress.push(p);
      },
    );
    expect(progress.at(-1)).toMatchObject({ completed: 1, total: 1 });
  });
});
