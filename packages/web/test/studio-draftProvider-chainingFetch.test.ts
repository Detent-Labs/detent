import { describe, expect, it } from "bun:test";
import type { ProcessBody } from "workflow-engine/schema";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import {
  resolveChainingTargets,
  syncLoadedTargets,
  type ChainingFetchIO,
  type ChainingListing,
} from "../src/areas/studio/draft/chainingFetch.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

// Lets every queued microtask of the fake IO settle: the async IIFE inside
// resolveChainingTargets awaits more than three promises now.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

    const listing: ChainingListing = {};
    let settledCount = 0;
    resolveChainingTargets(sites, "token", fetchState, bodyCache, listing, io, () => {
      settledCount++;
    });

    await flush();

    expect(listProcessesCalls).toBe(1);
    expect(getVersionBodyCalls).toBe(1);
    expect(settledCount).toBe(1);
    expect(fetchState.get("proc_shared")).toBe("done");
    expect(bodyCache.has("proc_shared")).toBe(true);

    // Dispatching an edit to an unrelated field re-runs the effect (the
    // caller re-derives `sites` from the current draft and calls this
    // function again), but the processId is already "done" — no new fetch.
    resolveChainingTargets(sites, "token", fetchState, bodyCache, listing, io, () => {
      settledCount++;
    });
    await flush();

    expect(listProcessesCalls).toBe(1);
    expect(getVersionBodyCalls).toBe(1);
    expect(settledCount).toBe(1);
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
    resolveChainingTargets(sites, "token", fetchState, bodyCache, {}, io, () => {});
    await flush();

    const targets = syncLoadedTargets(sites, bodyCache);
    expect(targets["action_a" as never]).toBeDefined();
    expect(targets["action_b" as never]).toBeDefined();
    expect(targets["action_a" as never]).toBe(targets["action_b" as never]);
  });

  it("a target the list lacks reads not-checked with no error", async () => {
    const sites = [{ id: "action_a" as never, processId: "proc_missing" }];
    const fetchState = new Map<string, "pending" | "done">();
    const bodyCache = new Map<string, ProcessBody>();
    const io = {
      listProcesses: async () => [{ processId: "proc_other", version: 1 }],
      getVersionBody: async () => targetBody([]),
    };
    resolveChainingTargets(sites, "token", fetchState, bodyCache, {}, io, () => {});
    await flush();

    expect(bodyCache.has("proc_missing")).toBe(false);
    expect(syncLoadedTargets(sites, bodyCache)).toEqual({});
  });
});

