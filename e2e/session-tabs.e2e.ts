/**
 * The **session-tabs** flow: a logout in one tab ends the session in the
 * other, which lands on the login screen with the notice and no action of its
 * own. One browser context, so both pages share `localStorage`.
 *
 * The flow starts with an empty storage state and logs in through the login
 * screen, twice. It never writes `e2e/.auth/state.json`: the token stays valid
 * server-side after a client logout, and the other flows keep their own copy.
 */
import { test, expect } from "./fixtures.js";

const E2E_EMAIL = "e2e-operator@example.test";
const NOTICE = "Your session ended in another tab.";

test.use({ storageState: { cookies: [], origins: [] } });

test("a logout in one tab signs the other tab out with a notice", async ({ page, context }) => {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error("E2E_PASSWORD is not set. Run `bun run e2e`, which creates the suite account.");

  const loginHeading = (p: typeof page) => p.getByRole("heading", { name: "Log in" });
  const logIn = async (p: typeof page) => {
    await p.getByLabel("Email").fill(E2E_EMAIL);
    await p.getByLabel("Password").fill(password);
    await p.getByRole("button", { name: "Log in" }).click();
    await expect(loginHeading(p)).toBeHidden();
  };
  const logOut = async (p: typeof page) => {
    await p.getByRole("button", { name: "Account", exact: true }).click();
    await p.getByRole("menuitem", { name: "Log out", exact: true }).click();
    await expect(loginHeading(p)).toBeVisible();
  };

  await page.goto("/login");
  await logIn(page);

  const other = await context.newPage();
  // The `failOnPageError` fixture watches `page` only.
  const otherErrors: string[] = [];
  other.on("pageerror", (err) => otherErrors.push(err.stack ?? err.message));
  await other.goto("/app");
  await expect(other.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await expect(loginHeading(other)).toBeHidden();

  await logOut(page);

  // No action in `other`: the storage event alone ends its session.
  await expect(loginHeading(other)).toBeVisible();
  await expect(other.getByText(NOTICE)).toBeVisible();
  await expect(other).toHaveURL(/\/login$/);
  // A chosen logout shows no notice. By now the page has settled.
  await expect(page.getByText(NOTICE)).toHaveCount(0);

  // The notice goes with the next login, and a later chosen logout shows none.
  await logIn(other);
  await expect(other.getByText(NOTICE)).toHaveCount(0);
  await logOut(other);
  await expect(other.getByText(NOTICE)).toHaveCount(0);
  expect(await other.evaluate(() => localStorage.getItem("web.session"))).toBeNull();

  expect(otherErrors, "uncaught page exceptions in the second page").toEqual([]);
});
