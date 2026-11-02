/**
 * The **autosave** flows (studio-app: "A draft saves itself after each change"), on
 * the draft for flows that write, so publish.e2e.ts still finds its own unedited.
 */
import type { Locator, Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const DRAFT_NAME = "E2E writes";
const TABS = ["Map", "Steps", "Fields", "Forms", "Checks", "Settings"];

/** Past the pause, so a change a mount made would have saved by then. */
const IDLE_MS = 3000;

function draftPath(url: string): boolean {
  return /^\/drafts\/[^/]+$/.test(new URL(url).pathname);
}

/** Counts every `PUT` of a draft from now on. */
function countSaves(page: Page): { count: () => number } {
  let saves = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && draftPath(request.url())) saves += 1;
  });
  return { count: () => saves };
}

async function openDraft(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
}

test("opening a draft and reading every tab sends no save", async ({ page }) => {
  const saves = countSaves(page);
  await openDraft(page);
  for (const tab of TABS) {
    const open = page.getByRole("tab", { name: new RegExp(`^${tab}`) });
    await open.click();
    await expect(open).toHaveAttribute("aria-selected", "true");
  }
  await page.waitForTimeout(IDLE_MS);
  expect(saves.count()).toBe(0);
});

const FIELD_ID = "field_8a1c2e60-0001-4a1c-8e2f-000000000001";
const STATE_SAVED = "Saved just now";
const STATE_UNSAVED = "Unsaved changes";
const RETRYING = "Your latest changes stay in this tab, unsaved. Detent keeps trying.";
const REFUSED = "Your latest changes stay in this tab, unsaved. The server refused them, so trying again may not help. To keep them, copy the text from the JSON surface.";
const PUBLISH_STOPPED = "Detent cannot publish yet, because your latest changes have not saved. Cancel and press Try again.";

/** The state line's words. The hidden status beside it can repeat them. */
function stateLine(page: Page, words: string): Locator {
  return page.locator("header").getByText(words, { exact: true }).first();
}

/** The line the focus lands on when an answer removes Try again. */
function focusableStateLine(page: Page): Locator {
  return page.locator('header span[tabindex="-1"]');
}

function isSave(request: Request): boolean {
  return request.method() === "PUT" && draftPath(request.url());
}

/** The field's name on the Fields tab, the change these flows make. */
async function fieldName(page: Page): Promise<Locator> {
  await page.getByRole("tab", { name: /^Fields/ }).click();
  await page.locator(`[id="studio-field-rail-${FIELD_ID}"]`).click();
  return page.getByRole("textbox", { name: "Name", exact: true });
}

/** Stubs each `PUT` of a draft in turn. `pass` lets a request through, and the last entry repeats. */
async function stubSaves(page: Page, answers: readonly SaveAnswer[]): Promise<void> {
  let next = 0;
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    const answer = answers[Math.min(next, answers.length - 1)];
    next += 1;
    if (answer === "pass") return route.fallback();
    if (answer === "abort") return route.abort("connectionreset");
    const type = answer === 409 ? "draft-conflict" : "stubbed";
    return route.fulfill({ status: answer, json: { error: { type, message: "Stubbed by the smoke suite." } } });
  });
}

type SaveAnswer = "pass" | "abort" | 400 | 409 | 500;

test("an edit saves once and survives a reload", async ({ page }) => {
  await openDraft(page);
  const saves = countSaves(page);
  const name = await fieldName(page);
  await name.fill("Tag after a reload");
  await expect(stateLine(page, "Saving…")).toBeVisible();
  await expect(stateLine(page, STATE_SAVED)).toBeVisible();
  // No Save stands in the bar, before or after the answer.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  expect(saves.count()).toBe(1);

  await page.reload();
  await expect(await fieldName(page)).toHaveValue("Tag after a reload");
  expect(saves.count()).toBe(1);
});

