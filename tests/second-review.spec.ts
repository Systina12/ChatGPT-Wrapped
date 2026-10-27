import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { readFile } from "node:fs/promises";
import {
  importReport,
  importZip,
  ready,
  sampleReport,
  visit,
} from "./browserHelpers";
import { conversation, jsonEntry } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await visit(page);
});

test("large weekly labels fit on one line in both languages at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const report = await sampleReport();
  report.activity.by_weekday = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [String(i), 50800 + i * 100]),
  );
  await importReport(page, report);
  await ready(page);
  for (const language of ["en", "zh"]) {
    await page.getByLabel("语言 / Language", { exact: true }).selectOption(language);
    await page
      .getByRole("button", {
        name: language === "en" ? "Enter my annual report" : "进入我的年度报告",
        exact: true,
      })
      .click();
    await page.locator(".annual-progress button").nth(3).click();
    const labels = await page
      .locator(".annual-week-chart small")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return {
            lines: range.getClientRects().length,
            width: range.getBoundingClientRect().width,
            available: element.parentElement!.clientWidth,
          };
        }),
      );
    for (const label of labels) {
      expect(label.lines).toBe(1);
      expect(label.width).toBeLessThanOrEqual(label.available + 1);
    }
    await page.keyboard.press("Escape");
  }
});

test("fixed year recalculation recovers from invalid custom date drafts", async ({
  page,
}) => {
  await importZip(page);
  await ready(page);
  await page.locator(".controls-panel summary").click();
  await page.getByLabel("Year", { exact: true }).selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill("2024-12-31");
  await page.getByLabel("End date", { exact: true }).fill("2024-01-01");
  await page.getByLabel("Year", { exact: true }).selectOption("2024");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("2");
  await expect(page.locator(".controls-panel [role=alert]")).toHaveCount(0);
});

test("prototype-named feedback survives save, reopen and downloaded report import", async ({
  page,
}) => {
  await importZip(page, [
    jsonEntry("conversations.json", [conversation("c")]),
    jsonEntry("message_feedback.json", [
      {
        id: "f",
        conversation_id: "c",
        message_id: "c-user",
        rating: "__proto__",
      },
    ]),
  ]);
  await ready(page);
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page
    .getByRole("button", { name: "Open saved report", exact: true })
    .click();
  await ready(page);
  page.once("dialog", (dialog) => dialog.accept());
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download report JSON", exact: true })
    .click();
  const download = await pending;
  const value = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(value.quality.feedback_by_rating.__proto__).toBe(1);
  await importReport(page, value);
  await ready(page);
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(
    page.locator(".count-list dt").filter({ hasText: "__proto__" }),
  ).toBeVisible();
});

test("unusual attachment suffixes and duplicate shards produce a usable, accurate report", async ({
  page,
}) => {
  const c = conversation("c");
  c.mapping.root.message.content.parts = [
    { content_type: "file", asset_pointer: "synthetic.constructor" },
  ] as never;
  await importZip(page, [
    jsonEntry("conversations.json", [c]),
    jsonEntry("conversations-1.json", [c]),
  ]);
  await ready(page);
  await expect(page.getByTestId("metric-conversations")).toHaveText("1");
  await expect(page.getByTestId("metric-messages")).toHaveText("2");
  await expect(page.getByTestId("metric-assets")).toHaveText("1");
  await expect(page.locator("#report-warnings")).toContainText(
    "duplicate_conversation",
  );
});

test("closed statistics mount no rows; open statistics and warnings paginate large lists", async ({
  page,
}) => {
  const report = await sampleReport();
  report.models.models = Array.from({ length: 12000 }, (_, i) => ({
    model: `model-${i}`,
    message_count: 1,
    character_count: 1,
    first_seen_at: null,
    last_seen_at: null,
  }));
  report.warnings = Array.from({ length: 20000 }, (_, i) => ({
    code: "synthetic",
    message: `warning-${i}`,
  }));
  report.meta.parse_warning_count = report.meta.table_counts.parse_warnings =
    report.warnings.length;
  await importReport(page, report);
  await ready(page);
  await expect(page.locator("#full-statistics .chart-item")).toHaveCount(0);
  await expect(page.locator("#report-warnings li")).toHaveCount(50);
  await page
    .locator("#report-warnings")
    .getByRole("button", { name: "Next page", exact: true })
    .click();
  await expect(page.locator("#report-warnings li").first()).toContainText(
    "warning-50",
  );
  await page.getByText("Explore complete statistics", { exact: true }).click();
  const chart = page.getByRole("group", {
    name: "Model usage chart",
    exact: true,
  });
  await expect(chart.locator(".chart-item")).toHaveCount(25);
  await chart.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(chart.locator(".chart-item").first()).toContainText("model-25");
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(page.locator("#full-statistics .chart-item")).toHaveCount(0);
  expect(await page.locator("*").count()).toBeLessThan(2000);
});

test("calendar exposes actual daily values through a keyboard accessible table", async ({
  page,
}) => {
  await importZip(page);
  await ready(page);
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page.locator(".annual-progress button").nth(4).click();
  const summary = page.getByText("View activity by date", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("table", { name: "Daily messages in the latest ten weeks" }),
  ).toBeVisible();
  await expect(page.locator(".annual-calendar-data tbody tr")).toHaveCount(70);
  await expect(
    page.locator(".annual-calendar-data tbody tr").last(),
  ).toContainText("2024-03-10");
  await expect(
    page.locator(".annual-calendar-data tbody tr").last(),
  ).toContainText("2");
});

test("unknown model metadata is disclosed without counting a known model", async ({
  page,
}) => {
  const report = await sampleReport();
  report.models.models = [
    {
      model: "unknown",
      message_count: 1,
      character_count: 1,
      first_seen_at: null,
      last_seen_at: null,
    },
  ];
  report.models.most_used_model = null;
  await importReport(page, report);
  await ready(page);
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page.locator(".annual-progress button").nth(6).click();
  await expect(page.locator(".annual-pairs > div").first()).toContainText("0");
  await expect(page.locator(".annual-footnote")).toContainText(
    "lack model metadata",
  );
});

test("overview and all fourteen chapters pass automated accessibility checks at 320px", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await importZip(page);
  await ready(page);
  await page.addScriptTag({ content: axe.source });
  const scan = async () => {
    const violations = await page.evaluate(async () => {
      const engine = (window as unknown as { axe: typeof import("axe-core") })
        .axe;
      const result = await engine.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      });
      return result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((node) => node.target),
      }));
    });
    expect(violations).toEqual([]);
  };
  await scan();
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  for (let index = 0; index < 14; index++) {
    await page.locator(".annual-progress button").nth(index).click();
    await expect(
      page.locator(".annual-progress [aria-current]"),
    ).toHaveAttribute("aria-label", new RegExp(`Page ${index + 1}:`));
    await scan();
  }
});
