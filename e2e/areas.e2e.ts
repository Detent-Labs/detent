/**
 * The **areas** flow and the `setup` project (design D2, D4). Logs in once
 * through the login screen, opens each of the four areas, and saves the
 * session for the other flows.
 */
import { test, expect } from "./fixtures.js";

const E2E_EMAIL = "e2e-operator@example.test";
const STORAGE_STATE = "e2e/.auth/state.json";

/** Two labels per area nav: "Processes" alone names both the studio's and the reporting area's first entry. */
const AREAS = [
  { path: "/app", nav: ["My tasks", "Start a process"] },
  { path: "/admin", nav: ["Instances", "Outbox"] },
  { path: "/studio", nav: ["Processes", "Tools"] },
  { path: "/reporting", nav: ["Processes", "Reports"] },
] as const;

test("every area loads after a login", async ({ page }) => {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error("E2E_PASSWORD is not set. Run `bun run e2e`, which creates the suite account.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeHidden();

  for (const area of AREAS) {
    await page.goto(area.path);
    const [first, second] = area.nav;
    const nav = page
      .getByRole("navigation")
      .filter({ has: page.getByRole("button", { name: first, exact: true }) })
      .filter({ has: page.getByRole("button", { name: second, exact: true }) });
    await expect(nav, `${area.path} renders its own navigation`).toBeVisible();
    await expect(page.getByText("Something went wrong."), `${area.path} renders no error boundary`).toHaveCount(0);
  }

  await page.context().storageState({ path: STORAGE_STATE });
});