// Task 5.1: each keystroke in a process.start `processId` field yields a new
// unseen id, so the effect calls `resolveChainingTargets` once per character
// with the same fetchState, listing and bodyCache.
describe("chaining-target fetch shares one process list (task 5.1)", () => {
  const fullId = "proc_credit_check";

  // Fake IO whose first `failList` list reads and first `failBody` body reads
  // reject. The list holds `fullId` only.
  function fakeIO({ failList = 0, failBody = 0 } = {}) {
    const calls = { list: 0, body: [] as string[] };
    const io: ChainingFetchIO = {
      listProcesses: async () => {
        if (++calls.list <= failList) throw new Error("down");
        return [{ processId: fullId, version: 2 }];
      },
      getVersionBody: async (processId) => {
        calls.body.push(processId);
        if (calls.body.length <= failBody) throw new Error("down");
        return targetBody(["field_x"]);
      },
    };
    return { calls, io };
  }

  function typeId(
    id: string,
    state: { fetchState: Map<string, "pending" | "done">; bodyCache: Map<string, ProcessBody>; listing: ChainingListing },
    io: ChainingFetchIO,
    onSettled: () => void,
  ) {
    return Promise.all(
      Array.from({ length: id.length }, (_, i) => id.slice(0, i + 1)).map(async (prefix) => {
        resolveChainingTargets([{ id: "action_a" as never, processId: prefix }], "token", state.fetchState, state.bodyCache, state.listing, io, onSettled);
        await flush();
      }),
    );
  }

  it("17 successive prefixes send one listProcesses and one getVersionBody", async () => {
    const { calls, io } = fakeIO();
    const state = { fetchState: new Map<string, "pending" | "done">(), bodyCache: new Map<string, ProcessBody>(), listing: {} as ChainingListing };
    expect(fullId.length).toBe(17);

    // Sequential, as the effect fires: each call comes after one more character.
    for (let n = 1; n <= fullId.length; n++) {
      resolveChainingTargets([{ id: "action_a" as never, processId: fullId.slice(0, n) }], "token", state.fetchState, state.bodyCache, state.listing, io, () => {});
      await flush();
    }

    expect(calls.list).toBe(1);
    expect(calls.body).toEqual([fullId]);
    expect(state.bodyCache.has(fullId)).toBe(true);
    expect(state.fetchState.get(fullId)).toBe("done");
  });

  it("17 prefixes issued before the list answers still send one listProcesses", async () => {
    const { calls, io } = fakeIO();
    const state = { fetchState: new Map<string, "pending" | "done">(), bodyCache: new Map<string, ProcessBody>(), listing: {} as ChainingListing };
    await typeId(fullId, state, io, () => {});

    expect(calls.list).toBe(1);
    expect(calls.body).toEqual([fullId]);
  });

  it("an id the list lacks sends no body request and is marked done", async () => {
    const { calls, io } = fakeIO();
    const fetchState = new Map<string, "pending" | "done">();
    let settled = 0;
    resolveChainingTargets([{ id: "action_a" as never, processId: "proc_cred" }], "token", fetchState, new Map(), {}, io, () => settled++);
    await flush();

    expect(calls.list).toBe(1);
    expect(calls.body).toEqual([]);
    expect(fetchState.get("proc_cred")).toBe("done");
    expect(settled).toBe(1);
  });

  it("a failed list read clears the holder and the next call reads the list again", async () => {
    const { calls, io } = fakeIO({ failList: 1 });
    const fetchState = new Map<string, "pending" | "done">();
    const bodyCache = new Map<string, ProcessBody>();
    const listing: ChainingListing = {};
    const sites = [{ id: "action_a" as never, processId: fullId }];

    resolveChainingTargets(sites, "token", fetchState, bodyCache, listing, io, () => {});
    await flush();
    expect(listing.current).toBeUndefined();
    expect(fetchState.has(fullId)).toBe(false);
    expect(calls.body).toEqual([]);

    resolveChainingTargets(sites, "token", fetchState, bodyCache, listing, io, () => {});
    await flush();
    expect(calls.list).toBe(2);
    expect(calls.body).toEqual([fullId]);
    expect(fetchState.get(fullId)).toBe("done");
  });

  it("a failed body read leaves the id retryable without a second list read", async () => {
    const { calls, io } = fakeIO({ failBody: 1 });
    const fetchState = new Map<string, "pending" | "done">();
    const bodyCache = new Map<string, ProcessBody>();
    const listing: ChainingListing = {};
    const sites = [{ id: "action_a" as never, processId: fullId }];

    resolveChainingTargets(sites, "token", fetchState, bodyCache, listing, io, () => {});
    await flush();
    expect(fetchState.has(fullId)).toBe(false);
    expect(bodyCache.has(fullId)).toBe(false);

    resolveChainingTargets(sites, "token", fetchState, bodyCache, listing, io, () => {});
    await flush();
    expect(calls.list).toBe(1);
    expect(calls.body).toEqual([fullId, fullId]);
    expect(fetchState.get(fullId)).toBe("done");
    expect(bodyCache.has(fullId)).toBe(true);
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
    // The acting process declares the `amount` its mapping values read, so the
    // only CEL issue a site can raise is the target-membership one under test.
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
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
