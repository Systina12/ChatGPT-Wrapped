import { describe, expect, it } from "vitest";
import {
  excerpt,
  textTerms,
  chineseTerms,
  languageCounts,
  forEachTermCount,
} from "../src/lib/stats/text";
import { exceedsUtf8Bytes } from "../src/lib/report/utf8";
import { prepareReportDownload } from "../src/lib/report/download";
import { restoreReportText, MAX_REPORT_BYTES } from "../src/lib/report/restore";
import { buildReport } from "../src/lib/report/engine";
import { fixture } from "./fixtures";

function frequencies(terms: Iterable<string>) {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
  return counts;
}
describe("long-message analysis", () => {
  it("keeps CJK range boundaries and non-CJK separators exact", () => {
    expect(
      chineseTerms("\u33ff\u3400\u4dbf\u4dc0\u4e00\u9fff\ua000", false),
    ).toEqual(["\u3400\u4dbf", "\u4e00\u9fff"]);
    expect(chineseTerms("天地🙂玄黄\ud840\udc00宇宙", false)).toEqual([
      "天地",
      "玄黄",
      "宇宙",
    ]);
  });
  it("batches repeated words and flushes all high-cardinality terms without losing counts", () => {
    for (const text of [
      "alpha beta 人工智能 编程 ".repeat(10000),
      Array.from({ length: 6000 }, (_, i) => `term${i}`).join(" ") +
        " alpha 人工智能".repeat(1000),
    ]) {
      const actual = new Map<string, number>();
      forEachTermCount(text, (term, count) =>
        actual.set(term, (actual.get(term) || 0) + count),
      );
      expect(actual).toEqual(frequencies(textTerms(text)));
    }
  });
  it("preserves preview normalization, UTF-16 truncation and trailing-space behavior", () => {
    const inputs = [
      "",
      " \t\n",
      "a",
      "  alpha\n\t beta  ",
      "🙂汉字\u00a0🙂",
      "\ud800 text \udc00",
      "prefix" + " \r\n".repeat(20000),
      "x\uFEFFy\u1680z\u2028end",
      "x\u0085y\u180ez",
    ];
    for (const input of inputs)
      for (const limit of [0, 1, 2, 3, 5, 240, 360]) {
        const compact = input.replace(/\s+/g, " ").trim();
        const expected = !input
          ? null
          : compact.length <= limit
            ? compact
            : compact.slice(0, Math.max(0, limit - 1)) + "...";
        expect(excerpt(input, limit)).toBe(expected);
      }
    expect(excerpt("long   preview\n".repeat(300000), 360)).toBe(
      "long preview ".repeat(30).slice(0, 359) + "...",
    );
  });
  it("counts every token in a long message without sampling or truncation", () => {
    const text = "alpha beta 人工智能 编程 this and 这个 ".repeat(50000);
    expect(frequencies(textTerms(text))).toEqual(
      new Map([
        ["alpha", 50000],
        ["beta", 50000],
        ["人工智能", 50000],
        ["编程", 50000],
      ]),
    );
    expect(frequencies(chineseTerms("天地玄黄".repeat(3000), false))).toEqual(
      new Map([
        ["天地", 3000],
        ["地玄", 3000],
        ["玄黄", 3000],
        ["黄天", 2999],
      ]),
    );
  });
  it("keeps eager and streaming boundaries equivalent and supports interleaved iteration", () => {
    const prefix = "alpha beta 人工智能 编程";
    for (const length of [4095, 4096, 4097, 8192]) {
      const text = prefix + " ".repeat(length - prefix.length);
      expect([...textTerms(text)]).toEqual([
        "alpha",
        "beta",
        "人工智能",
        "编程",
      ]);
    }
    const text = "alpha beta 人工智能 编程 ".repeat(500);
    const iterator = textTerms(text)[Symbol.iterator]();
    expect(iterator.next().value).toBe("alpha");
    expect(languageCounts("other English 123").english_words).toBe(2);
    const rest = [...{ [Symbol.iterator]: () => iterator }];
    expect(frequencies(["alpha", ...rest])).toEqual(
      frequencies(textTerms(text)),
    );
  });
});
describe("bounded UTF-8 size checks", () => {
  it("retains a complete large ranking when the report still fits", async () => {
    const report = buildReport(await fixture());
    const sample = report.conversations.ranking![0];
    report.conversations.ranking = Array.from({ length: 12000 }, (_, i) => ({
      ...sample,
      conversation_id: `c-${i}`,
      title: "合法小排行",
    }));
    const result = prepareReportDownload(report);
    expect(result.compacted).toBe(false);
    expect(restoreReportText(result.text).conversations.ranking).toHaveLength(
      12000,
    );
    expect(JSON.parse(result.text)).toEqual(JSON.parse(JSON.stringify(report)));
  });
  it("matches Blob byte sizes for Unicode, lone surrogates and chunk-boundary pairs", () => {
    const values = [
      "",
      "ascii",
      "汉字",
      "🙂",
      "\ud800",
      "\udc00",
      "\ufeff\r\n",
      "x".repeat(8191) + "🙂汉".repeat(9000),
      "\ud800".repeat(20000),
    ];
    let seed = 123;
    for (let i = 0; i < 100; i++) {
      let value = "";
      for (let j = 0; j < 300; j++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        value += String.fromCharCode(seed & 0xffff);
      }
      values.push(value);
    }
    for (const value of values) {
      const bytes = new Blob([value]).size;
      for (const limit of [0, 1, bytes - 1, bytes, bytes + 1])
        expect(exceedsUtf8Bytes(value, limit)).toBe(bytes > limit);
    }
  });
  it("rejects oversized report text before parsing and compacts oversized Unicode rankings", async () => {
    expect(() => restoreReportText("汉".repeat(8 * 1024 * 1024))).toThrow(
      /20 MiB/,
    );
    const report = buildReport(await fixture());
    const sample = report.conversations.ranking![0];
    report.conversations.ranking = Array.from({ length: 20000 }, (_, i) => ({
      ...sample,
      conversation_id: `c-${i}`,
      title: "汉".repeat(512),
    }));
    const serialized = JSON.stringify(report);
    expect(serialized.length).toBeLessThan(MAX_REPORT_BYTES);
    expect(new Blob([serialized]).size).toBeGreaterThan(MAX_REPORT_BYTES);
    const result = prepareReportDownload(report);
    expect(result.compacted).toBe(true);
    expect(
      restoreReportText(result.text).warnings?.some(
        (w) => w.code === "compact_report",
      ),
    ).toBe(true);
  });
});
