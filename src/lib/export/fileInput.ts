import JSZip from "jszip";
import type { ExportEntry } from "../../types/export";

export async function filesToExportEntries(files: File[]): Promise<ExportEntry[]> {
  if (files.length === 1 && isZip(files[0])) {
    return zipToEntries(files[0]);
  }

  const rawEntries = files.map((file) => ({
    path: browserFilePath(file),
    name: file.name,
    size: file.size,
    file,
  }));

  return normalizeEntryPaths(rawEntries);
}

async function zipToEntries(file: File): Promise<ExportEntry[]> {
  const archive = await JSZip.loadAsync(file);
  const entries: ExportEntry[] = [];

  await Promise.all(
    Object.values(archive.files).map(async (zipEntry) => {
      if (zipEntry.dir) {
        return;
      }
      const text = zipEntry.name.endsWith(".json")
        ? await zipEntry.async("text")
        : undefined;
      entries.push({
        path: zipEntry.name,
        name: basename(zipEntry.name),
        size: text ? new Blob([text]).size : 0,
        text,
      });
    }),
  );

  return normalizeEntryPaths(entries);
}

async function readText(entry: ExportEntry): Promise<string | undefined> {
  if (entry.text !== undefined) {
    return entry.text;
  }
  if (!entry.file || !entry.name.endsWith(".json")) {
    return undefined;
  }
  return entry.file.text();
}

export async function readJsonEntry(entry: ExportEntry): Promise<unknown> {
  const text = await readText(entry);
  if (text === undefined) {
    return undefined;
  }
  return JSON.parse(text);
}

function normalizeEntryPaths(entries: ExportEntry[]): ExportEntry[] {
  const paths = entries.map((entry) => trimSlashes(entry.path)).filter(Boolean);
  const prefix = commonRootPrefix(paths);
  return entries.map((entry) => {
    const normalized = stripPrefix(trimSlashes(entry.path), prefix);
    return {
      ...entry,
      path: normalized,
      name: basename(normalized),
    };
  });
}

function browserFilePath(file: File): string {
  const withDirectory = file as File & { webkitRelativePath?: string };
  return withDirectory.webkitRelativePath || file.name;
}

function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
}

function commonRootPrefix(paths: string[]): string {
  if (paths.length === 0) {
    return "";
  }
  const split = paths.map((path) => path.split("/"));
  const first = split[0];
  const prefix: string[] = [];

  for (let index = 0; index < first.length - 1; index += 1) {
    const segment = first[index];
    if (split.every((parts) => parts[index] === segment)) {
      prefix.push(segment);
    } else {
      break;
    }
  }

  return prefix.join("/");
}

function stripPrefix(path: string, prefix: string): string {
  if (!prefix) {
    return path;
  }
  return path === prefix ? basename(path) : path.replace(`${prefix}/`, "");
}

function basename(path: string): string {
  const parts = trimSlashes(path).split("/");
  return parts[parts.length - 1] || path;
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
