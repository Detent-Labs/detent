import { describe, expect, it } from "bun:test";
import type { ProcessBody } from "workflow-engine/schema";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { resolveChainingTargets, syncLoadedTargets } from "../src/areas/studio/draft/chainingFetch.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * Tasks 6.22/6.22a. `DraftProvider`'s own chaining-fetch effect
 * (`draft/store.tsx`) has no automated coverage of its own: this repo ships
 * no DOM test library (no jsdom/happy-dom/testing-library — confirmed via
 * `packages/web/package.json` and every other "render" test here, which
 * uses `react-dom/server`'s `renderToStaticMarkup`, which never fires a
 * `useEffect`), and `DraftProvider`'s dedup guard is exactly an effect. Per
 * `studio-draftToolbarState.test.ts`'s own stated convention ("use
 * renderToStaticMarkup, which never fires an event... test the extracted
 * logic instead"), the fetch-dedup logic that the effect calls lives in
 * `draft/chainingFetch.ts` as plain, exported functions with no React
 * dependency — `resolveChainingTargets` takes injected `listProcesses`/
 * `getVersionBody` fakes directly, so this file exercises the real dedup
 * guard with no rendering at all, rather than fighting effect timing with a
 * new, repo-wide DOM dependency for one test file.
 */

function targetBody(fieldIds: string[]): ProcessBody {
  return {
    key: "target",
    label: { en: "Target" },
    baseLocale: "en",
    fields: fieldIds.map((id) => ({ id, key: id, label: { en: id }, type: "string" })),
    workflow: { initialStep: "step_t", steps: [{ id: "step_t", key: "t", label: { en: "T" }, type: "task", terminal: true }] },
  } as unknown as ProcessBody;
}

describe("chaining-target fetch dedup (task 6.22)", () => {
  it("fires exactly one listProcesses+getVersionBody pair for two sites sharing a processId, and none again on an unrelated re-run", async () => {
    const sites = [
      { id: "action_a" as never, processId: "proc_shared" },
      { id: "action_b" as never, processId: "proc_shared" },
    ];
    const fetchState = new Map<string, "pending" | "done">();
    const bodyCache = new Map<string, ProcessBody>();
    let listProcessesCalls = 0;
    let getVersionBodyCalls = 0;
    const io = {
      listProcesses: async (_token: string) => {
        listProcessesCalls++;
        return [{ processId: "proc_shared", version: 3 }];
      },
      getVersionBody: async (_processId: string, _version: number, _token: string) => {
        getVersionBodyCalls++;
        return targetBody(["field_x"]);
      },
    };

    let settledCount = 0;
    resolveChainingTargets(sites, "token", fetchState, bodyCache, io, () => {
      settledCount++;
    });

    // Let the queued microtasks (the async IIFE inside resolveChainingTargets) run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(listProcessesCalls).toBe(1);
    expect(getVersionBodyCalls).toBe(1);
    expect(settledCount).toBe(1);
    expect(fetchState.get("proc_shared")).toBe("done");
    expect(bodyCache.has("proc_shared")).toBe(true);

    // Dispatching an edit to an unrelated field re-runs the effect (the
    // caller re-derives `sites` from the current draft and calls this
    // function again), but the processId is already "done" — no new fetch.
    resolveChainingTargets(sites, "token", fetchState, bodyCache, io, () => {
      settledCount++;
    });
    await Promise.resolve();

    expect(listProcessesCalls).toBe(1);
    expect(getVersionBodyCalls).toBe(1);
  });

  it("syncLoadedTargets writes the shared body under both sites' own action ids", async () => {
    const sites = [
      { id: "action_a" as never, processId: "proc_shared" },
      { id: "action_b" as never, processId: "proc_shared" },
    ];
    const fetchState = new Map<string, "pending" | "done">();
    const bodyCache = new Map<string, ProcessBody>();
    const io = {
      listProcesses: async () => [{ processId: "proc_shared", version: 1 }],
      getVersionBody: async () => targetBody(["field_x"]),
    };
    resolveChainingTargets(sites, "token", fetchState, bodyCache, io, () => {});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const targets = syncLoadedTargets(sites, bodyCache);
    expect(targets["action_a" as never]).toBeDefined();
    expect(targets["action_b" as never]).toBeDefined();
    expect(targets["action_a" as never]).toBe(targets["action_b" as never]);
  });
});

// Task 6.22a: a draft with two process.start sites, A (earlier position) and
// B (later). A's own target catalog does NOT declare "field_y"; B's own
// target catalog does. Both are already resolved into `loadedChainingTargets`
// (id-keyed) before the edit. Deleting A shifts B's `collect()` loc from
// index 1 down to index 0 — the exact array-index collision
// design.md's "loadedChainingTargets and chainingSiteStatus key by the
// action's own id, not by site loc" decision names.
function draftWithSites(actionIds: string[]): Draft {
  return {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          terminal: true,
          onEntry: actionIds.map((id) => ({
            id,
            type: "process.start",
            config: { processId: id === "action_a" ? "proc_a" : "proc_b", inputMapping: { field_y: { lang: "cel", src: "data.amount" } } },
          })),
        },
      ],
    },
  } as unknown as Draft;
}

describe("chainingSiteStatus/loadedChainingTargets key by action id across a reorder (task 6.22a)", () => {
  it("still validates B against B's own target after A is deleted and B's loc shifts", () => {
    const targetA = targetBody(["field_x"]); // does not declare field_y
    const targetB = targetBody(["field_x", "field_y"]); // declares field_y
    const loadedChainingTargets = { action_a: targetA, action_b: targetB } as unknown as Record<never, ProcessBody>;

    // Before the edit: both sites present, A at index 0, B at index 1.
    const before = runValidation(draftWithSites(["action_a", "action_b"]), undefined, {}, loadedChainingTargets);
    expect(before.chainingSiteStatus["action_a" as never]).toBe("checked");
    expect(before.chainingSiteStatus["action_b" as never]).toBe("checked");
    // B's inputMapping.field_y resolves against target B — no CEL issue for B.
    expect(before.issues.some((i) => i.source === "cel" && i.entityId === "action_b")).toBe(false);
    // A's inputMapping.field_y does NOT resolve against target A — a real issue.
    expect(before.issues.some((i) => i.source === "cel" && i.entityId === "action_a")).toBe(true);

    // After the edit: A deleted. B now sits at the array index A held
    // before (collect()'s loc for B shifts from steps[0].onEntry[1] to
    // steps[0].onEntry[0]). loadedChainingTargets is unchanged — still
    // id-keyed, so it still carries A's stale entry, which no site
    // references anymore.
    const after = runValidation(draftWithSites(["action_b"]), undefined, {}, loadedChainingTargets);
    expect(after.chainingSiteStatus["action_b" as never]).toBe("checked");
    // B must still validate against its own target (B), never against A's
    // now-shifted-into loc — so still no CEL issue for B's site.
    expect(after.issues.some((i) => i.source === "cel" && i.entityId === "action_b")).toBe(false);
  });
});