test("the save count settles after a label, a drag, an Arrange and a JSON apply", async ({ page }) => {
  await openDraft(page);
  const saves = countSaves(page);
  const saved = stateLine(page, STATE_SAVED);
  const saving = stateLine(page, "Saving…");
  const anotherSave = async (count: number) => {
    await expect(saving).toBeVisible();
    await expect(saved).toBeVisible();
    expect(saves.count()).toBe(count);
  };

  await (await fieldName(page)).fill("Tag that settles");
  await anotherSave(1);

  await page.getByRole("tab", { name: "Map" }).click();
  const node = page.locator(".canvas-node").filter({ hasText: "On the Shelf" });
  const box = await node.boundingBox();
  if (box === null) throw new Error("the step has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await anotherSave(2);

  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("dialog", { name: "Arrange every step?" }).getByRole("button", { name: "Arrange", exact: true }).click();
  await anotherSave(3);

  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Open the JSON surface", exact: true }).click();
  const json = page.getByRole("textbox", { name: "Draft body (JSON)" });
  await json.fill((await json.inputValue()).replace("Tag that settles", "Tag from JSON"));
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await anotherSave(4);

  await page.waitForTimeout(5000);
  expect(saves.count()).toBe(4);
  await expect(stateLine(page, STATE_UNSAVED)).toHaveCount(0);

  // The layout now stands stored, and the answer gave it back in the database's key order.
  await page.reload();
  await page.getByRole("tab", { name: "Map" }).click();
  await expect(node).toBeVisible();
  await page.waitForTimeout(IDLE_MS);
  expect(saves.count()).toBe(4);
});

test("the back control saves a waiting change and leaves with no dialog", async ({ page }) => {
  await openDraft(page);
  const saves = countSaves(page);
  await (await fieldName(page)).fill("Tag before leaving");
  await page.getByRole("button", { name: "Back to processes" }).click();

  const link = page.getByRole("link", { name: DRAFT_NAME, exact: true });
  await expect(link).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(saves.count()).toBe(1);

  await link.click();
  await expect(await fieldName(page)).toHaveValue("Tag before leaving");
});

test("the browser's Back within the pause still saves", async ({ page }) => {
  await openDraft(page);
  const saves = countSaves(page);
  await (await fieldName(page)).fill("Tag before the browser's Back");
  const saved = page.waitForResponse((response) => isSave(response.request()));
  await page.goBack();
  await saved;
  expect(saves.count()).toBe(1);
});

test("two exits during the save run one navigation, the last one asked", async ({ page }) => {
  let answer = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    await answered;
    await route.fallback();
  });
  await openDraft(page);
  await (await fieldName(page)).fill("Tag under two exits");
  await page.getByRole("button", { name: "Back to processes" }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByRole("button", { name: "Back to processes" })).toBeVisible();
  answer();
  await expect(page.getByRole("heading", { level: 1, name: "Tools" })).toBeVisible();
  await expect(page).toHaveURL(/\/studio\/tools$/);
});

test("Test saves first and the Player runs the new label", async ({ page }) => {
  await openDraft(page);
  const saves = countSaves(page);
  await (await fieldName(page)).fill("Tag in the Player");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Player" })).toBeVisible();
  expect(saves.count()).toBe(1);
  await page.getByRole("button", { name: "Test this draft", exact: true }).click();
  await expect(page.getByText("Tag in the Player")).toBeVisible();
});

/** How much wider the words' box stands than their text, the hole before what follows them. */
function holeAfter(words: Locator): Promise<number> {
  return words.evaluate((element) => {
    const text = element.ownerDocument.createRange();
    text.selectNodeContents(element);
    return element.getBoundingClientRect().width - text.getBoundingClientRect().width;
  });
}

