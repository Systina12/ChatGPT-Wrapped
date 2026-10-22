import { expect, test } from "@playwright/test";
import {
  importReport,
  importZip,
  ready,
  sampleReport,
  touchGestureEvent,
  visit,
} from "./browserHelpers";
import { conversation, jsonEntry, message } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await visit(page);
  await importZip(page);
  await ready(page);
});
test("overview precedes the immersive report and uses real data", async ({
  page,
}) => {
  await expect(page.getByTestId("metric-messages")).toHaveText("4");
  await expect(
    page.getByRole("dialog", { name: "Your annual report", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your annual report",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("story-message-count")).toHaveText("4");
  await expect(
    page.getByRole("heading", {
      name: "Curiosity leaves a trace.",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Next report page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "One question opens a world.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous report page", exact: true })
    .click();
  await expect(page.getByTestId("story-message-count")).toBeVisible();
});
test("keyboard navigation, boundaries and focus return", async ({ page }) => {
  const enter = page.getByRole("button", {
    name: "Enter my annual report",
    exact: true,
  });
  await enter.click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("story-message-count")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", {
      name: "One question opens a world.",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("heading", {
      name: "Keep a little of this year.",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("story-message-count")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(enter).toBeFocused();
});
test("horizontal touch gestures change pages", async ({ page }) => {
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await touchGestureEvent(page, ".annual-page", "touchstart", 270, 300);
  await touchGestureEvent(page, ".annual-page", "touchend", 70, 305);
  await expect(
    page.getByRole("heading", {
      name: "One question opens a world.",
      exact: true,
    }),
  ).toBeVisible();
  await touchGestureEvent(page, ".annual-page", "touchstart", 70, 300);
  await touchGestureEvent(page, ".annual-page", "touchend", 270, 302);
  await expect(page.getByTestId("story-message-count")).toBeVisible();
});
test("vertical touch gestures do not flip pages", async ({ page }) => {
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await touchGestureEvent(page, ".annual-page", "touchstart", 100, 100);
  await touchGestureEvent(page, ".annual-page", "touchend", 130, 300);
  await expect(page.getByTestId("story-message-count")).toBeVisible();
});
test("statistics, warnings and JSON remain accessible from the story", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Full statistics", exact: true })
    .click();
  await expect(page.locator("#full-statistics")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("heading", { name: "Monthly activity", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page.getByRole("button", { name: /^Warnings \(/ }).click();
  await expect(page.locator("#report-warnings")).toHaveAttribute("open", "");
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(page.getByTestId("raw-report")).toBeVisible();
});
test("final story page opens private share controls", async ({ page }) => {
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page.keyboard.press("End");
  await page
    .getByRole("button", { name: "Make my share card ↗", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByLabel("Include keywords", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Include conversation titles", { exact: true }),
  ).not.toBeChecked();
});
test("reduced-motion preference stops decorative and entrance animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  expect(
    await page
      .locator(".annual-copy")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".annual-asterisk")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
test("every report page fits the viewport horizontally", async ({ page }) => {
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  const count = await page.locator(".annual-progress button").count();
  expect(count).toBe(14);
  for (let i = 0; i < count; i++) {
    const dimensions = await page
      .locator(".annual-dialog")
      .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    if (i < count - 1) await page.keyboard.press("ArrowRight");
  }
});

test("new chapters show filtered export values and can be opened directly", async ({
  page,
}) => {
  const conversations = Array.from({ length: 20 }, (_, i) => {
    const c = conversation(`c${i}`);
    c.is_starred = i % 2 === 0;
    c.is_archived = i % 3 === 0;
    c.mapping.root.message.content.parts = ["x".repeat(i + 1)];
    return c;
  });
  const longest = conversations[0] as ReturnType<typeof conversation> & {
    mapping: Record<string, unknown>;
  };
  for (let i = 0; i < 6; i++) {
    longest.mapping[`extra${i}`] = {
      id: `extra${i}`,
      parent: i ? `extra${i - 1}` : "answer",
      message: message(`extra-${i}`, "assistant"),
    };
  }
  longest.current_node = "extra5";
  conversations[0].mapping.root.message.metadata = {
    attachments: [
      { id: "image", name: "a.png", mime_type: "image/png" },
      { id: "voice", name: "b.mp3", mime_type: "audio/mpeg" },
      { id: "file", name: "c.pdf", mime_type: "application/pdf" },
    ],
  } as never;
  await importZip(page, [
    jsonEntry("conversations.json", conversations),
    jsonEntry(
      "message_feedback.json",
      Array.from({ length: 23 }, (_, i) => ({
        id: `feedback-${i}`,
        conversation_id: `c${i % 20}`,
        message_id: `c${i % 20}-assistant`,
        rating: i < 20 ? "thumbsUp" : "thumbsDown",
      })),
    ),
    jsonEntry(
      "shared_conversations.json",
      Array.from({ length: 11 }, (_, i) => ({
        id: `share-${i}`,
        conversation_id: `c${i}`,
      })),
    ),
  ]);
  await ready(page);
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Page 4: Every week has your rhythm.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-weekday")).toHaveText("Sun");
  await page
    .getByRole("button", {
      name: "Page 6: A year with its own horizons.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-peak-month")).toHaveText("2024.03");
  await page
    .getByRole("button", {
      name: "Page 8: Some conversations go further.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-longest-dialogue")).toHaveText("8");
  await expect(page.locator(".annual-tickets li")).toHaveCount(3);
  await page
    .getByRole("button", {
      name: "Page 9: A few words. Or a whole world.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-average-length")).toHaveText("11chars");
  await page
    .getByRole("button", {
      name: "Page 10: Ideas come in many forms.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-asset-count")).toHaveText("3");
  await page
    .getByRole("button", {
      name: "Page 12: Some ideas are worth keeping.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-starred-count")).toHaveText("10");
  await expect(
    page
      .locator(".annual-pairs > div")
      .filter({ hasText: "Archived" })
      .locator("b"),
  ).toHaveText("7");
  await expect(
    page
      .locator(".annual-pairs > div")
      .filter({ hasText: "Shared" })
      .locator("b"),
  ).toHaveText("11");
  await page
    .getByRole("button", {
      name: "Page 13: Your feedback has an echo.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-feedback-count")).toHaveText("23");
  await expect(
    page
      .locator(".annual-receipt dl > div")
      .filter({ hasText: "Thumbs up" })
      .locator("dd"),
  ).toHaveText("20");
});

test("all fourteen chapters handle an empty scope without invalid numbers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await importZip(page, [jsonEntry("conversations.json", [])]);
  await ready(page);
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  for (let i = 0; i < 14; i++) {
    await expect(page.locator(".annual-page")).not.toContainText(
      /NaN|Infinity|undefined/,
    );
    if (i < 13) await page.keyboard.press("ArrowRight");
  }
  expect(errors).toEqual([]);
});

test("new chapters support older summaries and arbitrary feedback labels", async ({
  page,
}) => {
  const report = await sampleReport();
  delete report.conversations.ranking;
  report.conversations.longest_by_messages[0].title = "很长的测试标题".repeat(
    80,
  );
  report.quality.feedback_count = 1;
  report.quality.feedback_by_rating = Object.fromEntries([["constructor", 1]]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await importReport(page, report);
  await ready(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Page 8: Some conversations go further.",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("story-longest-dialogue")).toHaveText("2");
  await expect(page.locator(".annual-tickets li strong")).toHaveText(
    "很长的测试标题".repeat(80),
  );
  expect(
    await page
      .locator(".annual-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Page 13: Your feedback has an echo.",
      exact: true,
    })
    .click();
  await expect(page.locator(".annual-receipt dt")).toHaveText("constructor");
  expect(errors).toEqual([]);
});

test("320px layouts retain all navigation without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close annual report", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".annual-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
