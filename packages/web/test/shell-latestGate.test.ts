import { describe, expect, it } from "bun:test";
import { createLatestGate } from "../src/shell/latestGate.js";

/**
 * The newest-answer gate behind `usePagedList` (`admin-app`, "A list shows only
 * its newest answer"). The hook itself cannot render here, so the rule lives in
 * this pure module.
 */
describe("createLatestGate", () => {
  it("reports the running generation as current", () => {
    const gate = createLatestGate();
    const isCurrent = gate.next();
    expect(isCurrent()).toBe(true);
  });

  it("turns an older generation stale when next() starts a newer one", () => {
    const gate = createLatestGate();
    const first = gate.next();
    const second = gate.next();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("keeps a stale generation stale", () => {
    const gate = createLatestGate();
    const first = gate.next();
    gate.next();
    gate.next();
    expect(first()).toBe(false);
  });

  it("hands current() a checker for the running generation", () => {
    const gate = createLatestGate();
    const running = gate.next();
    const append = gate.current();
    expect(append()).toBe(true);
    expect(running()).toBe(true);
  });

  it("never turns a generation stale through current()", () => {
    const gate = createLatestGate();
    const running = gate.next();
    gate.current();
    gate.current();
    expect(running()).toBe(true);
  });

  it("keeps two current() checkers true until the next next()", () => {
    const gate = createLatestGate();
    gate.next();
    const a = gate.current();
    const b = gate.current();
    expect([a(), b()]).toEqual([true, true]);
    gate.next();
    expect([a(), b()]).toEqual([false, false]);
  });

  it("drops an earlier append when a later replace starts", () => {
    const gate = createLatestGate();
    gate.next();
    const append = gate.current();
    const replace = gate.next();
    expect(append()).toBe(false);
    expect(replace()).toBe(true);
  });

  it("keeps separate gates independent", () => {
    const a = createLatestGate();
    const b = createLatestGate();
    const fromA = a.next();
    b.next();
    expect(fromA()).toBe(true);
  });
});