test("the state turns Saved at at the minute, and the words leave what follows them in place", async ({ page }) => {
  await page.clock.install();
  // The suite's unedited draft prints a version after the words, and nothing reaches the server.
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    const sent = route.request().postDataJSON() as { body: unknown; layout: unknown; revision: number };
    await route.fulfill({ json: { body: sent.body, layout: sent.layout, revision: sent.revision + 1 } });
  });
  await page.goto("/studio");
  await page.getByRole("link", { name: "E2E draft", exact: true }).click();
  const version = page.locator("header").getByText(/published/).first();
  const place = async () => (await version.boundingBox())?.x;
  await expect(version).toBeVisible();
  // A draft at rest takes no minimum, so no hole stands after "Saved".
  expect(await holeAfter(stateLine(page, "Saved"))).toBeLessThan(1);

  await (await fieldName(page)).fill("Tag under the clock");
  await expect(stateLine(page, "Saving…")).toBeVisible();
  const atSaving = await place();
  await page.clock.fastForward(1500);
  await expect(stateLine(page, STATE_SAVED)).toBeVisible();
  expect(await place()).toBe(atSaving);
  // The minimum is the width of these very words, so no gap stands after them.
  expect(await holeAfter(stateLine(page, STATE_SAVED))).toBeLessThan(1);

  await page.clock.fastForward(61_000);
  await expect(page.locator("header").getByText(/^Saved at /)).toBeVisible();
});

/**
 * How far the state's words stand from the version's baseline, as the difference of
 * their text tops. A block sized after the words measured 5.5px.
 */
async function baselineStep(page: Page): Promise<number> {
  return focusableStateLine(page).evaluate((line) => {
    const [words, version] = [line.firstElementChild!, line.querySelector('[translate="no"]')!].map((node) => {
      const text = line.ownerDocument.createRange();
      text.selectNodeContents(node);
      return text.getBoundingClientRect().top;
    });
    return words! - version!;
  });
}

test("the state's words stand on the version's baseline in every state", async ({ page }) => {
  await page.clock.install();
  let failing = false;
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    if (failing) return route.fulfill({ status: 500, json: { error: { type: "stubbed", message: "Stubbed by the smoke suite." } } });
    const sent = route.request().postDataJSON() as { body: unknown; layout: unknown; revision: number };
    await route.fulfill({ json: { body: sent.body, layout: sent.layout, revision: sent.revision + 1 } });
  });
  await page.goto("/studio");
  await page.getByRole("link", { name: "E2E draft", exact: true }).click();
  const measured = async (words: Locator) => {
    await expect(words).toBeVisible();
    expect(Math.abs(await baselineStep(page))).toBeLessThan(1);
  };
  await measured(stateLine(page, "Saved"));

  const name = await fieldName(page);
  await name.fill("Tag on the baseline");
  await measured(stateLine(page, "Saving…"));
  await page.clock.fastForward(1500);
  await measured(stateLine(page, STATE_SAVED));

  failing = true;
  await name.fill("Tag off the server");
  await page.clock.fastForward(1500);
  await measured(stateLine(page, STATE_UNSAVED));

  failing = false;
  await page.clock.fastForward(6000);
  await measured(stateLine(page, STATE_SAVED));
  await page.clock.fastForward(61_000);
  await measured(page.locator("header").getByText(/^Saved at /));
});

