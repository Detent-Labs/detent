/**
 * The **save point** flow (studio-app: "The Save points view lists a draft's save
 * points"), on the draft for flows that write, beside draft-autosave.e2e.ts.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const DRAFT_NAME = "E2E writes";
const FIELD_ID = "field_8a1c2e60-0001-4a1c-8e2f-000000000001";

/** The state line's words. The hidden status beside it can repeat them. */
function stateLine(page: Page, words: string): Locator {
  return page.locator("header").getByText(words, { exact: true }).first();
}

/** The field's name on the Fields tab, the change this flow makes. */
async function fieldName(page: Page): Promise<Locator> {
  await page.getByRole("tab", { name: /^Fields/ }).click();
  await page.locator(`[id="studio-field-rail-${FIELD_ID}"]`).click();
  return page.getByRole("textbox", { name: "Name", exact: true });
}

async function openSavePoints(page: Page): Promise<void> {
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Save points", exact: true }).click();
}

test("a save point is named, restored, restored back and removed", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  const original = await (await fieldName(page)).inputValue();

  // The menu opens the view with the name input holding the focus.
  await openSavePoints(page);
  await expect(page).toHaveURL(/\/edit\/settings\/points$/);
  const input = page.getByRole("textbox", { name: "Name this save point" });
  await expect(input).toBeFocused();
  await expect(page.getByText("No save points yet.")).toBeVisible();

  // An empty name asks for one and sends nothing.
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  await expect(page.getByText("Give this save point a name.")).toBeVisible();

  // Naming a point clears the input, adds the row and keeps the focus.
  await input.fill("Before the label");
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  // The kept points carry the name too, so the row is the one whose control names it alone.
  const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Restore “Before the label”", exact: true }) });
  await expect(row).toContainText(/Saved by .+, just now/);
  await expect(page.getByText("Saved “Before the label”.")).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();

  // A change made after the point saves itself.
  const changed = `${original} changed`;
  await (await fieldName(page)).fill(changed);
  await expect(stateLine(page, "Saved just now")).toBeVisible();
  await openSavePoints(page);

  // Restore asks first and names what it keeps. The confirm waits behind nothing.
  const restore = row.getByRole("button", { name: "Restore “Before the label”" });
  await restore.click();
  const dialog = page.getByRole("dialog", { name: "Restore “Before the label”?" });
  await expect(dialog.getByText("The draft goes back to this point. Your work as it stands now becomes a save point, so you can come back to it.")).toBeVisible();
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Restored “Before the label”. Your work before it stands as “Before restoring “Before the label””.")).toBeVisible();
  await expect(restore).toBeFocused();
  await expect(stateLine(page, "Saved just now")).toBeVisible();
  const kept = page.getByRole("listitem").filter({ hasText: "Before restoring “Before the label”" });
  await expect(kept).toBeVisible();

  // The old label is back, and no save followed the restore.
  await expect(await fieldName(page)).toHaveValue(original);

  // Restoring the kept point brings the new label back.
  await openSavePoints(page);
  await kept.getByRole("button", { name: /^Restore/ }).click();
  await page.getByRole("dialog", { name: /^Restore/ }).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText(/^Restored “Before restoring/)).toBeVisible();
  // A kept name stays flat, so the kept point's own kept point shares its name.
  await expect(kept).toHaveCount(2);
  await expect(await fieldName(page)).toHaveValue(changed);

  // Remove asks first, and the focus lands on the input.
  await openSavePoints(page);
  await row.getByRole("button", { name: "Remove “Before the label”" }).click();
  const removal = page.getByRole("dialog", { name: "Remove “Before the label”?" });
  await expect(removal.getByText("This save point goes for good. The draft stays as it is.")).toBeVisible();
  await removal.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("tabpanel", { name: "Save points" }).getByRole("status")).toHaveText("Removed “Before the label”.");
  await expect(input).toBeFocused();

  // The discard dialog says the points go with the draft.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  const discard = page.getByRole("dialog", { name: "Discard this draft?" });
  await expect(discard.getByText("Its save points go with it.")).toBeVisible();
  await discard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(discard).toBeHidden();
});

