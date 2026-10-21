import type { WrappedData } from "../../types/wrapped";
import { restoreReport, restoreReportText } from "./restore";
export const STORAGE_KEY = "chatgpt-wrapped.saved-report.v2";
export function saveReport(
  report: WrappedData,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  const data = restoreReport(report);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "Could not save: storage full or unavailable / 保存失败：存储空间不足或不可用",
    );
  }
}
export function loadReport(
  storage: Pick<Storage, "getItem"> = localStorage,
): WrappedData {
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Local storage unavailable / 本地存储不可用");
  }
  if (!text) throw new Error("No saved report / 没有已保存的报告");
  return restoreReportText(text);
}
export function clearReport(
  storage: Pick<Storage, "removeItem"> = localStorage,
): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    throw new Error("Could not clear storage / 无法清除本地存储");
  }
}
