/**
 * The **one dialog form** flows (spa-accessibility): the keyboard hold, the
 * focus return, the backdrop, and the leave prompt, on the suite's draft. Each
 * flow edits the process name and never saves, so the draft that
 * publish.e2e.ts publishes afterwards stays as it was.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const DRAFT_NAME = "E2E draft";

/** Opens the suite's draft from the studio's process list and types into its name, leaving it dirty. */
async function openDirtyDraft(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  const name = page.getByRole("textbox", { name: "Process name" });
  await name.fill(`${DRAFT_NAME} edited`);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
}

/** Whether a control inside the dialog holds the focus. The dialog itself and the body do not count. */
async function focusOnControl(dialog: Locator): Promise<boolean> {
  return (await dialog.locator(":focus").count()) === 1;
}

test("a dialog holds the keyboard, ignores the backdrop and returns the focus", async ({ page }) => {
  await openDirtyDraft(page);
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Publish this draft" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

  // Tab past both ends: the focus never leaves the dialog.
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Tab");
    expect(await focusOnControl(dialog), `Tab press ${press + 1}`).toBe(true);
  }
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusOnControl(dialog), `Shift+Tab press ${press + 1}`).toBe(true);
  }

  // A click on a fact's text leaves the focus off every control, and the next Tab lands inside.
  await dialog.getByText("Next version", { exact: true }).click();
  expect(await focusOnControl(dialog)).toBe(false);
  await page.keyboard.press("Tab");
  expect(await focusOnControl(dialog)).toBe(true);

  // A press on the backdrop closes nothing.
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(publish).toBeFocused();
});

test("the back control on a dirty draft asks before it leaves", async ({ page }) => {
  await openDirtyDraft(page);
  const back = page.getByRole("button", { name: "Back to processes" });
  await back.click();
  const dialog = page.getByRole("dialog", { name: "Leave this draft?" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(back).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(`${DRAFT_NAME} edited`);

  await back.click();
  await dialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: DRAFT_NAME, exact: true })).toBeVisible();
});
