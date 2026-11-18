/**
 * The **canvas keyboard** flows (studio-canvas-keyboard-access): the frame that
 * never scrolls, the Enter and double-click landings, the way-out menu and the
 * zoom announcement. Each runs on the suite's draft, and no flow changes what
 * publish.e2e.ts finds. A draft saves itself, so every flow stubs the `PUT`:
 * nothing reaches the server.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const DRAFT_NAME = "E2E draft";

/** Answers every `PUT` of a draft as the server does when a save lands. */
async function stubDraftSave(page: Page): Promise<void> {
  await page.route("**/drafts/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const sent = route.request().postDataJSON() as { body: unknown; layout: unknown; revision: number };
    await route.fulfill({ json: { body: sent.body, layout: sent.layout, revision: sent.revision + 1 } });
  });
}

/** Opens the suite's draft on its Map tab and returns the canvas's node group. */
async function openMap(page: Page): Promise<Locator> {
  await stubDraftSave(page);
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  await page.getByRole("tab", { name: "Map" }).click();
  const nodes = page.locator(".canvas-node");
  await expect(nodes.first()).toBeVisible();
  return nodes;
}

/** Moves the focus onto the first node with `.focus()`, so the keyboard acts on it. */
async function focusFirstNode(nodes: Locator): Promise<void> {
  await nodes.first().focus();
  await expect(nodes.first()).toBeFocused();
}

test("the canvas frame keeps its scroll offsets at 0 when focus moves at 200 percent", async ({ page }) => {
  const nodes = await openMap(page);
  await focusFirstNode(nodes);
  for (let press = 0; press < 4; press += 1) await page.keyboard.press("+");
  await expect(page.getByRole("status").filter({ hasText: /^Map at \d+ percent$/ })).toContainText("200 percent");
  const focusedId = () => page.locator(".canvas-node:focus").getAttribute("data-step-id");
  const before = await focusedId();
  await page.keyboard.press("ArrowDown");
  await expect.poll(focusedId).not.toBe(before);
  const frame = page.locator("[role=application]").locator("..");
  const offsets = await frame.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
  expect(offsets).toEqual({ top: 0, left: 0 });
  await expect(frame.locator(".canvas-node:focus")).toHaveCount(1);
  const box = await frame.boundingBox();
  const node = await page.locator(".canvas-node:focus").boundingBox();
  expect(
    box &&
      node &&
      node.x >= box.x - 1 &&
      node.x + node.width <= box.x + box.width + 1 &&
      node.y >= box.y - 1 &&
      node.y + node.height <= box.y + box.height + 1,
  ).toBe(true);
});

test("Enter and a double-click land on a Name input", async ({ page }) => {
  const nodes = await openMap(page);

  // Enter on a step lands on the step page's Name input.
  await focusFirstNode(nodes);
  await page.keyboard.press("Enter");
  await expect(page.locator("#step-page-name")).toBeFocused();

  // Enter on a way out lands on that row's Name input.
  await page.getByRole("tab", { name: "Map" }).click();
  await focusFirstNode(nodes);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-kind=edge]:focus")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("input[id^=way-out-name-]:focus")).toBeFocused();

  // A double-click on a step lands on the step page's Name input.
  await page.getByRole("tab", { name: "Map" }).click();
  await nodes.first().dblclick();
  await expect(page.locator("#step-page-name")).toBeFocused();
});

test("a lowercase c opens the way-out menu and Enter adds a way out that holds the focus", async ({ page }) => {
  const nodes = await openMap(page);
  const before = await page.locator("[data-kind=edge]").count();
  await focusFirstNode(nodes);
  await page.keyboard.press("c");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.locator("[data-kind=edge]")).toHaveCount(before + 1);
  await expect(page.locator("[data-kind=edge]:focus")).toHaveCount(1);
});

test("the zoom key announces the level and Escape in the menu returns to the step", async ({ page }) => {
  const nodes = await openMap(page);
  await focusFirstNode(nodes);
  await page.keyboard.press("+");
  await expect(page.getByRole("status").filter({ hasText: "Map at 125 percent" })).toHaveText("Map at 125 percent");

  await page.keyboard.press("c");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(nodes.first()).toBeFocused();
});

test("End then Enter on the new-step item adds a step and a way out and focuses the new way out", async ({ page }) => {
  const nodes = await openMap(page);
  const steps = await nodes.count();
  const edges = await page.locator("[data-kind=edge]").count();
  await focusFirstNode(nodes);
  await page.keyboard.press("c");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "A new step" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(nodes).toHaveCount(steps + 1);
  await expect(page.locator("[data-kind=edge]")).toHaveCount(edges + 1);
  await expect(page.locator("[data-kind=edge]:focus")).toHaveCount(1);
});
