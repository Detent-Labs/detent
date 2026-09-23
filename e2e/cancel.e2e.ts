/**
 * The **cancel** flow (design D4): a cancelled instance shows as cancelled in
 * the admin list. The flow moves between the list and the detail screen by
 * clicks only, never by `page.goto` or a reload, so a list that survives a
 * remount stale fails it.
 */
import { test, expect } from "./fixtures.js";

test("a cancelled instance shows as cancelled in the admin list", async ({ page }) => {
  await page.goto("/app/start");
  await page.getByRole("button", { name: "Expense Approval — Start" }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/[^/]+$/);
  const instanceId = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");

  await page.goto("/admin");
  const runningRow = page.getByRole("button", { name: "Open instance: Expense Approval — Capture (running)", exact: true });
  const cancelledRows = page.getByRole("button", { name: /^Open instance: .*\(cancelled\)$/ });
  await expect(runningRow.first()).toBeVisible();
  const before = await cancelledRows.count();

  await runningRow.first().click();
  await expect(page.getByRole("heading", { level: 1, name: instanceId, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel instance", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel instance", exact: true })).toBeHidden();

  await page.getByRole("button", { name: "← Instances", exact: true }).click();
  await expect(cancelledRows).toHaveCount(before + 1);
});
