/**
 * The **admin edits** flow (`keep-admin-edits-on-refresh`, design D8). Two
 * admin screens refetch on a window `focus`, and only a real page observes
 * that event.
 *
 * - F-1, `openspec/changes/archive/2026-10-10-audit-record/AUDIT.md` line 173:
 *   a refetch wiped unsaved input. The first test types an override on the UI
 *   strings screen, refocuses the window, and asserts the input keeps its text.
 * - F-18, `openspec/changes/archive/2026-10-10-audit-record/AUDIT.md` line 365:
 *   the Users screen loaded the whole directory on every focus. The second test
 *   asserts that a focus within 30 seconds of the load sends no directory
 *   request, while the Refresh button still sends one.
 */
import type { Page, Request, Response } from "@playwright/test";
import { test, expect } from "./fixtures.js";

/** A `GET` the page sends with fetch. The page document shares the path with the API route, so the resource type tells the two apart. */
function isApiRead(req: Request, path: string): boolean {
  return req.method() === "GET" && ["fetch", "xhr"].includes(req.resourceType()) && new URL(req.url()).pathname === path;
}

/** Resolves on the next successful API read of `path`. Start it before the action that triggers the read. */
function nextApiRead(page: Page, path: string): Promise<Response> {
  return page.waitForResponse((r) => isApiRead(r.request(), path) && r.ok());
}

/**
 * Resolves once the page has handled `read`: the body is complete, and two
 * frames have passed for React to apply the answer. The response event alone
 * fires on the headers, before the screen has seen the data.
 */
async function handled(page: Page, read: Promise<Response>): Promise<void> {
  await (await read).finished();
  await page.evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))");
}

/** The suite's tsconfig has no DOM lib, so the page-side code travels as a string. */
const focusWindow = (page: Page) => page.evaluate("window.dispatchEvent(new Event('focus'))");

test("a typed UI-strings override survives a window refocus", async ({ page }) => {
  const text = "Typed before the refocus";

  // The first load seeds the inputs and clears any draft, so type only after it.
  const firstRead = nextApiRead(page, "/admin/ui-strings");
  await page.goto("/admin/ui-strings");
  await handled(page, firstRead);

  const input = page.getByRole("table").getByRole("textbox").first();
  await input.fill(text);

  const refetch = nextApiRead(page, "/admin/ui-strings");
  await focusWindow(page);
  // Without this the assertion below could pass before a refetch ran at all.
  await handled(page, refetch);

  await expect(input).toHaveValue(text);
});

test("a focus within 30 seconds does not reload the Users directory", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page.getByRole("cell", { name: "e2e-operator@example.test", exact: true })).toBeVisible();

  let reads = 0;
  page.on("request", (req) => {
    if (isApiRead(req, "/admin/users")) reads += 1;
  });

  await focusWindow(page);
  // An absent request has no event to wait for.
  await page.waitForTimeout(1000);
  expect(reads, "directory reads after a focus 1 second into the load").toBe(0);

  // The counter sees requests, and the Refresh button is never throttled.
  await page.getByRole("main").getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => reads, "directory reads after Refresh").toBeGreaterThan(0);
});
