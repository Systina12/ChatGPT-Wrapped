import { expect, test } from "@playwright/test";
import { importZip, ready, visit } from "./browserHelpers";
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
  const surface = page.locator(".annual-page");
  await surface.dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: 270, clientY: 300 }],
  });
  await surface.dispatchEvent("touchend", {
    changedTouches: [{ identifier: 1, clientX: 70, clientY: 305 }],
  });
  await expect(
    page.getByRole("heading", {
      name: "One question opens a world.",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".annual-page").dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: 70, clientY: 300 }],
  });
  await page.locator(".annual-page").dispatchEvent("touchend", {
    changedTouches: [{ identifier: 1, clientX: 270, clientY: 302 }],
  });
  await expect(page.getByTestId("story-message-count")).toBeVisible();
});
test("vertical touch gestures do not flip pages", async ({ page }) => {
  await page
    .getByRole("button", { name: "Enter my annual report", exact: true })
    .click();
  await page.locator(".annual-page").dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: 100, clientY: 100 }],
  });
  await page.locator(".annual-page").dispatchEvent("touchend", {
    changedTouches: [{ identifier: 1, clientX: 130, clientY: 300 }],
  });
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
  for (let i = 0; i < 7; i++) {
    const dimensions = await page
      .locator(".annual-dialog")
      .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    if (i < 6) await page.keyboard.press("ArrowRight");
  }
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
