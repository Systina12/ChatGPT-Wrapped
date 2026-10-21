import { expect, test } from "@playwright/test";
import {
  importZip,
  importReport,
  ready,
  sampleReport,
  visit,
} from "./browserHelpers";
import { jsonEntry } from "./fixtures";
test.beforeEach(async ({ page }) => visit(page));
test("Pages subpath loads with language controls", async ({ page }) => {
  await expect(page).toHaveURL(/\/ChatGPT-Wrapped\//);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every question",
  );
  await page.getByLabel("界面语言 / Language").selectOption("zh");
  await expect(
    page.getByRole("button", { name: "选择 ZIP", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
test("damaged export displays a clear error", async ({ page }) => {
  await importZip(page, [
    {
      name: "conversations.json",
      path: "conversations.json",
      text: "{",
      size: 1,
    },
  ]);
  await expect(page.getByRole("alert")).toContainText("damaged");
});
test("missing conversations is an error", async ({ page }) => {
  await importZip(page, [jsonEntry("user.json", { id: "synthetic" })]);
  await expect(page.getByRole("alert")).toContainText("Missing conversations");
});
test("valid empty data produces an empty report", async ({ page }) => {
  await importZip(page, [jsonEntry("conversations.json", [])]);
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("0");
  await expect(page.getByText("Busiest hour").locator("strong")).toHaveText(
    "—",
  );
});
test("partial shards retain visible warnings", async ({ page }) => {
  const report = await sampleReport();
  const { conversation, jsonEntry } = await import("./fixtures");
  await importZip(page, [
    jsonEntry("conversations-1.json", [conversation()]),
    {
      path: "conversations-2.json",
      name: "conversations-2.json",
      text: "{",
      size: 1,
    },
  ]);
  await ready(page);
  await expect(page.locator(".warning-panel")).toContainText("invalid_json");
  expect(report.meta.schema_version).toBe(2);
});
test("imports and validates a report, disabling recalculation", async ({
  page,
}) => {
  await importReport(page, await sampleReport());
  await ready(page);
  await page.getByText("Scope & timezone", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Recalculate", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("This summary has no original data", { exact: false }),
  ).toBeVisible();
});
test("rejects unsupported or structurally corrupt reports", async ({
  page,
}) => {
  await importReport(page, { meta: { schema_version: 99 } });
  await expect(page.getByRole("alert")).toContainText("Unsupported");
  await importReport(page, { meta: { schema_version: 2 } });
  await expect(page.getByRole("alert")).toContainText("Invalid report");
});
test("save is explicit and saved report can open and clear", async ({
  page,
}) => {
  await importZip(page);
  await ready(page);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await expect(
    page.getByText("Report saved in this browser", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page
    .getByRole("button", { name: "Open saved report", exact: true })
    .click();
  await ready(page);
  await page
    .getByRole("button", { name: "Clear saved report", exact: true })
    .click();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("storage quota failure is visible", async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await importZip(page);
  await ready(page);
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "storage full" }),
  ).toBeVisible();
});
test("folder input is available and loads relevant JSON", async ({ page }) => {
  await expect(
    page.getByLabel("Export folder", { exact: true }),
  ).toHaveAttribute("webkitdirectory", "true");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const dir = await mkdtemp("/tmp/wrapped-folder-");
  try {
    await writeFile(`${dir}/conversations.json`, "[]");
    await page.getByLabel("Export folder", { exact: true }).setInputFiles(dir);
    await ready(page);
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("cancel and replacement isolate late worker responses", async ({
  page,
}) => {
  const oldReport = await sampleReport();
  const newReport = structuredClone(oldReport);
  newReport.meta.table_counts.messages = 777;
  await page.evaluate(
    ({ oldReport, newReport }) => {
      let ordinal = 0;
      (window as unknown as { Worker: unknown }).Worker = class {
        onmessage: ((event: unknown) => void) | null = null;
        onerror = null;
        order = ++ordinal;
        postMessage(request: { id: number }) {
          const old = this.order === 1;
          setTimeout(
            () =>
              this.onmessage?.({
                data: {
                  id: request.id,
                  type: "done",
                  data: old ? oldReport : newReport,
                },
              }),
            old ? 900 : 40,
          );
          if (old)
            setTimeout(
              () =>
                this.onmessage?.({
                  data: {
                    id: request.id,
                    type: "progress",
                    progress: { phase: "parsing", completed: 99, total: 100 },
                  },
                }),
              700,
            );
        }
        terminate() {
          /* Deliberately simulate a queued response after termination. */
        }
      };
    },
    { oldReport, newReport },
  );
  await importZip(page);
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await importZip(page);
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("777");
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("metric-messages")).toHaveText("777");
});

test("recalculation ignores old responses from the same worker", async ({
  page,
}) => {
  const original = await sampleReport();
  const filtered = structuredClone(original);
  filtered.meta.table_counts.messages = 123;
  await page.evaluate(
    ({ original, filtered }) => {
      (window as unknown as { Worker: unknown }).Worker = class {
        onmessage: ((event: unknown) => void) | null = null;
        onerror = null;
        oldId = 0;
        postMessage(request: { id: number; type: string }) {
          if (request.type === "import") {
            this.oldId = request.id;
            setTimeout(
              () =>
                this.onmessage?.({
                  data: { id: request.id, type: "done", data: original },
                }),
              20,
            );
          } else {
            setTimeout(
              () =>
                this.onmessage?.({
                  data: { id: request.id, type: "done", data: filtered },
                }),
              20,
            );
            setTimeout(
              () =>
                this.onmessage?.({
                  data: {
                    id: this.oldId,
                    type: "progress",
                    progress: { phase: "parsing", completed: 1, total: 2 },
                  },
                }),
              100,
            );
            setTimeout(
              () =>
                this.onmessage?.({
                  data: { id: this.oldId, type: "done", data: original },
                }),
              200,
            );
          }
        }
        terminate() {}
      };
    },
    { original, filtered },
  );
  await importZip(page);
  await ready(page);
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId("metric-messages")).toHaveText("123");
});
