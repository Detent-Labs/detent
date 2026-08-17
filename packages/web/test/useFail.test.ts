/** `is401`, the pure predicate `useFail` branches on. The hook itself needs a DOM test runner this package does not have — see `docs/browser-checks.md` for its own check. */
import { describe, expect, it } from "bun:test";
import { is401 } from "../src/shell/useFail.js";
import { AppClientError } from "../src/api/client.js";

describe("is401", () => {
  it("is true for an AppClientError carrying status 401", () => {
    expect(is401(new AppClientError({ type: "internal", message: "expired" }, 401))).toBe(true);
  });

  it("is false for an AppClientError carrying a different status", () => {
    expect(is401(new AppClientError({ type: "internal", message: "boom" }, 500))).toBe(false);
  });

  it("is false for an AppClientError carrying no status", () => {
    expect(is401(new AppClientError({ type: "network", message: "offline" }))).toBe(false);
  });

  it("is false for a non-AppClientError value", () => {
    expect(is401(new Error("plain"))).toBe(false);
    expect(is401("boom")).toBe(false);
  });
});
