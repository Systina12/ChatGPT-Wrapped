import { describe, expect, it } from "vitest";
import { buildReport, MAX_MONTHS } from "../src/lib/report/engine";
import {
  restoreReport,
  restoreReportText,
  readReportFile,
  MAX_REPORT_BYTES,
} from "../src/lib/report/restore";
import {
  saveReport,
  loadReport,
  clearReport,
  STORAGE_KEY,
} from "../src/lib/report/storage";
import { shareSvg, escapeXml } from "../src/lib/report/share";
import { chineseTerms, frequentTerms } from "../src/lib/stats/text";
import { scopeExport, validateOptions } from "../src/lib/stats/scope";
import { parseExportEntries } from "../src/lib/export/parser";
import { DEFAULT_OPTIONS } from "../src/types/options";
import { conversation, fixture, jsonEntry, exportFiles } from "./fixtures";
describe("scope validation", () => {
  it.each([
    { timezone: "Mars/Foo" },
    { year: "24" },
    { roles: "assistant" },
    { branches: "latest" },
    { includeGroups: "true" },
    { year: "custom", start: "2024-02-30", end: "2024-03-01" },
    { year: "custom", start: "2024-03-11", end: "2024-03-10" },
    { year: "custom" },
  ])("rejects invalid options %j", (options) => {
    expect(() => validateOptions({ ...DEFAULT_OPTIONS, ...options })).toThrow();
  });
  it("accepts leap days", () => {
    expect(
      validateOptions({
        ...DEFAULT_OPTIONS,
        year: "custom",
        start: "2024-02-29",
        end: "2024-02-29",
      }).start,
    ).toBe("2024-02-29");
  });
  it("includes both range endpoints and removes original conversation dates", async () => {
    const report = buildReport(await fixture(), {
      ...DEFAULT_OPTIONS,
      year: "custom",
      start: "2024-03-10",
      end: "2024-03-10",
    });
    expect(report.meta.table_counts.messages).toBe(2);
    expect(report.overview.first_seen_at?.startsWith("2024-03-10")).toBe(true);
    expect(report.timeline.years.map((y) => y.key)).toEqual(["2024"]);
  });
  it("traverses nodes without messages", async () => {
    expect(scopeExport(await fixture()).messages).toHaveLength(2);
  });
  it.each([null, "dangling"])(
    "retains history if current_node is %s",
    async (current) => {
      const c = { ...conversation(), current_node: current };
      const data = buildReport(
        await parseExportEntries([jsonEntry("conversations.json", [c])]),
      );
      expect(data.meta.table_counts.messages).toBe(3);
      expect(
        data.warnings?.some((w) => w.code === "current_branch_unavailable"),
      ).toBe(true);
    },
  );
  it("breaks parent loops with a visible warning", async () => {
    const c = conversation();
    c.mapping.root.parent = "answer" as never;
    const data = buildReport(
      await parseExportEntries([jsonEntry("conversations.json", [c])]),
    );
    expect(data.meta.table_counts.messages).toBe(2);
    expect(data.warnings?.some((w) => w.code === "branch_cycle")).toBe(true);
  });
  it("filters roles and branches then recomputes", async () => {
    const parsed = await fixture();
    expect(
      buildReport(parsed, { ...DEFAULT_OPTIONS, roles: "user" }).meta
        .table_counts.messages,
    ).toBe(1);
    expect(
      buildReport(parsed, { ...DEFAULT_OPTIONS, branches: "all" }).meta
        .table_counts.messages,
    ).toBe(3);
    expect(buildReport(parsed).meta.table_counts.messages).toBe(2);
  });
  it("excludes undated messages only for a date range", async () => {
    const parsed = await fixture();
    parsed.messages[0].createTime = null;
    const report = buildReport(parsed, { ...DEFAULT_OPTIONS, year: "2024" });
    expect(report.meta.table_counts.messages).toBe(1);
    expect(
      report.warnings?.some((w) => w.code === "undated_messages_excluded"),
    ).toBe(true);
  });
  it("filters associated feedback, shares and group chats", async () => {
    const parsed = await parseExportEntries([
      ...exportFiles(),
      jsonEntry("group_chats.json", {
        chats: [
          {
            id: "group",
            name: "Synthetic group",
            messages: [
              {
                id: "gm",
                role: "user",
                text: "hi",
                created_at: "2024-03-10T12:00Z",
              },
            ],
          },
        ],
      }),
    ]);
    const report = buildReport(parsed, {
      ...DEFAULT_OPTIONS,
      year: "2023",
      includeGroups: false,
    });
    expect(report.quality.feedback_count).toBe(0);
    expect(report.quality.shared_conversation_count).toBe(0);
    expect(report.conversations.archived_count).toBe(1);
    expect(report.meta.table_counts.group_chats).toBe(0);
  });
});
describe("year comparison and month continuity", () => {
  it("compares the previous year using the same scope", async () => {
    const data = buildReport(await parseExportEntries(exportFiles()), {
      ...DEFAULT_OPTIONS,
      year: "2024",
      roles: "user",
    });
    expect(data.comparison?.message_count).toBe(1);
    expect(data.comparison?.message_growth_percent).toBe(0);
    expect(data.timeline.months).toHaveLength(12);
    expect(data.timeline.months[0].message_count).toBe(0);
  });
  it("represents no prior data without Infinity", async () => {
    const data = buildReport(await fixture(), {
      ...DEFAULT_OPTIONS,
      year: "2024",
    });
    expect(data.comparison?.has_data).toBe(false);
    expect(data.comparison?.message_growth_percent).toBeNull();
  });
  it("bounds anomalous calendar spans", async () => {
    const data = buildReport(await fixture(), {
      ...DEFAULT_OPTIONS,
      year: "custom",
      start: "0001-01-01",
      end: "9999-12-31",
    });
    expect(data.timeline.months.length).toBeLessThanOrEqual(MAX_MONTHS);
    expect(data.warnings?.some((w) => w.code === "month_span_limited")).toBe(
      true,
    );
  });
});
describe("keywords", () => {
  it.each([true, false])(
    "preserves technical words with segmenter=%s",
    (segmenter) => {
      const words = chineseTerms(
        "请问 人工智能 机器学习 深度学习 数据分析 大模型 提示词 编程",
        segmenter,
      );
      expect(words).toEqual(
        expect.arrayContaining([
          "人工智能",
          "机器学习",
          "深度学习",
          "数据分析",
          "大模型",
          "提示词",
          "编程",
        ]),
      );
      expect(words).not.toContain("请问");
    },
  );
  it("filters English stop words", () => {
    expect(frequentTerms(["the and AI programming programming"])[0]).toEqual({
      term: "programming",
      count: 2,
    });
  });
});
describe("report restore and storage", () => {
  it("round trips the complete v2 report", async () => {
    const data = buildReport(await fixture());
    expect(restoreReportText(JSON.stringify(data))).toEqual(data);
  });
  it("migrates complete version 1 reports", async () => {
    const data = buildReport(await fixture());
    data.meta.schema_version = 1;
    delete data.options;
    expect(restoreReport(data).meta.schema_version).toBe(2);
  });
  it.each([null, {}, { meta: { schema_version: 42 } }])(
    "rejects unsupported input %j",
    (value) => {
      expect(() => restoreReport(value)).toThrow(/Unsupported/);
    },
  );
  it("rejects incomplete reports, invalid dates, negatives, NaN and invalid options", async () => {
    const data = buildReport(await fixture());
    for (const change of [
      (d: typeof data) => {
        d.overview.user_message_count = -1;
      },
      (d: typeof data) => {
        d.overview.total_character_count = Infinity;
      },
      (d: typeof data) => {
        d.overview.first_seen_at = "2024-02-30T00:00Z";
      },
      (d: typeof data) => {
        d.options!.roles = "assistant" as never;
      },
      (d: typeof data) => {
        delete (d as Partial<typeof data>).assets;
      },
    ]) {
      const copy = structuredClone(data);
      change(copy);
      expect(() => restoreReport(copy)).toThrow(/Invalid/);
    }
  });
  it("rejects malformed and oversized JSON", async () => {
    expect(() => restoreReportText("{")).toThrow(/JSON/);
    await expect(
      readReportFile({ size: MAX_REPORT_BYTES + 1 } as File),
    ).rejects.toThrow(/20/);
  });
  it("saves, loads and clears only when called", async () => {
    const map = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      getItem: (k: string) => map.get(k) || null,
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    expect(map.size).toBe(0);
    saveReport(buildReport(await fixture()), storage);
    expect(map.has(STORAGE_KEY)).toBe(true);
    expect(loadReport(storage).meta.schema_version).toBe(2);
    clearReport(storage);
    expect(map.size).toBe(0);
  });
  it("reports storage quota failures", async () => {
    const report = buildReport(await fixture());
    expect(() =>
      saveReport(report, {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      }),
    ).toThrow(/storage full/);
    expect(() =>
      loadReport({
        getItem: () => {
          throw new Error();
        },
      }),
    ).toThrow(/unavailable/);
  });
});
describe("sharing privacy", () => {
  it("excludes titles, keywords, excerpts and attachment names by default", async () => {
    const data = buildReport(await fixture());
    const svg = shareSvg(data, {
      keywords: false,
      titles: false,
      language: "zh",
    });
    expect(svg).not.toContain("Synthetic");
    expect(svg).not.toContain("人工智能");
    expect(svg).not.toContain("text_excerpt");
  });
  it("includes only opted-in private fields and escapes XML", async () => {
    const data = buildReport(await fixture());
    data.conversations.longest_by_messages[0].title = '<script>&"\u0000';
    const svg = shareSvg(data, {
      keywords: true,
      titles: true,
      language: "en",
    });
    expect(svg).toContain("人工智能");
    expect(svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(svg).not.toContain("\u0000");
    expect(svg).not.toContain("<script>");
    expect(escapeXml("a\ud800b")).toBe("ab");
  });
});