test("a failed save raises the banner and the leave dialog, and stops the Publish dialog", async ({ page }) => {
  await stubSaves(page, [500]);
  let published = 0;
  await page.route("**/drafts/*/publish", (route) => {
    published += 1;
    return route.abort();
  });
  await openDraft(page);
  await (await fieldName(page)).fill("Tag that fails");

  const banner = page.getByRole("alert").filter({ hasText: RETRYING });
  await expect(banner).toBeVisible();
  await expect(stateLine(page, STATE_UNSAVED)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();

  // The leave dialog asks, and a decline keeps the change.
  const back = page.getByRole("button", { name: "Back to processes" });
  await back.click();
  const leave = page.getByRole("dialog", { name: "Leave this draft?" });
  await expect(leave.getByText("Detent could not save your latest changes, so they go with it. The saved draft stays.")).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(leave).toBeHidden();
  await expect(back).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Tag that fails");

  // Publish hurries the save. Its failure keeps the dialog, which says why and holds the confirm.
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.click();
  const dialog = page.getByRole("dialog", { name: "Publish this draft" });
  await expect(dialog.getByRole("alert").filter({ hasText: PUBLISH_STOPPED })).toBeVisible();
  const held = dialog.getByRole("button", { name: "Publish", exact: true });
  await expect(held).toHaveAttribute("aria-disabled", "true");
  await held.click({ force: true });
  await expect(dialog).toBeVisible();
  expect(published).toBe(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(publish).toBeFocused();
  await expect(banner).toBeVisible();

  // A confirmed leave drops the change, and nothing lands behind it.
  await back.click();
  await leave.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page.getByRole("link", { name: DRAFT_NAME, exact: true })).toBeVisible();
  await page.unroute("**/drafts/*");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(await fieldName(page)).not.toHaveValue("Tag that fails");
  await expect(page.getByRole("button", { name: "Discard them", exact: true })).toHaveCount(0);
});

test("a retry waits behind the leave dialog", async ({ page }) => {
  await stubSaves(page, ["abort"]);
  await openDraft(page);
  await (await fieldName(page)).fill("Tag behind the dialog");
  await page.getByRole("button", { name: "Back to processes" }).click();
  await expect(page.getByRole("dialog", { name: "Leave this draft?" })).toBeVisible();
  const saves = countSaves(page);
  await page.waitForTimeout(6000);
  expect(saves.count()).toBe(0);
});

test("a save that aborts and then succeeds heals with no press", async ({ page }) => {
  await stubSaves(page, ["abort", "pass"]);
  await openDraft(page);
  await (await fieldName(page)).fill("Tag that heals");
  const banner = page.getByRole("alert").filter({ hasText: RETRYING });
  await expect(banner).toBeVisible();
  await expect(stateLine(page, STATE_SAVED)).toBeVisible({ timeout: 10_000 });
  await expect(banner).toBeHidden();
});

test("a save that landed behind a lost answer is no conflict", async ({ page }) => {
  // The request reaches the server and commits, and the answer never reaches the page.
  let lost = false;
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request()) || lost) return route.fallback();
    lost = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await openDraft(page);
  await (await fieldName(page)).fill("Tag behind a lost answer");
  const banner = page.getByRole("alert").filter({ hasText: RETRYING });
  await expect(banner).toBeVisible();
  // The retry answers 409, and the stored draft holds what the lost send sent.
  await expect(stateLine(page, STATE_SAVED)).toBeVisible({ timeout: 10_000 });
  await expect(banner).toBeHidden();
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toHaveCount(0);
  await expect(stateLine(page, STATE_UNSAVED)).toHaveCount(0);
});

test("a history jump between two open drafts sends the change to its own draft alone", async ({ page }) => {
  const sentTo: string[] = [];
  page.on("request", (request) => {
    if (isSave(request)) sentTo.push(new URL(request.url()).pathname);
  });
  await page.goto("/studio");
  await page.getByRole("link", { name: "E2E draft", exact: true }).click();
  const processName = page.getByRole("textbox", { name: "Process name" });
  await expect(processName).toHaveValue("E2E draft");
  await page.getByRole("button", { name: "Back to processes" }).click();
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(processName).toHaveValue(DRAFT_NAME);

  // History reads the first draft, the list, this draft, its Fields tab. The jump lands within the pause.
  await (await fieldName(page)).fill("Tag before the history jump");
  const saved = page.waitForResponse((response) => isSave(response.request()));
  await page.evaluate("history.go(-3)");
  await saved;
  await expect(processName).toHaveValue("E2E draft");
  await page.waitForTimeout(IDLE_MS);
  await expect(processName).toHaveValue("E2E draft");
  expect(sentTo).toEqual(["/drafts/proc_e2e_writes"]);

  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(await fieldName(page)).toHaveValue("Tag before the history jump");
});

test("a Reload of a draft discarded elsewhere says so", async ({ page }) => {
  await stubSaves(page, [409]);
  await openDraft(page);
  await page.route("**/drafts/*", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 404, json: { error: { type: "not-found", message: "Stubbed by the smoke suite." } } });
  });
  await (await fieldName(page)).fill("Tag over a draft that went");
  await expect(page.getByText("This draft was changed elsewhere. Reload loads the stored draft and drops your unsaved changes.")).toBeVisible();
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not found." })).toBeVisible();
});

