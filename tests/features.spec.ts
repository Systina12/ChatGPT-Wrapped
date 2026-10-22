import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  importReport,
  importZip,
  ready,
  sampleReport,
  visit,
} from "./browserHelpers";
test.beforeEach(async ({ page }) => {
  await visit(page);
  await importZip(page);
  await ready(page);
});
test("filters locally and compares years without reimport", async ({
  page,
}) => {
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByLabel("Year", { exact: true }).selectOption("2024");
  await page.getByLabel("Message roles", { exact: true }).selectOption("user");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("1");
  await expect(
    page.getByRole("region", { name: "Year comparison" }),
  ).toContainText("0%");
});
test("custom range includes both endpoints and validates order", async ({
  page,
}) => {
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByLabel("Year", { exact: true }).selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill("2024-03-11");
  await page.getByLabel("End date", { exact: true }).fill("2024-03-10");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Start date");
  await page.getByLabel("Start date", { exact: true }).fill("2024-03-10");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("2");
});
test("invalid timezone is rejected accessibly", async ({ page }) => {
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByLabel("Timezone", { exact: true }).fill("Mars/Foo");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid timezone");
});
test("full statistics and month pagination remain available", async ({
  page,
}) => {
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Monthly messages chart" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next months", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("2 / 2");
  await expect(
    page.getByRole("heading", {
      name: "Conversation state & feedback",
      exact: true,
    }),
  ).toBeVisible();
});
test("charts can be focused using a keyboard", async ({ page }) => {
  await page.getByText("Explore complete statistics", { exact: true }).click();
  const chart = page.getByRole("group", { name: "Monthly messages chart" });
  await chart.focus();
  await expect(chart).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(chart.locator(".chart-item").first()).toBeFocused();
});
test("ranking supports changing metric, order and expansion", async ({
  page,
}) => {
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await page
    .getByLabel("Rank by", { exact: true })
    .selectOption("character_count");
  await page.getByRole("button", { name: "Descending", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ascending", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand ranking", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Collapse ranking", exact: true }),
  ).toBeVisible();
});
test("full JSON renders only after expansion", async ({ page }) => {
  await expect(page.getByTestId("raw-report")).toHaveCount(0);
  await page.getByText("Full report JSON", { exact: true }).click();
  await expect(page.getByTestId("raw-report")).toContainText(
    '"schema_version": 2',
  );
  await page.getByText("Full report JSON", { exact: true }).click();
  await expect(page.getByTestId("raw-report")).toHaveCount(0);
});
test("sharing is private by default and SVG is escaped", async ({ page }) => {
  const report = await sampleReport();
  report.conversations.longest_by_messages[0].title = '<script>&"';
  await importReport(page, report);
  await ready(page);
  await expect(
    page.getByLabel("Include keywords", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Include conversation titles", { exact: true }),
  ).not.toBeChecked();
  let pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  let content = await readFile((await (await pending).path())!, "utf8");
  expect(content).not.toContain("人工智能");
  expect(content).not.toContain("&lt;script");
  await page.getByLabel("Include keywords", { exact: true }).check();
  await page.getByLabel("Include conversation titles", { exact: true }).check();
  pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  content = await readFile((await (await pending).path())!, "utf8");
  expect(content).toContain("人工智能");
  expect(content).toContain("&lt;script&gt;&amp;&quot;");
  expect(content).not.toContain("<script>");
});
test("PNG card is generated locally", async ({ page }) => {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});
test("JSON download warns about sensitive content", async ({ page }) => {
  let warning = "";
  page.once("dialog", async (dialog) => {
    warning = dialog.message();
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Download report JSON", exact: true })
    .click();
  expect(warning).toContain("sensitive");
});
test("long-message import, filtering and JSON export preserve complete term counts and bounded previews", async ({
  page,
}) => {
  const { conversation, jsonEntry } = await import("./fixtures");
  const c = conversation();
  const text =
    "alpha 人工智能 编程 ".repeat(2000) +
    Array.from({ length: 3000 }, (_, i) => `term${i}`).join(" ");
  c.mapping.root.message.content.parts = [text];
  await importZip(page, [jsonEntry("conversations.json", [c])]);
  await ready(page);
  const downloadReport = async () => {
    page.once("dialog", (dialog) => dialog.accept());
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download report JSON", exact: true })
      .click();
    return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
  };
  let report = await downloadReport();
  expect(
    report.frequent_words.all.find(
      (item: { term: string }) => item.term === "alpha",
    ).count,
  ).toBe(2000);
  expect(
    report.frequent_words.all.find(
      (item: { term: string }) => item.term === "人工智能",
    ).count,
  ).toBe(2001);
  expect(report.messages.longest_user_messages[0].text_excerpt).toBe(
    text.slice(0, 359) + "...",
  );
  expect(report.messages.longest_user_messages[0].character_count).toBe(
    text.replace(/\s+/g, "").length,
  );
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByLabel("Message roles", { exact: true }).selectOption("user");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  report = await downloadReport();
  expect(report.meta.table_counts.messages).toBe(1);
  expect(
    report.frequent_words.all.find(
      (item: { term: string }) => item.term === "人工智能",
    ).count,
  ).toBe(2000);
});
test("mobile and desktop have no horizontal overflow", async ({ page }) => {
  await page.getByText("Explore complete statistics", { exact: true }).click();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});
