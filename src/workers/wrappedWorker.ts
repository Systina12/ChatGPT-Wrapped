import {
  filesToExportEntries,
  type ImportProgress,
} from "../lib/export/fileInput";
import { parseExportEntries } from "../lib/export/parser";
import { CalendarCache } from "../lib/stats/calendarCache";
import { buildReport } from "../lib/report/engine";
import type { ParsedExport } from "../types/export";
import type { ReportOptions } from "../types/options";
import type { WrappedData } from "../types/wrapped";
export type WorkerRequest = { id: number; options: ReportOptions } & (
  | { type: "import"; files: File[] }
  | { type: "recalculate" }
);
export type WorkerResponse = { id: number } & (
  | { type: "progress"; progress: ImportProgress }
  | { type: "done"; data: WrappedData }
  | { type: "error"; message: string }
);
let parsed: ParsedExport | null = null;
let latestId = 0;
let cache: CalendarCache | undefined;
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  latestId = request.id;
  const send = (response: WorkerResponse) => {
    if (latestId === request.id) postMessage(response);
  };
  const progress = (progress: ImportProgress) =>
    send({ type: "progress", id: request.id, progress });
  try {
    if (request.type === "import") {
      progress({ phase: "reading", completed: 0, total: request.files.length });
      const entries = await filesToExportEntries(request.files, {
        onProgress: progress,
      });
      const result = await parseExportEntries(entries, progress);
      if (latestId !== request.id) return;
      parsed = result;
      cache = undefined;
    }
    if (!parsed) throw new Error("Original data unavailable / 原始数据不可用");
    if (cache?.timezone !== request.options.timezone)
      cache = new CalendarCache(request.options.timezone);
    const data = buildReport(parsed, request.options, {
      cache,
      onProgress: (completed, total) =>
        progress({ phase: "statistics", completed, total }),
    });
    send({ type: "done", id: request.id, data });
  } catch (error) {
    send({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
