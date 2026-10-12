/**
 * The **session-tabs** flow: a logout in one tab ends the session in the
 * other, which lands on the login screen with the notice and no action of its
 * own. One browser context, so both pages share `localStorage`.
 *
 * The flow starts with an empty storage state and logs in through the login
 * screen. It never writes `e2e/.auth/state.json`: the token stays valid
 * server-side after a client logout, and the other flows keep their own copy.
 */
import { test, expect } from "./fixtures.js";

const E2E_EMAIL = "e2e-operator@example.test";

test.use({ storageState: { cookies: [], origins: [] } });

test("a logout in one tab signs the other tab out with a notice", async ({ page, context }) => {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error("E2E_PASSWORD is not set. Run `bun run e2e`, which creates the suite account.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeHidden();

  const other = await context.newPage();
  await other.goto("/app");
  await expect(other.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Log in" })).toBeHidden();

  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByText("Your session ended in another tab.")).toHaveCount(0);

  // No action in `other`: the storage event alone ends its session.
  await expect(other.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(other.getByText("Your session ended in another tab.")).toBeVisible();
  await expect(other).toHaveURL(/\/login$/);
});
