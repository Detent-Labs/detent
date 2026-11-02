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
  await expect(dialog.getByText("Your work as it stands now becomes a save point, so you can come back to it.")).toBeVisible();
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
  await expect(await fieldName(page)).toHaveValue(changed);

  // Remove asks first, and the focus lands on the input.
  await openSavePoints(page);
  await row.getByRole("button", { name: "Remove “Before the label”" }).click();
  const removal = page.getByRole("dialog", { name: "Remove “Before the label”?" });
  await expect(removal.getByText("The studio has no undo.")).toBeVisible();
  await removal.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toHaveCount(0);
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

  // The create that reaches the bound moves the focus from the input to the sentence.
  await input.fill("Gamma");
  await page.getByRole("button", { name: "Save this point", exact: true }).click();
  const sentence = page.getByText("This draft holds 3 save points. Remove one to name another or to restore one.");
  await expect(sentence).toBeFocused();
  await expect(input).toHaveCount(0);

  // Restore stands aria-disabled and opens nothing, and Remove stays available.
  const restore = page.getByRole("button", { name: "Restore “Alpha”", exact: true });
  await expect(restore).toHaveAttribute("aria-disabled", "true");
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
