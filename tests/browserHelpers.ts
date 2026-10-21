import { expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { exportFiles, fixture } from "./fixtures";
import { buildReport } from "../src/lib/report/engine";
import type { ExportEntry } from "../src/types/export";
export async function visit(page: Page) {
  await page.goto("./");
  await page.getByLabel("界面语言 / Language").selectOption("en");
}
export async function importZip(
  page: Page,
  entries: ExportEntry[] = exportFiles(),
) {
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, entry.text || "");
  await page
    .getByLabel("ZIP file", { exact: true })
    .setInputFiles({
      name: "synthetic.zip",
      mimeType: "application/zip",
      buffer: await zip.generateAsync({ type: "nodebuffer" }),
    });
}
export async function ready(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Your local report is ready" }),
  ).toBeVisible();
}
export const sampleReport = async () => buildReport(await fixture());
export async function importReport(page: Page, value: unknown) {
  await page
    .getByLabel("Report JSON file", { exact: true })
    .setInputFiles({
      name: "report.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
}
