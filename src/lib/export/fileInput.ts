import { BlobReader, ZipReader } from "@zip.js/zip.js";
import type { ExportEntry } from "../../types/export";
export interface ImportProgress {
  phase: "reading" | "parsing" | "statistics";
  completed: number;
  total: number;
}
export interface ReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
  /** Optional caller budget; normal local imports impose no fixed size cap. */
  limits?: Readonly<JsonLimits>;
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
export interface JsonLimits {
  fileBytes: number;
  totalBytes: number;
}
export const JSON_LIMITS: Readonly<JsonLimits> = Object.freeze({
  fileBytes: Infinity,
  totalBytes: Infinity,
});
export class ImportLimitError extends Error {}
export function checkJsonSize(
  size: number,
  total: number,
  limits: Readonly<JsonLimits> = JSON_LIMITS,
): void {
  if (size > limits.fileBytes)
    throw new ImportLimitError(
      "Data JSON exceeds the configured per-file limit / 数据 JSON 超过指定的单文件限制",
    );
  if (total > limits.totalBytes)
    throw new ImportLimitError(
      "Data JSON exceeds the configured total limit / 数据 JSON 超过指定的总量限制",
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
      checkJsonSize(file.size, total, options.limits);
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
  // BlobReader slices the central directory and requested compressed entries.
  // Large binary attachments are not materialized as an archive-sized buffer.
  const archive = new ZipReader(new BlobReader(file), {
    useWebWorkers: false,
    signal: options.signal,
    checkCrc32: true,
  });
  const entries: ExportEntry[] = [];
  let total = 0,
    declaredTotal = 0,
    completed = 0,
    relevantCount = 0;
  for await (const entry of archive.getEntriesGenerator()) {
    aborted(options.signal);
    if (entry.directory) continue;
    const record: ExportEntry = {
      path: entry.filename,
      name: basename(entry.filename),
      size: entry.uncompressedSize,
    };
    if (isRelevantJson(entry.filename)) {
      relevantCount++;
      declaredTotal += record.size;
      checkJsonSize(record.size, declaredTotal, options.limits);
      record.readText = async () => {
        aborted(options.signal);
        const result = await readBoundedZipText(
          (sink) => entry.getData(sink),
          total,
          options.signal,
          (bytes) => {
            total += bytes;
          },
          options.limits,
        );
        if (result.sizeBytes !== record.size)
          throw new Error("Invalid ZIP uncompressed size / ZIP 解压大小不一致");
        options.onProgress?.({
          phase: "reading",
          completed: ++completed,
          total: relevantCount,
        });
        return result.text;
      };
    }
    entries.push(record);
  }
  await archive.close();
  return normalize(entries);
}
/** Count actual inflated bytes and apply any caller budget before decoding. */
export async function readBoundedZipText(
  consume: (sink: WritableStream<Uint8Array>) => Promise<unknown>,
  previousBytes: number,
  signal?: AbortSignal,
  charge?: (bytes: number) => void,
  limits: Readonly<JsonLimits> = JSON_LIMITS,
): Promise<{ text: string; sizeBytes: number }> {
  aborted(signal);
  let sizeBytes = 0;
  const decoder = new TextDecoder();
  const parts: string[] = [];
  await consume(
    new WritableStream<Uint8Array>({
      write(chunk) {
        aborted(signal);
        sizeBytes += chunk.byteLength;
        charge?.(chunk.byteLength);
        checkJsonSize(sizeBytes, previousBytes + sizeBytes, limits);
        parts.push(decoder.decode(chunk, { stream: true }));
      },
    }),
  );
  aborted(signal);
  parts.push(decoder.decode());
  return { text: parts.join(""), sizeBytes };
}
export async function readJsonEntry(entry: ExportEntry): Promise<unknown> {
  if (!isRelevantJson(entry.name)) return undefined;
  checkJsonSize(entry.size, entry.size);
  let text: string | undefined;
  try {
    text =
      entry.text ??
      (entry.readText
        ? await entry.readText()
        : entry.file
          ? await entry.file.text()
          : undefined);
  } finally {
    // Release the reader/ZIP metadata as soon as this shard has been consumed.
    entry.readText = undefined;
  }
  if (text === undefined) return undefined;
  // ZIP bytes were counted by the sink; File sizes are immutable. Re-encoding
  // either just to measure it would allocate another entire shard.
  if (entry.text !== undefined) checkJsonSize(new Blob([text]).size, 0);
  return JSON.parse(text);
}
function normalize(entries: ExportEntry[]): ExportEntry[] {
  for (const entry of entries)
    entry.path = entry.path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  let prefix =
    entries[0]?.path.slice(0, entries[0].path.lastIndexOf("/") + 1) || "";
  for (const entry of entries)
    while (prefix && !entry.path.startsWith(prefix))
      prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf("/") + 1);
  for (const entry of entries) entry.path = entry.path.slice(prefix.length);
  return entries;
}
