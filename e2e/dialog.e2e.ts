/**
 * The **one dialog form** flows (spa-accessibility): the keyboard hold, the
 * focus return, the backdrop, and the leave prompt, on the suite's draft. A draft
 * saves itself, so each flow that edits it stubs the `PUT`: nothing reaches the
 * server, and the draft that publish.e2e.ts publishes afterwards stays as it was.
 * The canvas removal really saves, so it runs on the draft for flows that write.
 */
import type { Locator, Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const DRAFT_NAME = "E2E draft";
const WRITES_DRAFT_NAME = "E2E writes";

/** Answers every `PUT` of a draft by `answer`, so nothing reaches the server. */
async function stubDraftSave(page: Page, answer: (route: Route) => Promise<void>): Promise<void> {
  await page.route("**/drafts/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await answer(route);
  });
}

/** Answers as the server does when a save lands. */
function landed(route: Route): Promise<void> {
  const sent = route.request().postDataJSON() as { body: unknown; layout: unknown; revision: number };
  return route.fulfill({ json: { body: sent.body, layout: sent.layout, revision: sent.revision + 1 } });
}

/** Opens the suite's draft from the studio's process list and types into its name, leaving a change that has not landed. */
async function openDirtyDraft(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  const name = page.getByRole("textbox", { name: "Process name" });
  await name.fill(`${DRAFT_NAME} edited`);
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
}

/** Whether a control inside the dialog holds the focus. The dialog itself and the body do not count. */
async function focusOnControl(dialog: Locator): Promise<boolean> {
  return (await dialog.locator(":focus").count()) === 1;
}

test("a dialog holds the keyboard, ignores the backdrop and returns the focus", async ({ page }) => {
  await stubDraftSave(page, landed);
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

  // The same click, then Shift+Tab.
  await dialog.getByText("Next version", { exact: true }).click();
  expect(await focusOnControl(dialog)).toBe(false);
  await page.keyboard.press("Shift+Tab");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeFocused();

  // Chromium's click leaves the focus on the dialog, where any listener hears Tab. On the body only a document
  // listener does. Without one, the browser's own step from Publish lands on the Developer view's summary.
  const confirm = dialog.getByRole("button", { name: "Publish", exact: true });
  await confirm.focus();
  await confirm.blur();
  expect(await page.locator("body").evaluate((body) => body.ownerDocument.activeElement === body)).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();

  // A press on the backdrop closes nothing.
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(publish).toBeFocused();
});

test("the back control asks before it leaves when the save fails", async ({ page }) => {
  await stubDraftSave(page, (route) => route.fulfill({ status: 500, json: { error: { type: "internal", message: "Stubbed by the smoke suite." } } }));
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

test("a long dialog opened by keyboard in a tab panel opens with its heading in view", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 240 });
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await page.getByRole("tab", { name: "Fields" }).click();
  await page.getByRole("button", { name: "Asset Tag" }).click();
  const remove = page.getByRole("button", { name: "Remove field", exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Remove “Asset Tag”?" });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeFocused();
  // The body runs longer than the dialog, or the rest of this flow proves nothing.
  const scroll = await dialog.evaluate((element) => ({ top: element.scrollTop, overflow: element.scrollHeight - element.clientHeight }));
  expect(scroll.overflow).toBeGreaterThan(0);
  expect(scroll.top).toBe(0);
  await expect(dialog.getByRole("heading", { name: "Remove “Asset Tag”?" })).toBeInViewport({ ratio: 1 });
  await expect(cancel).toBeInViewport({ ratio: 1 });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(remove).toBeFocused();
});

test("the canvas bar's remove controls ask first and name what goes", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("link", { name: WRITES_DRAFT_NAME, exact: true }).click();
  await page.getByRole("tab", { name: "Map" }).click();
  const first = page.locator(".canvas-node").filter({ hasText: "Spare One" });
  const second = page.locator(".canvas-node").filter({ hasText: "Spare Two" });

  // One step takes the step page's dialog. A decline keeps it and returns the focus.
  await second.click();
  const removeOne = page.getByRole("button", { name: "Remove step", exact: true });
  await removeOne.click();
  const one = page.getByRole("dialog", { name: "Remove “Spare Two”?" });
  await expect(one.getByRole("button", { name: "Remove the step", exact: true })).toBeVisible();
  await one.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(one).toBeHidden();
  await expect(removeOne).toBeFocused();
  await expect(second).toBeVisible();

  // Several take the dialog that names each one.
  await first.click({ modifiers: ["Shift"] });
  const removeBoth = page.getByRole("button", { name: "Remove steps", exact: true });
  await removeBoth.click();
  const both = page.getByRole("dialog", { name: "Remove 2 steps?" });
  await expect(both.getByRole("listitem")).toHaveText(["Spare One", "Spare Two"]);
  await both.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(both).toBeHidden();
  await expect(removeBoth).toBeFocused();
  await expect(first).toBeVisible();

  // A confirm removes them, and the focus lands on the open tab.
  await removeBoth.click();
  await both.getByRole("button", { name: "Remove the steps", exact: true }).click();
  await expect(both).toBeHidden();
  await expect(first).toBeHidden();
  await expect(second).toBeHidden();
  await expect(page.getByRole("tab", { name: "Map" })).toBeFocused();
});
