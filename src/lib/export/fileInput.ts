import JSZip from "jszip";
import type { ExportEntry } from "../../types/export";
export const MAX_ZIP_BYTES = 512 * 1024 * 1024;
export const MAX_JSON_BYTES = 128 * 1024 * 1024;
export const MAX_TOTAL_JSON_BYTES = 512 * 1024 * 1024;
export interface ImportProgress {
  phase: "reading" | "parsing" | "statistics";
  completed: number;
  total: number;
}
export interface ReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}
const names = new Set([
  "export_manifest.json",
  "conversation_asset_file_names.json",
  "library_files.json",
  "group_chats.json",
  "message_feedback.json",
  "shared_conversations.json",
  "user.json",
  "user_settings.json",
]);
export const basename = (path: string): string =>
  path.replace(/\\/g, "/").split("/").pop() || path;
export const isRelevantJson = (path: string): boolean =>
  names.has(basename(path)) ||
  /^conversations(?:-\d+)?\.json$/.test(basename(path));
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("Import cancelled / 导入已取消", "AbortError");
}
export function checkJsonSize(size: number, total: number): void {
  if (size > MAX_JSON_BYTES)
    throw new Error(
      "A report JSON exceeds 128 MiB / 单个数据 JSON 超过 128 MiB",
    );
  if (total > MAX_TOTAL_JSON_BYTES)
    throw new Error(
      "Report JSON total exceeds 512 MiB / 数据 JSON 总量超过 512 MiB",
    );
}
export async function filesToExportEntries(
  files: File[],
  options: ReadOptions = {},
): Promise<ExportEntry[]> {
  aborted(options.signal);
  if (!files.length) throw new Error("No files selected / 未选择文件");
  if (
    files.length === 1 &&
    (/\.zip$/i.test(files[0].name) || files[0].type === "application/zip")
  )
    return zipToEntries(files[0], options);
  let total = 0;
  const entries: ExportEntry[] = [];
  for (const file of files) {
    aborted(options.signal);
    const path =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    if (isRelevantJson(path)) {
      total += file.size;
      checkJsonSize(file.size, total);
    }
    entries.push({ path, name: basename(path), size: file.size, file });
  }
  options.onProgress?.({
    phase: "reading",
    completed: files.length,
    total: files.length,
  });
  return normalize(entries);
}
async function zipToEntries(
  file: File,
  options: ReadOptions,
): Promise<ExportEntry[]> {
  if (file.size > MAX_ZIP_BYTES)
    throw new Error("ZIP exceeds 512 MiB / ZIP 超过 512 MiB");
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  aborted(options.signal);
  const files = Object.values(archive.files).filter((entry) => !entry.dir);
  const relevantCount = files.filter((entry) =>
    isRelevantJson(entry.name),
  ).length;
  const entries: ExportEntry[] = [];
  let total = 0,
    completed = 0;
  for (const entry of files) {
    aborted(options.signal);
    let text: string | undefined;
    let size =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize || 0;
    if (isRelevantJson(entry.name)) {
      checkJsonSize(size, total + size);
      const chunks: Uint8Array[] = [];
      let actual = 0;
      await new Promise<void>((resolve, reject) => {
        const stream = (
          entry as unknown as {
            internalStream(type: "uint8array"): {
              on(event: "data", callback: (chunk: Uint8Array) => void): void;
              on(event: "error", callback: (error: Error) => void): void;
              on(event: "end", callback: () => void): void;
              pause(): void;
              resume(): void;
            };
          }
        ).internalStream("uint8array");
        const abort = () => {
          stream.pause();
          reject(new DOMException("Import cancelled", "AbortError"));
        };
        options.signal?.addEventListener("abort", abort, { once: true });
        const cleanup = () =>
          options.signal?.removeEventListener("abort", abort);
        stream.on("data", (chunk) => {
          try {
            aborted(options.signal);
            actual += chunk.byteLength;
            checkJsonSize(actual, total + actual);
            chunks.push(chunk);
          } catch (error) {
            stream.pause();
            cleanup();
            reject(error);
          }
        });
        stream.on("error", (error) => {
          cleanup();
          reject(error);
        });
        stream.on("end", () => {
          cleanup();
          resolve();
        });
        stream.resume();
      });
      total += actual;
      size = actual;
      // Decode only after the bounded stream finishes; irrelevant JSON is never inflated.
      text = await new Blob(chunks as BlobPart[]).text();
      completed++;
      options.onProgress?.({
        phase: "reading",
        completed,
        total: relevantCount,
      });
    }
    entries.push({ path: entry.name, name: basename(entry.name), size, text });
  }
  return normalize(entries);
}
export async function readJsonEntry(entry: ExportEntry): Promise<unknown> {
  if (!isRelevantJson(entry.name)) return undefined;
  checkJsonSize(entry.size, entry.size);
  const text = entry.text ?? (entry.file ? await entry.file.text() : undefined);
  if (text === undefined) return undefined;
  checkJsonSize(new Blob([text]).size, 0);
  return JSON.parse(text);
}
function normalize(entries: ExportEntry[]): ExportEntry[] {
  const paths = entries.map((e) => e.path.replace(/^\/+|\/+$/g, "").split("/"));
  const prefix: string[] = [];
  for (let i = 0; i < (paths[0]?.length || 0) - 1; i++) {
    if (paths.every((parts) => parts[i] === paths[0][i]))
      prefix.push(paths[0][i]);
    else break;
  }
  const length = prefix.length;
  return entries.map((entry, i) => ({
    ...entry,
    path: paths[i].slice(length).join("/"),
    name: basename(entry.path),
  }));
}
