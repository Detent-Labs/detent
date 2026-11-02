import { describe, expect, it } from "bun:test";
import { StudioClientError } from "../src/areas/studio/api/client.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import {
  afterRunningSave,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_RETRY_MS,
  autosaveWait,
  classifySaveFailure,
  flushAnswer,
  keptPointName,
  landedEntry,
  nextDirtySince,
  nextFailure,
  nextUnconfirmed,
  savePointFailure,
  selectionAfterRestore,
  unmountPlan,
  type AutosaveInput,
  type SentPair,
} from "../src/areas/studio/screens/draftAutosaveLogic.js";
import { applySaveResult, initialSaveState } from "../src/areas/studio/screens/draftSaveLogic.js";
import { isDraftDirty } from "../src/areas/studio/screens/draftToolbarState.js";

/** The autosave's decisions (`studio-app`: "A draft saves itself after each change", "A failed save retries where an answer may heal"). */

const idle: AutosaveInput = {
  dirty: true,
  saving: false,
  conflict: false,
  held: false,
  flushAsked: false,
  failure: undefined,
  changedSinceFailure: false,
  dirtyFor: 0,
};
const wait = (over: Partial<AutosaveInput>) => autosaveWait({ ...idle, ...over });
const retryable = { retryable: true, tries: 1 };
const refused = { retryable: false, tries: 1 };

const pair = (name: string, layout: Record<string, unknown> = {}): SentPair => ({ draft: { key: name } as Draft, layout });
const httpError = (status: number) => new StudioClientError({ type: "internal" } as never, status);
const networkError = () => new StudioClientError({ type: "network", message: "dropped" });

describe("the constants", () => {
  it("state the debounce, the maximum and the backoff", () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(1200);
    expect(AUTOSAVE_MAX_WAIT_MS).toBe(10000);
    expect([...AUTOSAVE_RETRY_MS]).toEqual([5000, 15000, 30000, 60000]);
  });
});

describe("autosaveWait answers in order", () => {
  it("1: a clean draft, a running save or a conflict arms nothing, a flush and a failure included", () => {
    for (const over of [{ dirty: false }, { saving: true }, { conflict: true }]) {
      expect(wait(over)).toBeUndefined();
      expect(wait({ ...over, flushAsked: true })).toBeUndefined();
      expect(wait({ ...over, failure: retryable })).toBeUndefined();
    }
  });

  it("2: a failure with no later change takes the backoff, and outranks a flush", () => {
    expect(wait({ failure: retryable })).toBe(5000);
    expect(wait({ failure: retryable, flushAsked: true })).toBe(5000);
    expect(wait({ failure: refused, flushAsked: true })).toBeUndefined();
  });

  it("2: a held or a refused failure waits", () => {
    expect(wait({ failure: retryable, held: true })).toBeUndefined();
    expect(wait({ failure: refused })).toBeUndefined();
  });

  it("3: a flush answers 0 and ignores held", () => {
    expect(wait({ flushAsked: true })).toBe(0);
    expect(wait({ flushAsked: true, held: true })).toBe(0);
    expect(wait({ flushAsked: true, failure: refused, changedSinceFailure: true })).toBe(0);
  });

  it("4: held arms nothing", () => {
    expect(wait({ held: true })).toBeUndefined();
    expect(wait({ held: true, failure: retryable, changedSinceFailure: true })).toBeUndefined();
  });

  it("5: otherwise the debounce, and a later change takes it over a failure", () => {
    expect(wait({})).toBe(1200);
    expect(wait({ failure: retryable, changedSinceFailure: true })).toBe(1200);
    expect(wait({ failure: refused, changedSinceFailure: true })).toBe(1200);
  });
});

describe("the maximum wait", () => {
  it("caps the debounce as the run nears 10 seconds", () => {
    expect(wait({ dirtyFor: 8000 })).toBe(1200);
    expect(wait({ dirtyFor: 9500 })).toBe(500);
  });

  it("answers 0 past the maximum, and never a negative wait", () => {
    expect(wait({ dirtyFor: 10000 })).toBe(0);
    expect(wait({ dirtyFor: 25000 })).toBe(0);
  });
});

describe("the backoff", () => {
  it("runs 5, 15, 30, then 60 seconds for good", () => {
    const answers = [1, 2, 3, 4, 5, 40].map((tries) => wait({ failure: { retryable: true, tries } }));
    expect(answers).toEqual([5000, 15000, 30000, 60000, 60000, 60000]);
  });
});