test("a refused save waits, and Try again keeps the keyboard's place", async ({ page }) => {
  await stubSaves(page, [400, 400, "pass"]);
  await openDraft(page);
  await (await fieldName(page)).fill("Tag that retries");
  await expect(page.getByRole("alert").filter({ hasText: REFUSED })).toBeVisible();

  const tryAgain = page.getByRole("button", { name: "Try again", exact: true });
  await tryAgain.focus();
  await page.keyboard.press("Enter");
  // Refused again: the control stays, with the focus on it.
  await expect(tryAgain).toBeFocused();
  await expect(tryAgain).not.toHaveAttribute("aria-disabled", "true");

  await page.keyboard.press("Enter");
  await expect(stateLine(page, STATE_SAVED)).toBeVisible();
  await expect(tryAgain).toBeHidden();
  await expect(focusableStateLine(page)).toBeFocused();
  await expect(focusableStateLine(page)).toContainText(STATE_SAVED);
});

test("a refused save's unsaved text stands on the JSON surface, to copy", async ({ page }) => {
  await stubSaves(page, [400]);
  await openDraft(page);
  await (await fieldName(page)).fill("Tag held in this tab alone");
  await expect(page.getByRole("alert").filter({ hasText: REFUSED })).toBeVisible();

  const json = await openJson(page);
  await expect(json).toHaveValue(/Tag held in this tab alone/);
  await expect(stateLine(page, STATE_UNSAVED)).toBeVisible();
});

test("a timed retry leaves Try again's label, and a press reads Saving…", async ({ page }) => {
  let sends = 0;
  let release = () => {};
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    sends += 1;
    if (sends > 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    await route.fulfill({ status: 500, json: { error: { type: "stubbed", message: "Stubbed by the smoke suite." } } });
  });
  await openDraft(page);
  await (await fieldName(page)).fill("Tag under a timed retry");
  const tryAgain = page.getByRole("button", { name: "Try again", exact: true });
  const saving = page.getByRole("button", { name: "Saving…", exact: true });
  await expect(tryAgain).toBeVisible();

  await expect.poll(() => sends, { timeout: 10_000 }).toBe(2);
  await expect(tryAgain).toHaveAttribute("aria-disabled", "true");
  await expect(saving).toHaveCount(0);
  release();
  await expect(tryAgain).not.toHaveAttribute("aria-disabled", "true");

  await tryAgain.click();
  await expect(saving).toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => sends).toBe(3);
  release();
  await expect(tryAgain).toBeVisible();
  await expect(saving).toHaveCount(0);
});

test("a timed retry that heals moves the focus from Try again", async ({ page }) => {
  await stubSaves(page, [500, "pass"]);
  await openDraft(page);
  await (await fieldName(page)).fill("Tag healed under the focus");
  const tryAgain = page.getByRole("button", { name: "Try again", exact: true });
  await tryAgain.focus();
  await expect(tryAgain).toBeHidden({ timeout: 10_000 });
  await expect(focusableStateLine(page)).toBeFocused();
  await expect(focusableStateLine(page)).toContainText(STATE_SAVED);
});

test("a retry answered 409 moves the focus, and Publish then lands on Reload", async ({ page }) => {
  await stubSaves(page, [500, 409]);
  await openDraft(page);
  await (await fieldName(page)).fill("Tag that conflicts");
  const tryAgain = page.getByRole("button", { name: "Try again", exact: true });
  await tryAgain.focus();
  await page.keyboard.press("Enter");
  const reload = page.getByRole("button", { name: "Reload", exact: true });
  await expect(reload).toBeVisible();
  await expect(tryAgain).toBeHidden();
  await expect(focusableStateLine(page)).toBeFocused();
  await expect(focusableStateLine(page)).toContainText(STATE_UNSAVED);

  // Publish opens no dialog under the conflict, and sends the keyboard to what resolves it.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(reload).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A conflict over a change that has not landed asks at an exit, and sends nothing.
  const saves = countSaves(page);
  await page.getByRole("button", { name: "Back to processes" }).click();
  await expect(page.getByRole("dialog", { name: "Leave this draft?" })).toBeVisible();
  expect(saves.count()).toBe(0);
});

