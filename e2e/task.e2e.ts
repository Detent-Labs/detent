/**
 * The **task** flow (design D4): a submitted Expense Approval task leaves My
 * tasks. Counts the rows My tasks shows right after the start and again after
 * the submit, and asserts one fewer.
 */
import type { Page, Response } from "@playwright/test";
import { test, expect } from "./fixtures.js";

/** Resolves on the next successful `GET /instances` list read, the one My tasks makes on mount. */
function nextInstanceList(page: Page): Promise<Response> {
  return page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/instances" && r.ok());
}

test("a completed task leaves My tasks", async ({ page }) => {
  const main = page.getByRole("main");
  const expenseRows = main.getByRole("button", { name: /^Expense Approval/ });
  // Disabled while My tasks loads; the rows and this flag land in one render.
  const refresh = main.getByRole("button", { name: "Refresh", exact: true });

  await page.goto("/app/start");
  await page.getByRole("button", { name: "Expense Approval — Start" }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/[^/]+$/);
  const taskUrl = page.url();

  let listed = nextInstanceList(page);
  await page.getByRole("button", { name: "My tasks", exact: true }).click();
  await listed;
  await expect(refresh).toBeEnabled();
  await expect(expenseRows.first()).toBeVisible();
  const before = await expenseRows.count();

  await page.goto(taskUrl);
  await page.getByRole("button", { name: "Claim", exact: true }).click();
  // The claim reloads the task view, which resets the form; fill after it lands.
  await expect(page.getByRole("button", { name: "Release", exact: true })).toBeVisible();
  await page.getByLabel("Amount").fill("42");
  await page.getByLabel("Reason").fill("Smoke suite expense");

  listed = nextInstanceList(page);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My tasks" })).toBeVisible();
  await listed;
  await expect(refresh).toBeEnabled();
  await expect(expenseRows).toHaveCount(before - 1);
});