describe("nextDirtySince", () => {
  it("a send, the saving commit, an answer, a pause and one key give the debounce wait", () => {
    // The request left at 20 000, and the hook cleared the run.
    let since: number | undefined;
    const commit = (dirty: boolean, changed: boolean, now: number) => {
      since = nextDirtySince(since, { dirty, changed, now });
      return dirtyWait(dirty, now);
    };
    const dirtyWait = (dirty: boolean, now: number) => wait({ dirty, dirtyFor: since === undefined ? 0 : now - since });

    expect(commit(true, false, 20_000)).toBe(1200); // the saving commit, still identical to the sent pair
    expect(since).toBeUndefined();
    expect(commit(false, true, 20_400)).toBeUndefined(); // the answer leaves the draft clean
    expect(since).toBeUndefined();
    expect(commit(true, true, 45_000)).toBe(1200); // one key after a long pause
    expect(since).toBe(45_000);
  });

  it("holds the first change through a typing run, so the maximum can fire", () => {
    let since = nextDirtySince(undefined, { dirty: true, changed: true, now: 1000 });
    since = nextDirtySince(since, { dirty: true, changed: true, now: 9000 });
    expect(since).toBe(1000);
    expect(wait({ dirtyFor: 10_500 - (since ?? 0) })).toBe(500);
  });

  it("clears on a clean draft", () => {
    expect(nextDirtySince(1000, { dirty: false, changed: true, now: 2000 })).toBeUndefined();
  });

  it("stays clear while the draft still is the sent pair", () => {
    expect(nextDirtySince(undefined, { dirty: true, changed: false, now: 2000 })).toBeUndefined();
  });
});

describe("classifySaveFailure", () => {
  it("a network failure is retryable and may hide a commit", () => {
    expect(classifySaveFailure(networkError())).toEqual({ retryable: true, lost: true });
  });

  it("a raw value counts as a network failure, as a timeout during the body read arrives", () => {
    expect(classifySaveFailure(new DOMException("timed out", "TimeoutError"))).toEqual({ retryable: true, lost: true });
    expect(classifySaveFailure("anything")).toEqual({ retryable: true, lost: true });
  });

  it("a 5xx is retryable and answered", () => {
    expect(classifySaveFailure(httpError(500))).toEqual({ retryable: true, lost: false });
    expect(classifySaveFailure(httpError(503))).toEqual({ retryable: true, lost: false });
  });

  it("any other 4xx waits", () => {
    expect(classifySaveFailure(httpError(400))).toEqual({ retryable: false, lost: false });
    expect(classifySaveFailure(httpError(403))).toEqual({ retryable: false, lost: false });
  });
});

describe("nextFailure", () => {
  it("counts up on a repeat of the same pair", () => {
    const sent = pair("a");
    const first = nextFailure(undefined, sent, networkError());
    const second = nextFailure(first, { ...sent }, networkError());
    expect(first.tries).toBe(1);
    expect(second.tries).toBe(2);
    expect(second.draft).toBe(sent.draft);
  });

  it("starts over on a later change", () => {
    const first = nextFailure(undefined, pair("a"), networkError());
    expect(nextFailure(first, pair("b"), networkError()).tries).toBe(1);
  });

  it("holds the caught text for the Developer view and the retryable flag", () => {
    const failure = nextFailure(undefined, pair("a"), httpError(400));
    expect(failure.retryable).toBe(false);
    expect(failure.detail.length).toBeGreaterThan(0);
  });
});