/** A server that states a bound of three, in memory. The engine's own bound needs fifty rows. */
async function stubBoundedList(page: Page): Promise<void> {
  const items = ["Alpha", "Beta"].map((name, i) => ({
    savePointId: `spt_stub_${i}`,
    processId: "stub",
    name,
    revision: 1,
    createdBy: "stub",
    createdAt: new Date().toISOString(),
    createdByDisplayName: "Roman",
  }));
  await page.route("**/drafts/*/save-points**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ json: { items, limit: 3 } });
    if (request.method() === "POST") {
      const sent = request.postDataJSON() as { name: string };
      const made = { ...items[0]!, savePointId: `spt_stub_${items.length}`, name: sent.name };
      items.unshift(made);
      return route.fulfill({ status: 201, json: made });
    }
    const id = path.split("/").pop();
    items.splice(
      items.findIndex((item) => item.savePointId === id),
      1,
    );
    return route.fulfill({ status: 204 });
  });
}

test("the bound takes the input, keeps Remove, and a remove brings the input back", async ({ page }) => {
  await stubBoundedList(page);
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  await openSavePoints(page);
  const input = page.getByRole("textbox", { name: "Name this save point" });
  await expect(input).toBeFocused();

  // The empty status line stays mounted and leaves the column's one gap, the gap above the form.
  const rowsAt = page.getByRole("button", { name: "Restore “Alpha”", exact: true });
  await expect(rowsAt).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Save points" }).getByRole("status")).toBeAttached();
  const box = async (locator: Locator) => (await locator.boundingBox())!;
  const form = await box(page.locator("form").filter({ has: input }));
  const help = await box(page.getByText("A save point keeps the draft as it stands now, so you can come back to it."));
  const list = await box(page.getByRole("list").filter({ has: rowsAt }));
  expect(list.y - (form.y + form.height)).toBeCloseTo(form.y - (help.y + help.height), 0);

  // The row's two commands take the authoring command's face.
  await expect(rowsAt).toHaveCSS("font-size", "11px");
  await expect(page.getByRole("button", { name: "Remove “Alpha”", exact: true })).toHaveCSS("font-size", "11px");

  // The create that reaches the bound moves the focus from the input to the sentence.
  await input.fill("Gamma");
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  const sentence = page.getByText("This draft holds 3 save points. Remove one to name another or to restore one.");
  await expect(sentence).toBeFocused();
  await expect(input).toHaveCount(0);

  // Restore stands aria-disabled and opens nothing, and Remove stays available.
  const restore = page.getByRole("button", { name: "Restore “Alpha”", exact: true });
  await expect(restore).toHaveAttribute("aria-disabled", "true");
  await expect(restore).toHaveCSS("opacity", "0.45");
  await expect(page.getByRole("button", { name: "Remove “Alpha”", exact: true })).toHaveCSS("opacity", "1");
  await restore.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The menu at the bound lands on the sentence.
  await page.getByRole("tab", { name: /^Map/ }).click();
  await openSavePoints(page);
  await expect(sentence).toBeFocused();

  // A remove at the bound brings the input back, holding the focus.
  await page.getByRole("button", { name: "Remove “Beta”", exact: true }).click();
  await page.getByRole("dialog", { name: "Remove “Beta”?" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(sentence).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore “Alpha”", exact: true })).not.toHaveAttribute("aria-disabled", "true");
});

/** Answers each `PUT` of a draft with this status until the page unroutes it. */
async function stubSaveAnswers(page: Page, status: number): Promise<void> {
  await page.route("**/drafts/*", (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.fallback();
    return route.fulfill({ status, json: { error: { type: status === 409 ? "draft-conflict" : "stubbed", message: "Stubbed by the smoke suite." } } });
  });
}

/** Counts the acts that would write a save point. The stub answers them, so none reaches the server. */
function countActs(page: Page): { count: () => number } {
  let acts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/save-points(\/[^/]+\/restore)?$/.test(new URL(request.url()).pathname)) acts += 1;
  });
  return { count: () => acts };
}

