/**
 * The smoke suite's Playwright config. `scripts/e2e.ts` is the only intended
 * caller: it starts the engine, derives `E2E_BASE_URL` from the port the OS
 * chose, and forwards to `bunx playwright test`. A bare `playwright test`
 * throws below rather than running against whatever server happens to answer
 * on a guessed port.
 *
 * `testMatch` narrows to `*.e2e.ts` so `bun test`'s own `*.spec.ts`/`*.test.ts`
 * collection never picks up a Playwright spec (design D2).
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    "E2E_BASE_URL is not set. Run `bun run e2e`, which starts the engine and sets it — a bare `playwright test` cannot run against a stale server.",
  );
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  // The four flows share one `_e2e` database and count rows before and after
  // their own mutation (design D4); a second worker or a retried flow would
  // race those counts.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Logs in once and saves storageState, so the other three flows start
      // authenticated without spending a login each — the login rate limit
      // counts successful logins (design D2).
      name: "setup",
      testMatch: "areas.e2e.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: "areas.e2e.ts",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
      },
    },
  ],
});