describe("the lost-answer rule", () => {
  const stored = (entry: SentPair, revision = 8) => ({ body: entry.draft, layout: entry.layout, revision });

  it("equal content lands the entry, in another key order too", () => {
    const entry: SentPair = { draft: { key: "a", label: { en: "A" } } as Draft, layout: { x: 1, y: 2 } };
    const reordered = { body: { label: { en: "A" }, key: "a" }, layout: { y: 2, x: 1 } };
    expect(landedEntry([entry], reordered)).toBe(entry);
  });

  it("differing content lands nothing, so the 409 is a real conflict", () => {
    expect(landedEntry([pair("a")], stored(pair("somebody else")))).toBeUndefined();
    expect(landedEntry([pair("a", { x: 1 })], stored(pair("a", { x: 2 })))).toBeUndefined();
    expect(landedEntry([], stored(pair("a")))).toBeUndefined();
  });

  it("a change made since stays dirty and saves next", () => {
    const lost = pair("a", { x: 1 });
    const newer = pair("b", { x: 1 });
    const record = stored(lost);
    expect(landedEntry([lost], record)).toBe(lost);

    // The newer send answered 409, and the landed pair is what the server holds.
    const state = applySaveResult({ ...initialSaveState(7, newer.layout) }, { revision: record.revision, layout: record.layout }, newer.layout);
    expect(state.revision).toBe(8);
    expect(state.conflict).toBe(false);
    expect(isDraftDirty(newer.draft, lost.draft, state.layout, record.layout)).toBe(true);
    expect(autosaveWait({ ...idle, dirty: true })).toBe(1200);
  });

  it("an equal draft reads clean after the landing, against the entry's own draft", () => {
    const lost: SentPair = { draft: { key: "a", label: { en: "A" } } as Draft, layout: { x: 1 } };
    const record = { body: { label: { en: "A" }, key: "a" }, layout: { x: 1 } };
    const state = applySaveResult(initialSaveState(7, lost.layout), { revision: 8, layout: record.layout }, lost.layout);

    expect(isDraftDirty(lost.draft, lost.draft, state.layout, record.layout)).toBe(false);
    // The record's body in another key order would read dirty, so the entry's stands.
    expect(isDraftDirty(lost.draft, record.body, state.layout, record.layout)).toBe(true);
  });

  it("a flush after a lost answer leaves the list and makes one fresh try", () => {
    const entries = nextUnconfirmed([], pair("a"), "lost");
    // The flush cleared the failure, so the effect answers at once.
    expect(wait({ flushAsked: true, failure: undefined })).toBe(0);
    expect(entries).toHaveLength(1);
    const sameSend = entries[0];
    expect(sameSend && landedEntry(entries, stored(sameSend))).toBe(sameSend);
  });

  it("A lost, then B failed: A still may land, and a later 409 finds it", () => {
    const a = pair("a");
    const b = pair("b");
    const c = pair("c");
    const afterA = nextUnconfirmed([], a, "lost");
    const afterB = nextUnconfirmed(afterA, b, "failed");
    expect(afterB).toEqual([a]);
    expect(landedEntry(afterB, stored(a))).toBe(a);
    expect(nextUnconfirmed(afterB, c, "answered")).toEqual([]);
  });

  it("two lost sends list both, and the stored one is the match", () => {
    const a = pair("a");
    const b = pair("b");
    const entries = nextUnconfirmed(nextUnconfirmed([], a, "lost"), b, "lost");
    expect(entries).toEqual([a, b]);
    expect(landedEntry(entries, stored(b))).toBe(b);
  });
});

describe("flushAnswer", () => {
  const commit = { dirty: true, saving: false, failed: false, conflict: false, revision: 4 };

  it("settles true on a clean, idle draft with the commit's revision", () => {
    expect(flushAnswer({ ...commit, dirty: false })).toEqual({ saved: true, revision: 4 });
  });

  it("reads not dirty first, so a conflict on a clean draft has nothing to save", () => {
    expect(flushAnswer({ ...commit, dirty: false, conflict: true })).toEqual({ saved: true, revision: 4 });
  });

  it("settles false on a failure or a conflict over a dirty draft", () => {
    expect(flushAnswer({ ...commit, failed: true })).toEqual({ saved: false });
    expect(flushAnswer({ ...commit, conflict: true })).toEqual({ saved: false });
  });

  it("waits while a request runs, whatever else stands", () => {
    for (const over of [{ dirty: false }, { failed: true }, { conflict: true }]) {
      expect(flushAnswer({ ...commit, ...over, saving: true })).toBeUndefined();
    }
  });

  it("waits on a dirty draft with nothing standing: a change made during the wait saves first", () => {
    expect(flushAnswer(commit)).toBeUndefined();
  });
});

describe("unmountPlan", () => {
  const state = { dropped: false, noticeStands: false, running: false, dirty: true, failed: false, conflict: false };

  it("a dirty unmount sends one last save", () => {
    expect(unmountPlan(state)).toBe("save");
  });

  it("a running request chains, on a draft that reads clean too", () => {
    expect(unmountPlan({ ...state, running: true })).toBe("chain");
    expect(unmountPlan({ ...state, running: true, dirty: false })).toBe("chain");
    expect(unmountPlan({ ...state, running: true, failed: true })).toBe("chain");
  });

  it("a standing failure or conflict keeps a copy", () => {
    expect(unmountPlan({ ...state, failed: true })).toBe("keepCopy");
    expect(unmountPlan({ ...state, conflict: true })).toBe("keepCopy");
  });

  it("skips a clean draft, a clean conflict, a dropped draft and a standing notice", () => {
    expect(unmountPlan({ ...state, dirty: false })).toBe("nothing");
    expect(unmountPlan({ ...state, dirty: false, conflict: true })).toBe("nothing");
    expect(unmountPlan({ ...state, dropped: true })).toBe("nothing");
    expect(unmountPlan({ ...state, dropped: true, running: true })).toBe("nothing");
    expect(unmountPlan({ ...state, noticeStands: true })).toBe("nothing");
    expect(unmountPlan({ ...state, noticeStands: true, failed: true })).toBe("nothing");
  });
});

