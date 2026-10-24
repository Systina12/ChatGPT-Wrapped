import { expect, test } from "@playwright/test";
import { importZip, ready, visit } from "./browserHelpers";
import { conversation, jsonEntry, message } from "./fixtures";

test("same conversation/message IDs in ordinary and group chats survive filtering and saved report reopening", async ({ page }) => {
  await visit(page);
  const ordinary = conversation("same");
  Object.assign(ordinary.mapping.root.message.metadata, {
    attachments: [{ id: "shared.pdf", size_bytes: 10 }],
  });
  await importZip(page, [
    jsonEntry("conversations.json", [ordinary]),
    jsonEntry("group_chats.json", { chats: [{ id: "same", name: "Group", messages: [{
      id: "same-user", role: "user", text: "group text", created_at: "2025-04-10T12:00:00Z",
      attachments: [{ id: "shared.pdf", size_bytes: 20 }],
    }] }] }),
  ]);
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("3");
  await expect(page.getByTestId("metric-assets")).toHaveText("2");
  await page.getByText("Scope & timezone", { exact: true }).click();
  await page.getByLabel("Year", { exact: true }).selectOption("2025");
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("1");
  await expect(page.getByTestId("metric-conversations")).toHaveText("1");
  await expect(page.getByTestId("metric-assets")).toHaveText("1");
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page.getByRole("button", { name: "Open saved report", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("1");
  await page.getByText("Explore complete statistics", { exact: true }).click();
  await expect(page.locator(".ranking-list")).toContainText("Group");
  await expect(page.locator(".ranking-list")).not.toContainText("Synthetic <same>");
});

test("NUL-containing ID pairs retain both messages and deduplicated attachments after ZIP import", async ({ page }) => {
  await visit(page);
  const single = (id: string, mid: string) => ({ id, current_node: "n", mapping: {
    n: { parent: null, message: { ...message(mid), metadata: { attachments: [{ id: "same.pdf" }, { id: "same.pdf" }] } } },
  } });
  await importZip(page, [jsonEntry("conversations.json", [single("a\0b", "c"), single("a", "b\0c")])]);
  await ready(page);
  await expect(page.getByTestId("metric-messages")).toHaveText("2");
  await expect(page.getByTestId("metric-conversations")).toHaveText("2");
  await expect(page.getByTestId("metric-assets")).toHaveText("2");
});