test("a failed save stops naming and restoring, says so at the act, and the sentence leaves when the save heals", async ({ page }) => {
  await stubBoundedList(page);
  await stubSaveAnswers(page, 500);
  const acts = countActs(page);
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  await (await fieldName(page)).fill("Tag behind a failed save");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await openSavePoints(page);

  // Naming prints at the input and keeps the name typed.
  const input = page.getByRole("textbox", { name: "Name this save point" });
  await input.fill("Held name");
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  const createStopped = page.getByRole("alert").filter({ hasText: "This save point cannot hold your latest changes until they save. Try again above." });
  await expect(createStopped).toBeVisible();
  await expect(input).toHaveValue("Held name");
  expect(acts.count()).toBe(0);

  // The Restore dialog stays open and says why, and no restore request leaves.
  await page.getByRole("button", { name: "Restore “Alpha”", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restore “Alpha”?" });
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  const restoreStopped = dialog.getByRole("alert").filter({ hasText: "Detent cannot restore yet, because your latest changes have not saved. Try again above, then restore." });
  await expect(restoreStopped).toBeVisible();
  expect(acts.count()).toBe(0);

  // A timed retry heals under the dialog, so neither sentence stands any longer.
  await page.unroute("**/drafts/*");
  await expect(restoreStopped).toHaveCount(0, { timeout: 10_000 });
  await expect(dialog).toBeVisible();
  await expect(createStopped).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(input).toHaveValue("Held name");
});

test("a standing conflict keeps its route: a create says nothing, and the Restore dialog closes", async ({ page }) => {
  await stubBoundedList(page);
  await stubSaveAnswers(page, 409);
  const acts = countActs(page);
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  await (await fieldName(page)).fill("Tag under a conflict");
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toBeVisible();
  await openSavePoints(page);

  const input = page.getByRole("textbox", { name: "Name this save point" });
  await input.fill("Held name");
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  await expect(input).toHaveValue("Held name");
  await expect(page.getByText("This save point cannot hold your latest changes until they save.", { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "Restore “Alpha”", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restore “Alpha”?" });
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toBeVisible();
  expect(acts.count()).toBe(0);
});

/** Lets one request of each act through to the server and loses its answer, or sends nothing at all. */
async function loseAnswer(page: Page, path: RegExp, reach: boolean): Promise<void> {
  let done = false;
  await page.route("**/drafts/**", async (route) => {
    if (done || route.request().method() !== "POST" || !path.test(new URL(route.request().url()).pathname)) return route.fallback();
    done = true;
    if (reach) await route.fetch();
    await route.abort("connectionreset");
  });
}

function countListReads(page: Page): { count: () => number } {
  let reads = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname.endsWith("/save-points")) reads += 1;
  });
  return { count: () => reads };
}

test("lost answers: a create shows its row, and a restore that landed adopts the stored draft", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("link", { name: DRAFT_NAME, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(DRAFT_NAME);
  const original = await (await fieldName(page)).inputValue();
  await openSavePoints(page);
  const input = page.getByRole("textbox", { name: "Name this save point" });

  // The create commits and its answer goes: the sentence stands, and the row shows.
  await loseAnswer(page, /\/save-points$/, true);
  await input.fill("Lost create");
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not reach the server." })).toBeVisible();
  const restore = page.getByRole("button", { name: "Restore “Lost create”", exact: true });
  await expect(restore).toBeVisible();
  await expect(input).toHaveValue("Lost create");
  await input.fill("");

  await (await fieldName(page)).fill(`${original} after the point`);
  await expect(stateLine(page, "Saved just now")).toBeVisible();
  await openSavePoints(page);

  // A restore that never arrived stays in its dialog, and the list reads again.
  const reads = countListReads(page);
  await loseAnswer(page, /\/restore$/, false);
  await restore.click();
  const dialog = page.getByRole("dialog", { name: "Restore “Lost create”?" });
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog.getByText("Could not reach the server.")).toBeVisible();
  await expect.poll(reads.count).toBe(1);
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(await fieldName(page)).toHaveValue(`${original} after the point`);
  await openSavePoints(page);
  await expect.poll(reads.count).toBe(2);

  // A restore that committed behind the lost answer lands as done, and nothing conflicts.
  await page.unrouteAll();
  await loseAnswer(page, /\/restore$/, true);
  await restore.click();
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Restored “Lost create”\./)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Before restoring “Lost create”" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toHaveCount(0);
  await expect(await fieldName(page)).toHaveValue(original);
});
