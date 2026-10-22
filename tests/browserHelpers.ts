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
  await page.getByLabel("ZIP file", { exact: true }).setInputFiles({
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
  await page.getByLabel("Report JSON file", { exact: true }).setInputFiles({
    name: "report.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
}

export async function touchGestureEvent(
  page: Page,
  selector: string,
  type: "touchstart" | "touchend",
  clientX: number,
  clientY: number,
) {
  await page.locator(selector).evaluate(
    (element, point) => {
      const position = {
        identifier: 1,
        target: element,
        clientX: point.clientX,
        clientY: point.clientY,
      };
      const touches = point.type === "touchstart" ? [position] : [];
      const changedTouches = [position];
      if (typeof Touch === "function" && typeof TouchEvent === "function") {
        element.dispatchEvent(
          new TouchEvent(point.type, {
            bubbles: true,
            cancelable: true,
            touches: touches.map((value) => new Touch(value)),
            changedTouches: changedTouches.map((value) => new Touch(value)),
          }),
        );
      } else {
        // Desktop Firefox has no Touch constructor. Exercise the same handler
        // with touch-list properties instead of failing inside Playwright.
        const event = new Event(point.type, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperties(event, {
          touches: { value: touches },
          changedTouches: { value: changedTouches },
        });
        element.dispatchEvent(event);
      }
    },
    { type, clientX, clientY },
  );
}
