import { downloadBlob } from "./share";
import type { WrappedData } from "../../types/wrapped";

export const DOWNLOAD_FILE_NAME = "chatgpt-wrapped-data.json";

export function serializeWrappedData(data: WrappedData): string {
  return JSON.stringify(data, null, 2);
}

export function downloadWrappedData(data: WrappedData): void {
  downloadBlob(
    new Blob([serializeWrappedData(data)], { type: "application/json" }),
    DOWNLOAD_FILE_NAME,
  );
}
