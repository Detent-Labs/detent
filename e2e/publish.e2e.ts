/**
 * The **publish refusal** and **publish** flows (design D4), in that order:
 * the refusal publishes nothing, so the real publish after it still finds the
 * suite's Laptop Inventory draft (design D3).
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const PROCESS_KEY = "laptop_inventory";
const REFUSAL = "Refused by the smoke suite.";

/** Opens the suite's draft from the studio's process list and opens the publish dialog on it. */
async function openPublishDialog(page: Page): Promise<Locator> {
  await page.goto("/studio");
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: PROCESS_KEY, exact: true }) });
  await row.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish this draft" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a refused publish shows its reason inside the dialog", async ({ page }) => {
  // A publish-validation refusal, the shape `parseErrorBody` in packages/web/src/api/client.ts maps to a message.
  await page.route("**/drafts/*/publish", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: { type: "schema-validation", message: REFUSAL, issues: [{ loc: "", message: REFUSAL }] } }),
        })
      : route.fallback(),
  );

  const dialog = await openPublishDialog(page);
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText(REFUSAL);
  await expect(dialog).toBeVisible();
  await expect(page.locator('[role="alert"]:not(dialog [role="alert"])').filter({ visible: true })).toHaveCount(0);
});

test("a publish adds a version", async ({ page }) => {
  const dialog = await openPublishDialog(page);
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Published v2 \(/)).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Versions" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "v1", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "v2", exact: true })).toBeVisible();
});
