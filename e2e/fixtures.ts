/**
 * The `test` every flow imports. Its one auto fixture fails the flow on any
 * uncaught page exception (browser-smoke-suite: "The smoke suite covers four
 * flows"), whether or not the flow's own assertions passed.
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.stack ?? err.message));
      await use();
      expect(errors, "uncaught page exceptions").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
