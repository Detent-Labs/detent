/**
 * form-view-tabs, group 4 fix round 1 ("Important 1" / "Important 2"): both
 * `TaskScreen.tsx` and `PlayerScreen.tsx` derive the tab to open after a
 * failed submission from `validationIssues` alone, in a `useEffect`, never
 * from `issuesByField` — the `Map` the render body separately builds from
 * that same state. `issuesByField` is a fresh object on every render, so
 * keying the effect on it would re-run `tabToOpenOnFailure` on every
 * unrelated re-render (posting a comment, loading a record page) and force
 * the participant back onto the tab it names, even after they had
 * deliberately switched away from it while the same stale issues sat in
 * state.
 *
 * `claimLogic.test.ts` and `studio-playerLogic.test.ts` cover
 * `tabToOpenOnFailure` itself — that it is deterministic, and that it leaves
 * an empty issue map alone. Neither can see which array a `useEffect`
 * dependency list names: that is a fact about the call site, not the pure
 * function. This file is the check on the call site, the way
 * `stylex-shorthand.test.ts` checks a call site no type system reaches.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const SCREENS = [
  { name: "TaskScreen", path: new URL("../src/areas/app/screens/TaskScreen.tsx", import.meta.url).pathname },
  { name: "PlayerScreen", path: new URL("../src/areas/studio/screens/PlayerScreen.tsx", import.meta.url).pathname },
];

/**
 * The dependency array literal closing the first `useEffect` that follows a
 * `tabToOpenOnFailure(` call in `source`, as raw text (e.g.
 * `"[validationIssues, view]"`). Throws when no such call, or no closing
 * `}, [...]);` after it, is found — a screen that stops calling
 * `tabToOpenOnFailure` at all should fail loudly here, not read as a pass.
 */
function tabSwitchEffectDeps(source: string, screenName: string): string {
  const callIndex = source.indexOf("tabToOpenOnFailure(");
  if (callIndex === -1) throw new Error(`${screenName}: no tabToOpenOnFailure call found`);
  const after = source.slice(callIndex);
  const depsMatch = after.match(/\},\s*(\[[^\]]*\])\s*\);/);
  if (!depsMatch || depsMatch[1] === undefined) throw new Error(`${screenName}: no dependency array found after tabToOpenOnFailure`);
  return depsMatch[1];
}

describe("the tab-switch effect's dependency list", () => {
  for (const screen of SCREENS) {
    const source = readFileSync(screen.path, "utf8");

    it(`${screen.name}: names validationIssues`, () => {
      expect(tabSwitchEffectDeps(source, screen.name)).toContain("validationIssues");
    });

    it(`${screen.name}: never names issuesByField`, () => {
      // The regression this guards: re-keying the effect onto the derived
      // Map instead of the state it was built from.
      expect(tabSwitchEffectDeps(source, screen.name)).not.toContain("issuesByField");
    });
  }

  it("reports a hit for a dependency array that does name issuesByField", () => {
    // Mutation cover: without this, an extractor that always answered "" (or
    // threw and got swallowed) would still pass the two assertions above.
    const bad = `
      useEffect(() => {
        const nextTab = tabToOpenOnFailure(view.fields, view.tabs, issuesByField);
        if (nextTab !== undefined) setActiveTab(nextTab);
      }, [issuesByField, view]);
    `;
    const deps = tabSwitchEffectDeps(bad, "fixture");
    expect(deps).toContain("issuesByField");
  });

  it("throws when no tabToOpenOnFailure call is present, rather than reading a removed call as a pass", () => {
    expect(() => tabSwitchEffectDeps("export function X() { return null; }", "fixture")).toThrow();
  });
});
