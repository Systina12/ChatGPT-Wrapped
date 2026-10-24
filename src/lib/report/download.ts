import { downloadBlob } from "./share";
import type { WrappedData } from "../../types/wrapped";
import { MAX_REPORT_BYTES } from "./restore";
import { exceedsUtf8Bytes } from "./utf8";

export const DOWNLOAD_FILE_NAME = "chatgpt-wrapped-data.json";

export function serializeWrappedData(data: WrappedData): string {
  return JSON.stringify(data, null, 2);
}

export function prepareReportDownload(data: WrappedData): {
  text: string;
  compacted: boolean;
} {
  if (!rankingDefinitelyExceedsLimit(data.conversations.ranking)) {
    const text = JSON.stringify(data);
    if (!exceedsUtf8Bytes(text, MAX_REPORT_BYTES))
      return { text, compacted: false };
  }
  const warnings = [
    ...(data.warnings || []),
    {
      code: "compact_report",
      message:
        "Full conversation ranking omitted to keep this report reopenable / 为保持报告可重新打开，已省略完整会话排行；主要排行和汇总仍保留",
    },
  ];
  // Migrated v1 reports retain a total, but only summarized warning details.
  const warningCount = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(
      data.meta.parse_warning_count,
      data.meta.table_counts.parse_warnings,
      data.warnings?.length || 0,
    ) + 1,
  );
  const compact: WrappedData = {
    ...data,
    conversations: { ...data.conversations, ranking: undefined },
    warnings,
    meta: {
      ...data.meta,
      parse_warning_count: warningCount,
      table_counts: {
        ...data.meta.table_counts,
        parse_warnings: warningCount,
      },
    },
  };
  const compactText = JSON.stringify(compact);
  if (exceedsUtf8Bytes(compactText, MAX_REPORT_BYTES))
    throw new Error(
      "Cannot fit report within 20 MiB; use full data JSON (cannot be reopened here) / 无法生成 20 MiB 内的报告，请下载完整数据 JSON（无法在此重新打开）",
    );
  return { text: compactText, compacted: true };
}

/** A conservative lower bound can reject a huge ranking without serializing it.
 * UTF-8/escaping can only make these string lengths larger. Native JSON remains
 * authoritative whenever this bound fits, including Unicode-heavy reports. */
function rankingDefinitelyExceedsLimit(
  rows: WrappedData["conversations"]["ranking"],
): boolean {
  if (!rows || rows.length < 10000) return false;
  let minimum = 2; // array brackets
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    minimum += i ? 3 : 2; // object braces and array comma
    let fields = 0;
    for (const key in row) {
      if (!Object.hasOwn(row, key)) continue;
      const value = row[key as keyof typeof row];
      const size =
        value === null
          ? 4
          : typeof value === "string"
            ? value.length + 2
            : typeof value === "number"
              ? 1
              : 0;
      // Ranking fields are strings, finite numbers or null. Ignoring any future
      // unsupported fields keeps the bound conservative.
      if (!size) continue;
      minimum += (fields++ ? 1 : 0) + key.length + 3 + size;
      if (minimum > MAX_REPORT_BYTES) return true;
    }
  }
  return false;
}

export function downloadWrappedData(
  data: WrappedData,
  full = false,
): { compacted: boolean } {
  const result = full
    ? { text: serializeWrappedData(data), compacted: false }
    : prepareReportDownload(data);
  downloadBlob(
    new Blob([result.text], { type: "application/json" }),
    full ? "chatgpt-wrapped-full-data.json" : DOWNLOAD_FILE_NAME,
  );
  return { compacted: result.compacted };
}
