import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ready, visit } from "./browserHelpers";
import { conversation } from "./fixtures";
import { writeSparseArchive } from "./sparseArchive";

test("imports a real 5 GiB ZIP64 locally and recalculates without reopening the file", async ({ page }) => {
  test.setTimeout(60000);
  const directory = mkdtempSync(join(tmpdir(), "wrapped-browser-zip64-"));
  try {
    const path = join(directory, "large.zip");
    writeSparseArchive(path, 5 * 1024 ** 3, [
      { name: "conversations.json", text: JSON.stringify([conversation()]) },
    ]);
    await visit(page);
    await page.getByLabel("ZIP file", { exact: true }).setInputFiles(path);
    await ready(page);
    await expect(page.getByTestId("metric-messages")).toHaveText("2");
    await expect(page.getByTestId("metric-conversations")).toHaveText("1");
    rmSync(path);
    await page.getByText("Scope & timezone", { exact: true }).click();
    await page.getByLabel("Message roles", { exact: true }).selectOption("user");
    await page.getByRole("button", { name: "Recalculate", exact: true }).click();
    await ready(page);
    await expect(page.getByTestId("metric-messages")).toHaveText("1");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