test("Publish waits on a slow save with Cancel live, and the confirm ignores a press", async ({ page }) => {
  let answer = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route("**/drafts/*", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    await answered;
    await route.fallback();
  });
  let published = 0;
  await page.route("**/drafts/*/publish", (route) => {
    published += 1;
    return route.abort();
  });
  await openDraft(page);
  await (await fieldName(page)).fill("Tag under the Publish dialog");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish this draft" });
  const waiting = dialog.getByRole("button", { name: "Saving…", exact: true });
  await expect(waiting).toHaveAttribute("aria-disabled", "true");
  await waiting.click({ force: true });
  expect(published).toBe(0);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
  answer();
  await expect(dialog.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(published).toBe(0);
});

/** Browser Back during a backoff keeps a copy, so the next visit shows the notice. */
async function raiseNotice(page: Page, label: string): Promise<void> {
  await stubSaves(page, ["abort"]);
  await openDraft(page);
  await (await fieldName(page)).fill(label);
  await expect(page.getByRole("alert").filter({ hasText: RETRYING })).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("link", { name: DRAFT_NAME, exact: true })).toBeVisible();
  await page.unroute("**/drafts/*");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("button", { name: "Discard them", exact: true })).toBeVisible();
}

test("the notice holds the saves, and answering it lets them run", async ({ page }) => {
  await raiseNotice(page, "Tag kept as a copy");
  const saves = countSaves(page);
  await (await fieldName(page)).fill("Tag under the notice");
  await page.waitForTimeout(IDLE_MS);
  expect(saves.count()).toBe(0);
  await expect(stateLine(page, STATE_UNSAVED)).toBeVisible();

  await page.getByRole("button", { name: "Discard them", exact: true }).click();
  await expect(stateLine(page, STATE_SAVED)).toBeVisible();
  expect(saves.count()).toBe(1);
});

test("an exit under the notice saves and keeps the copy, and the copy restores with no conflict", async ({ page }) => {
  await raiseNotice(page, "Tag copy to restore");
  const saves = countSaves(page);
  await (await fieldName(page)).fill("Tag saved by the exit");
  await page.getByRole("button", { name: "Back to processes" }).click();
  await expect(page.getByRole("link", { name: DRAFT_NAME, exact: true })).toBeVisible();
  expect(saves.count()).toBe(1);

  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await page.getByRole("button", { name: "Restore unsaved changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Discard them", exact: true })).toHaveCount(0);
  await expect(stateLine(page, STATE_SAVED)).toBeVisible();
  expect(saves.count()).toBe(2);
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toHaveCount(0);
  await expect(await fieldName(page)).toHaveValue("Tag copy to restore");
});

test("the process list's discard deletes the copy the tab kept", async ({ page }) => {
  await raiseNotice(page, "Tag kept, then discarded");
  await page.getByRole("button", { name: "Back to processes" }).click();
  const kept = () => page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("studio.draftStash:")));
  expect(await kept()).toHaveLength(1);

  // The suite's draft stays for the next flow: only the delete's answer is stubbed.
  await page.route("**/drafts/*", (route) => (route.request().method() === "DELETE" ? route.fulfill({ status: 204 }) : route.fallback()));
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: DRAFT_NAME, exact: true }) });
  await row.getByRole("button", { name: "Discard draft", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Discard this draft?" });
  await dialog.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await kept()).toEqual([]);

  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  await expect(page.getByRole("button", { name: "Discard them", exact: true })).toHaveCount(0);
});

const JSON_GOES = "The JSON you have not applied goes with it. The saved draft stays.";
const JSON_NOT_PUBLISHED = "The JSON you have not applied is not part of this publish.";

async function openJson(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Open the JSON surface", exact: true }).click();
  return page.getByRole("textbox", { name: "Draft body (JSON)" });
}

