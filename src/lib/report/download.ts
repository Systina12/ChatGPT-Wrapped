import { downloadBlob } from "./share";
import type { WrappedData } from "../../types/wrapped";
import { MAX_REPORT_BYTES } from "./restore";

export const DOWNLOAD_FILE_NAME = "chatgpt-wrapped-data.json";

export function serializeWrappedData(data: WrappedData): string {
  return JSON.stringify(data, null, 2);
}

export function prepareReportDownload(data: WrappedData): {
  text: string;
  compacted: boolean;
} {
  const text = JSON.stringify(data);
  if (new Blob([text]).size <= MAX_REPORT_BYTES)
    return { text, compacted: false };
  const warnings = [
    ...(data.warnings || []),
    {
      code: "compact_report",
      message:
        "Full conversation ranking omitted to keep this report reopenable / 为保持报告可重新打开，已省略完整会话排行；主要排行和汇总仍保留",
    },
  ];
  const compact: WrappedData = {
    ...data,
    conversations: { ...data.conversations, ranking: undefined },
    warnings,
    meta: {
      ...data.meta,
      parse_warning_count: warnings.length,
      table_counts: {
        ...data.meta.table_counts,
        parse_warnings: warnings.length,
      },
    },
  };
  const compactText = JSON.stringify(compact);
  if (new Blob([compactText]).size > MAX_REPORT_BYTES)
    throw new Error(
      "Cannot fit report within 20 MiB; use full data JSON (cannot be reopened here) / 无法生成 20 MiB 内的报告，请下载完整数据 JSON（无法在此重新打开）",
    );
  return { text: compactText, compacted: true };
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