describe("afterRunningSave", () => {
  const sent = pair("a", { x: 1 });

  it("sends only when the latest draft differs from what the request sent", () => {
    expect(afterRunningSave({ saved: true, revision: 3, ...sent }, sent)).toBe("nothing");
    expect(afterRunningSave({ saved: true, revision: 3, ...sent }, pair("b", { x: 1 }))).toBe("save");
    expect(afterRunningSave({ saved: true, revision: 3, ...sent }, pair("a", { x: 2 }))).toBe("save");
  });

  it("reads a layout in another key order as the same layout", () => {
    const answer = { saved: true as const, revision: 3, draft: sent.draft, layout: { a: 1, b: 2 } };
    expect(afterRunningSave(answer, { draft: sent.draft, layout: { b: 2, a: 1 } })).toBe("nothing");
  });

  it("a request that failed keeps a copy", () => {
    expect(afterRunningSave({ saved: false }, sent)).toBe("keepCopy");
  });
});

describe("savePointFailure lands each row of D10's table", () => {
  it("a 409 raises the conflict, on each act", () => {
    for (const act of ["create", "restore", "remove"] as const) {
      expect(savePointFailure(act, httpError(409)).kind).toBe("conflict");
    }
  });

  it("a 404 on a restore or a remove refetches", () => {
    expect(savePointFailure("restore", httpError(404))).toEqual({ kind: "gone" });
    expect(savePointFailure("remove", httpError(404))).toEqual({ kind: "gone" });
  });

  it("a refused create prints at the input, a 404 included", () => {
    expect(savePointFailure("create", httpError(404)).kind).toBe("refused");
    expect(savePointFailure("create", httpError(500)).kind).toBe("refused");
  });

  it("another refused restore or remove stays in its dialog, with a sentence", () => {
    for (const act of ["restore", "remove"] as const) {
      const outcome = savePointFailure(act, httpError(500));
      expect(outcome.kind).toBe("refused");
      expect(outcome.kind === "refused" && outcome.message.length > 0).toBe(true);
      expect(savePointFailure(act, networkError()).kind).toBe("refused");
    }
  });
});

describe("keptPointName", () => {
  it("embeds a short name whole", () => {
    expect(keptPointName("Before the review step")).toBe("Before restoring “Before the review step”");
  });

  it("clips a 200-character name to 120 with an ellipsis, so the name holds 139 at most", () => {
    const name = keptPointName("x".repeat(200));
    expect(name).toBe(`Before restoring “${"x".repeat(119)}…”`);
    expect(name.length).toBe(139);
  });

  it("embeds a name of exactly 120 whole", () => {
    expect(keptPointName("y".repeat(120))).toBe(`Before restoring “${"y".repeat(120)}”`);
  });

  it("stays at 139 and under the engine's bound through five nested rounds", () => {
    let name = "x".repeat(200);
    for (let round = 0; round < 5; round++) {
      name = keptPointName(name);
      expect(name.length).toBeLessThanOrEqual(139);
      expect(name.length).toBeLessThanOrEqual(200);
    }
    expect(name.startsWith("Before restoring “Before restoring “")).toBe(true);
  });

  it("does not split a surrogate pair at the clip", () => {
    const name = keptPointName(`${"x".repeat(118)}😀${"x".repeat(50)}`);
    expect(name).toBe(`Before restoring “${"x".repeat(118)}…”`);
  });

  it("reads a dollar sign in a name literally", () => {
    expect(keptPointName("$& up")).toBe("Before restoring “$& up”");
  });
});

describe("selectionAfterRestore", () => {
  it("keeps only the steps the restored body holds, in the selection's order", () => {
    const body = { workflow: { steps: [{ id: "step_a" }, { id: "step_c" }] } };
    expect(selectionAfterRestore(["step_c", "step_b", "step_a"], body)).toEqual(["step_c", "step_a"]);
  });

  it("empties on a body with no steps", () => {
    expect(selectionAfterRestore(["step_a"], {})).toEqual([]);
  });
});
