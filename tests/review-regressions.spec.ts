import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  importReport,
  importZip,
  ready,
  sampleReport,
  visit,
} from "./browserHelpers";
import { conversation, jsonEntry, message } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await visit(page);
});

test("large overview numbers stay on one line within every metric card", async ({
  page,
}) => {
  const report = await sampleReport();
  report.overview.total_character_count = 11626912;
  await importReport(page, report);
  await ready(page);
  await expect(page.getByTestId("metric-characters")).toHaveText("11,626,912");
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const measurements = await page
      .locator(".metric strong")
      .evaluateAll((items) =>
        items.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return {
            lines: range.getClientRects().length,
            textWidth: range.getBoundingClientRect().width,
            availableWidth: element.clientWidth,
          };
        }),
      );
    for (const measurement of measurements) {
      expect(measurement.lines).toBe(1);
      expect(measurement.textWidth).toBeLessThanOrEqual(
        measurement.availableWidth,
      );
    }
  }
});

test("damaged message nodes report an error instead of an empty success", async ({
  page,
}) => {
  await importZip(page, [
    jsonEntry("conversations.json", [
      {
        id: "c",
        current_node: "n",
        mapping: { n: { parent: null, message: "corrupt" } },
      },
    ]),
  ]);
  await expect(page.getByRole("alert")).toContainText("damaged");
  await expect(page.getByTestId("metric-messages")).toHaveCount(0);
});
test("prototype-named feedback labels render without crashing the report", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const c = conversation("c");
  await importZip(page, [
    jsonEntry("conversations.json", [c]),
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
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(
    page.locator(".count-list dt").filter({ hasText: "__proto__" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Page 13: Your feedback has an echo.",
      exact: true,
    })
    .click();
  await expect(page.locator(".annual-receipt dt")).toHaveText("__proto__");
  expect(errors).toEqual([]);
});
test("negative attachment sizes become visible warnings and the report still saves", async ({
  page,
}) => {
  const c = conversation("c");
  c.mapping.root.message.metadata = {
    attachments: [
      { id: "image", name: "x.png", mime_type: "image/png", size_bytes: -50 },
    ],
  } as never;
  await importZip(page, [jsonEntry("conversations.json", [c])]);
  await ready(page);
  await expect(page.locator("#report-warnings")).toContainText(
    "invalid_asset_metadata",
  );
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await expect(
    page.getByText("Report saved in this browser", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open saved report", exact: true })
    .click();
  await ready(page);
  await expect(page.getByTestId("metric-assets")).toHaveText("1");
});
test("enabled groups contribute to conversation totals and rankings", async ({
  page,
}) => {
  await importZip(page, [
    jsonEntry("conversations.json", []),
    jsonEntry("group_chats.json", {
      chats: [
        {
          id: "g",
          name: "Synthetic group",
          messages: [
            {
              id: "gm",
              role: "user",
              text: "hello",
              created_at: "2024-03-10T12:00:00Z",
            },
          ],
        },
      ],
    }),
  ]);
  await ready(page);
  await expect(page.getByTestId("metric-conversations")).toHaveText("1");
  await expect(page.getByTestId("metric-messages")).toHaveText("1");
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(page.locator(".ranking-list")).toContainText("Synthetic group");
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByLabel("Include group chats", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("metric-conversations")).toHaveText("0");
});
test("global ascending ranking includes the smallest conversations and paginates", async ({
  page,
}) => {
  const conversations = Array.from({ length: 26 }, (_, index) => ({
    id: `c${index + 1}`,
    title: `Conversation ${index + 1}`,
    current_node: `n${index}`,
    mapping: Object.fromEntries(
      Array.from({ length: index + 1 }, (_, n) => [
        `n${n}`,
        {
          parent: n ? `n${n - 1}` : null,
          message: message(`${index}-${n}`, "user", 1704067200, ""),
        },
      ]),
    ),
  }));
  await importZip(page, [jsonEntry("conversations.json", conversations)]);
  await ready(page);
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await page.getByRole("button", { name: "Descending", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand ranking", exact: true })
    .click();
  await expect(page.locator(".ranking-list details")).toHaveCount(25);
  await expect(
    page.locator(".ranking-list details").first().locator("summary b"),
  ).toHaveText("1");
  await expect(
    page.locator(".ranking-list details").first().locator("summary strong"),
  ).toHaveText("Conversation 1");
  await page
    .getByRole("button", { name: "Next rankings", exact: true })
    .click();
  await expect(page.locator(".ranking-list details")).toHaveCount(1);
  await expect(page.locator(".ranking-list")).toContainText("Conversation 26");
  await page
    .getByRole("button", { name: "Previous rankings", exact: true })
    .click();
  await expect(
    page.locator(".ranking-list details").first().locator("summary b"),
  ).toHaveText("1");
});
test("older summaries explicitly identify their Top-20-only ranking", async ({
  page,
}) => {
  const report = await sampleReport();
  delete report.conversations.ranking;
  await importReport(page, report);
  await ready(page);
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(
    page.getByText("This older report contains Top 20 only", { exact: false }),
  ).toBeVisible();
});
test("short viewport page changes return headings to the visible top", async ({
  page,
}) => {
  await importZip(page);
  await ready(page);
  await page.setViewportSize({ width: 393, height: 400 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  const count = await page.locator(".annual-progress button").count();
  for (let index = 0; index < count - 1; index++) {
    await page
      .getByRole("button", { name: "Next report page", exact: true })
      .click();
    await expect
      .poll(() => page.locator(".annual-dialog").evaluate((el) => el.scrollTop))
      .toBe(0);
    const box = await page.locator("#annual-heading").boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(400);
  }
});
test("import rejects invalid metadata dates and dynamic metric strings", async ({
  page,
}) => {
  const report = await sampleReport();
  report.meta.generated_at = "2024-02-30";
  await importReport(page, report);
  await expect(page.getByRole("alert")).toContainText("generated_at");
  const metric = await sampleReport();
  metric.timeline.months[0].tool_message_count = "not-a-number";
  await importReport(page, metric);
  await expect(page.getByRole("alert")).toContainText("tool_message_count");
});
test("v1 original warning count stays visible after migration", async ({
  page,
}) => {
  const report = await sampleReport();
  report.meta.schema_version = 1;
  report.meta.parse_warning_count = 7;
  report.meta.table_counts.parse_warnings = 7;
  await importReport(page, report);
  await ready(page);
  await expect(page.locator("#report-warnings summary")).toContainText("8");
  await expect(page.locator("#report-warnings")).toContainText(
    "7 original parse warnings",
  );
});
test("share SVG includes custom dates and fits a full-width title", async ({
  page,
}) => {
  const report = await sampleReport();
  report.options = {
    ...report.options!,
    year: "custom",
    start: "2024-03-01",
    end: "2024-03-31",
  };
  report.conversations.longest_by_messages[0].title = "汉".repeat(50);
  await importReport(page, report);
  await ready(page);
  await page.getByLabel("Include conversation titles", { exact: true }).check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  const svg = await readFile((await (await pending).path())!, "utf8");
  expect(svg).toContain("2024-03-01 → 2024-03-31");
  const dimensions = await page.evaluate((svg) => {
    const documentSvg = new DOMParser().parseFromString(svg, "image/svg+xml");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-3000px;top:0";
    host.append(documentSvg.documentElement);
    document.body.append(host);
    try {
      const title = host.querySelector('text[y="1070"]') as SVGTextElement;
      const box = title.getBBox();
      return { text: title.textContent, right: box.x + box.width };
    } finally {
      host.remove();
    }
  }, svg);
  expect(dimensions.text).toBe("汉".repeat(50));
  expect(dimensions.right).toBeLessThanOrEqual(1001);
});
