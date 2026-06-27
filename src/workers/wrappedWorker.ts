import { filesToExportEntries } from "../lib/export/fileInput";
import { parseExportEntries } from "../lib/export/parser";
import { buildWrappedData } from "../lib/stats/builder";

export interface WorkerRequest {
  files: File[];
}

export type WorkerResponse =
  | { type: "done"; data: ReturnType<typeof buildWrappedData> }
  | { type: "error"; message: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const entries = await filesToExportEntries(event.data.files);
    const parsed = await parseExportEntries(entries);
    const data = buildWrappedData(parsed);
    postMessage({ type: "done", data } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
};