/** Whether a tab close would prompt: the browser reads `defaultPrevented` off this event. */
function closeWouldPrompt(page: Page): Promise<boolean> {
  return page.evaluate<boolean>(`(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
}

test("JSON no Apply has taken reads as unsaved work, sends nothing and asks at every way off", async ({ page }) => {
  await openDraft(page);
  const saves = countSaves(page);
  const json = await openJson(page);
  const seed = await json.inputValue();
  expect(await closeWouldPrompt(page)).toBe(false);
  await json.fill(`${seed} `);

  await expect(stateLine(page, STATE_UNSAVED)).toBeVisible();
  expect(await closeWouldPrompt(page)).toBe(true);
  await page.waitForTimeout(IDLE_MS);
  expect(saves.count()).toBe(0);

  // An exit asks at once, with no flush, and Cancel keeps the surface and the text.
  const back = page.getByRole("button", { name: "Back to processes" });
  await back.click();
  const leave = page.getByRole("dialog", { name: "Leave without applying?" });
  await expect(leave.getByText(JSON_GOES)).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(leave).toBeHidden();
  await expect(back).toBeFocused();
  await expect(json).toHaveValue(`${seed} `);
  expect(saves.count()).toBe(0);

  // A tab press asks the same dialog, and so does the menu's way off.
  await page.getByRole("tab", { name: /^Map/ }).click();
  await expect(leave.getByText(JSON_GOES)).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(json).toHaveValue(`${seed} `);

  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Leave the JSON surface", exact: true }).click();
  await expect(leave.getByText(JSON_GOES)).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(json).toHaveValue(`${seed} `);

  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Save points", exact: true }).click();
  await expect(leave.getByText(JSON_GOES)).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(json).toHaveValue(`${seed} `);

  // Publish says what it leaves out.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = page.getByRole("dialog", { name: "Publish this draft" });
  await expect(publish.getByText(JSON_NOT_PUBLISHED)).toBeVisible();
  await publish.getByRole("button", { name: "Cancel", exact: true }).click();

  // The text back at its seed clears it all.
  await json.fill(seed);
  await expect(stateLine(page, STATE_UNSAVED)).toHaveCount(0);
  expect(await closeWouldPrompt(page)).toBe(false);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(publish).toBeVisible();
  await expect(publish.getByText(JSON_NOT_PUBLISHED)).toHaveCount(0);
  await publish.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: /^Map/ }).click();
  await expect(leave).toHaveCount(0);
  await expect(json).toHaveCount(0);
  expect(saves.count()).toBe(0);
});

test("a successful Apply clears the unapplied state, and a refused one keeps it", async ({ page }) => {
  await openDraft(page);
  const label = await (await fieldName(page)).inputValue();
  const json = await openJson(page);
  const seed = await json.inputValue();
  await json.fill("not json");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(stateLine(page, STATE_UNSAVED)).toBeVisible();

  await json.fill(seed.replace(`"${label}"`, '"Tag from an Apply"'));
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(stateLine(page, STATE_SAVED)).toBeVisible();
  expect(await closeWouldPrompt(page)).toBe(false);
  await page.getByRole("tab", { name: /^Map/ }).click();
  await expect(json).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("confirming the question drops the text alone, and an applied change still lands", async ({ page }) => {
  await openDraft(page);
  const label = await (await fieldName(page)).inputValue();
  const json = await openJson(page);
  const seed = await json.inputValue();

  // Confirmed from a tab press, the text goes and the next open reads the draft.
  await json.fill(`${seed} `);
  await page.getByRole("tab", { name: /^Map/ }).click();
  const leave = page.getByRole("dialog", { name: "Leave without applying?" });
  await leave.getByRole("button", { name: "Leave without applying" }).click();
  await expect(json).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Map/ })).toHaveAttribute("aria-selected", "true");
  await expect(stateLine(page, STATE_UNSAVED)).toHaveCount(0);

  // An Apply waits out its pause while newer text stands, and an exit keeps what it applied.
  const applied = "Tag applied ahead of the exit";
  await openJson(page);
  const text = await json.inputValue();
  await json.fill(text.replace(`"${label}"`, `"${applied}"`));
  const landed = page.waitForResponse((response) => isSave(response.request()));
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await json.fill(`${await json.inputValue()} `);
  await page.getByRole("button", { name: "Back to processes" }).click();
  await leave.getByRole("button", { name: "Leave without applying" }).click();
  await landed;
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(await fieldName(page)).toHaveValue(applied);
});
