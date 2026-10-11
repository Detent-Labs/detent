import { describe, expect, it } from "bun:test";
import { clearStash, readRestorable, stashDraft, type DraftStash } from "../src/areas/studio/draft/draftStash.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** An in-memory `sessionStorage` stand-in. `keys()` lets a test see what a
 * call left behind. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    keys: () => [...map.keys()],
    raw: map,
  };
}

/** A storage whose every method throws, as a blocked or full one does. */
const throwing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("quota");
  },
  removeItem: (): void => {
    throw new Error("blocked");
  },
};

const loadedBody = { id: "proc_a", key: "a", label: { en: "A" } } as unknown as Draft;
const loadedLayout: Record<string, unknown> = { step_1: { x: 0, y: 0 }, canvasEdgeStyle: "step" };
const loaded = { body: loadedBody, layout: loadedLayout };

const changed: DraftStash = {
  body: { id: "proc_a", key: "a", label: { en: "A, edited" } } as unknown as Draft,
  layout: loadedLayout,
  revision: 4,
};

describe("draftStash", () => {
  it("round-trips a stash for the same actor and process", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toEqual(changed);
  });

  it("gives a second actor nothing", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    expect(readRestorable(storage, "act_2", "proc_a", loaded)).toBeUndefined();
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toEqual(changed);
  });

  it("keeps two processes apart", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    expect(readRestorable(storage, "act_1", "proc_b", loaded)).toBeUndefined();
  });

  it("keeps an actor id and a process id apart when one could run into the other", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act:1", "proc", changed);
    expect(readRestorable(storage, "act", "1:proc", loaded)).toBeUndefined();
  });

  it("returns nothing for a value that is not JSON, and clears it", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    const [key] = storage.keys();
    storage.raw.set(key!, "{not json");
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toBeUndefined();
    expect(storage.keys()).toEqual([]);
  });

  it("returns nothing for a value of the wrong shape", () => {
    const shapes: unknown[] = [
      null,
      42,
      "text",
      [],
      { layout: {}, revision: 1 },
      { body: null, layout: {}, revision: 1 },
      { body: "x", layout: {}, revision: 1 },
      { body: {}, revision: 1 },
      { body: {}, layout: null, revision: 1 },
      { body: {}, layout: "x", revision: 1 },
      { body: {}, layout: {} },
      { body: {}, layout: {}, revision: "1" },
    ];
    for (const shape of shapes) {
      const storage = fakeStorage();
      stashDraft(storage, "act_1", "proc_a", changed);
      const [key] = storage.keys();
      storage.raw.set(key!, JSON.stringify(shape));
      expect(readRestorable(storage, "act_1", "proc_a", loaded), JSON.stringify(shape)).toBeUndefined();
      expect(storage.keys(), JSON.stringify(shape)).toEqual([]);
    }
  });

  it("returns nothing for a revision that is not a finite number", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    const [key] = storage.keys();
    // JSON has no Infinity; a hand-written exponent overflows to it on parse.
    storage.raw.set(key!, `{"body":{},"layout":{},"revision":1e999}`);
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toBeUndefined();
  });

  it("never throws from a storage that throws", () => {
    expect(() => stashDraft(throwing, "act_1", "proc_a", changed)).not.toThrow();
    expect(() => clearStash(throwing, "act_1", "proc_a")).not.toThrow();
    expect(readRestorable(throwing, "act_1", "proc_a", loaded)).toBeUndefined();
  });

  it("does nothing without a storage", () => {
    expect(() => stashDraft(undefined, "act_1", "proc_a", changed)).not.toThrow();
    expect(() => clearStash(undefined, "act_1", "proc_a")).not.toThrow();
    expect(readRestorable(undefined, "act_1", "proc_a", loaded)).toBeUndefined();
  });

  it("clears a stash equal to the loaded record and returns nothing", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", { body: loadedBody, layout: loadedLayout, revision: 4 });
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toBeUndefined();
    expect(storage.keys()).toEqual([]);
  });

  it("treats the same layout in another key order as equal", () => {
    const storage = fakeStorage();
    const reordered = { canvasEdgeStyle: "step", step_1: { y: 0, x: 0 } };
    stashDraft(storage, "act_1", "proc_a", { body: loadedBody, layout: reordered, revision: 4 });
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toBeUndefined();
    expect(storage.keys()).toEqual([]);
  });

  it("returns a stash whose body differs", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toEqual(changed);
    expect(storage.keys()).toHaveLength(1);
  });

  it("returns a stash whose layout alone differs", () => {
    const storage = fakeStorage();
    const moved: DraftStash = { body: loadedBody, layout: { ...loadedLayout, step_1: { x: 40, y: 0 } }, revision: 4 };
    stashDraft(storage, "act_1", "proc_a", moved);
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toEqual(moved);
  });

  it("clearStash removes the stash", () => {
    const storage = fakeStorage();
    stashDraft(storage, "act_1", "proc_a", changed);
    clearStash(storage, "act_1", "proc_a");
    expect(storage.keys()).toEqual([]);
    expect(readRestorable(storage, "act_1", "proc_a", loaded)).toBeUndefined();
  });
});
