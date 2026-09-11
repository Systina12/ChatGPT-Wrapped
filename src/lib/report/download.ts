import type { WrappedData } from "../../types/wrapped";

export const DOWNLOAD_FILE_NAME = "chatgpt-wrapped-data.json";

export function serializeWrappedData(data: WrappedData): string {
  return JSON.stringify(data, null, 2);
}

export function downloadWrappedData(data: WrappedData): void {
  const blob = new Blob([serializeWrappedData(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = DOWNLOAD_FILE_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
}
