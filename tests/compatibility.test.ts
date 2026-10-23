import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ReportOptions } from "../src/types/options";
import type { WrappedData } from "../src/types/wrapped";
import { parseExportEntries } from "../src/lib/export/parser";
import { buildReport } from "../src/lib/report/engine";
import { restoreReportText } from "../src/lib/report/restore";
import { prepareReportDownload, serializeWrappedData } from "../src/lib/report/download";
import { loadReport, saveReport, STORAGE_KEY } from "../src/lib/report/storage";
import { shareSvg } from "../src/lib/report/share";
import {
  BASELINE_COMMIT, FIXED_TIME, compatibilityCases, compatibilityEntries, rejectedInputs,
} from "./compatibility/fixtures";

interface Baseline {
  baseline_commit: string;
  fixed_time: string;
  synthetic: boolean;
  cases: Array<{
    id: string;
    options: ReportOptions;
    report: WrappedData;
    reopenable: { sha256: string; compacted: boolean };
    full_json_sha256: string;
    saved_json_sha256: string;
    svg_sha256: Record<string, string>;
  }>;
  rejected: Array<{ id: string; error: string }>;
}
const baselineText = readFileSync(
  new URL("./compatibility/baseline-v2.json", import.meta.url), "utf8",
);
const baseline = JSON.parse(baselineText) as Baseline;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("performance compatibility with the pinned functional baseline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(FIXED_TIME));
  });
  afterEach(() => vi.useRealTimers());

  it("pins provenance and the complete scenario inventory", () => {
    expect(sha256(baselineText)).toBe("b8db49562494378628f90149fd38fa1b2649c221a18c48dceb04f9a7b06f3684");
    expect(baseline.baseline_commit).toBe(BASELINE_COMMIT);
    expect(baseline.fixed_time).toBe(FIXED_TIME);
    expect(baseline.synthetic).toBe(true);
    expect(baseline.cases.map((c) => c.id)).toEqual(compatibilityCases.map((c) => c.id));
    expect(baseline.rejected.map((c) => c.id)).toEqual(rejectedInputs.map((c) => c.id));
  });

  it.each(compatibilityCases)("preserves every report field and export for $id", async (scenario) => {
    const expected = baseline.cases.find((c) => c.id === scenario.id)!;
    expect(scenario.options).toEqual(expected.options);
    const parsed = await parseExportEntries(compatibilityEntries(scenario.variant));
    const report = buildReport(parsed, scenario.options);
    // The clock is fixed: no report fields, array order, warnings or counts are
    // removed or sorted to make this comparison pass.
    expect(report).toEqual(expected.report);
    expect(restoreReportText(JSON.stringify(report))).toEqual(expected.report);

    const download = prepareReportDownload(report);
    expect({ sha256: sha256(download.text), compacted: download.compacted }).toEqual(expected.reopenable);
    expect(restoreReportText(download.text)).toEqual(expected.report);
    expect(sha256(serializeWrappedData(report))).toBe(expected.full_json_sha256);

    let saved = "";
    const storage = {
      setItem: (key: string, value: string) => { expect(key).toBe(STORAGE_KEY); saved = value; },
      getItem: (key: string) => { expect(key).toBe(STORAGE_KEY); return saved; },
    };
    saveReport(report, storage);
    expect(sha256(saved)).toBe(expected.saved_json_sha256);
    expect(loadReport(storage)).toEqual(expected.report);

    for (const language of ["zh", "en"] as const)
      for (const keywords of [false, true])
        for (const titles of [false, true]) {
          const key = `${language}:${keywords}:${titles}`;
          expect(sha256(shareSvg(report, { language, keywords, titles })), key).toBe(expected.svg_sha256[key]);
        }
  });

  it.each(rejectedInputs)("preserves the failure for $id", async (input) => {
    const expected = baseline.rejected.find((c) => c.id === input.id)!;
    let message: string | undefined;
    try { await parseExportEntries(input.entries()); }
    catch (error) { message = (error as Error).message; }
    expect(message).toBe(expected.error);
  });
});
