import { describe, expect, it } from "bun:test";
import { initialSaveState, applySaveResult, applyReload } from "../src/areas/studio/screens/draftSaveLogic.js";

describe("draft save/conflict state machine", () => {
  it("starts idle with the loaded revision and layout, no conflict", () => {
    expect(initialSaveState(0, {})).toEqual({ revision: 0, layout: {}, conflict: false });
  });

  it("a successful save adopts the returned revision and layout", () => {
    const state = initialSaveState(0, {});
    const next = applySaveResult(state, { revision: 1, layout: { step_a: { x: 1, y: 1 } } }, state.layout);
    expect(next).toEqual({ revision: 1, layout: { step_a: { x: 1, y: 1 } }, conflict: false });
  });

  it("a successful save after a layout edit keeps the current layout and adopts the revision", () => {
    const sent = { step_a: { x: 1, y: 1 } };
    const sentState = initialSaveState(0, sent);
    // A drag during the request builds a new layout object.
    const current = { ...sentState, layout: { ...sent, step_a: { x: 7, y: 7 } } };
    const next = applySaveResult(current, { revision: 1, layout: sent }, sent);
    expect(next).toEqual({ revision: 1, layout: { step_a: { x: 7, y: 7 } }, conflict: false });
    expect(next.layout).toBe(current.layout);
  });

  it("a successful save adopts the answer's layout when no layout edit ran during the request", () => {
    const sent = { step_a: { x: 1, y: 1 } };
    const current = initialSaveState(0, sent);
    // The server answers with the same values in another key order.
    const answer = { step_a: { y: 1, x: 1 } };
    const next = applySaveResult(current, { revision: 1, layout: answer }, sent);
    expect(next.layout).toBe(answer);
    expect(next.revision).toBe(1);
  });

  it("a 409 (undefined result) enters conflict without touching revision or layout", () => {
    const state = initialSaveState(3, { step_a: { x: 5, y: 5 } });
    const next = applySaveResult(state, undefined, state.layout);
    expect(next).toEqual({ revision: 3, layout: { step_a: { x: 5, y: 5 } }, conflict: true });
  });

  it("a 409 after a layout edit keeps the current layout and sets the conflict", () => {
    const sent = { step_a: { x: 5, y: 5 } };
    const current = { revision: 3, layout: { step_a: { x: 8, y: 8 } }, conflict: false };
    const next = applySaveResult(current, undefined, sent);
    expect(next).toEqual({ revision: 3, layout: { step_a: { x: 8, y: 8 } }, conflict: true });
    expect(next.layout).toBe(current.layout);
  });

  it("reloading after a conflict adopts the stored revision/layout and clears the conflict", () => {
    const start = initialSaveState(3, {});
    const conflicted = applySaveResult(start, undefined, start.layout);
    const reloaded = applyReload({ revision: 4, layout: { step_b: { x: 2, y: 2 } } });
    expect(reloaded).toEqual({ revision: 4, layout: { step_b: { x: 2, y: 2 } }, conflict: false });
    expect(conflicted.conflict).toBe(true); // reload derives a fresh state; it does not mutate the conflicted one
  });

  it("full cycle: save conflicts, reload, then the next save succeeds", () => {
    let state = initialSaveState(0, {});
    state = applySaveResult(state, { revision: 1, layout: {} }, state.layout);
    state = applySaveResult(state, undefined, state.layout); // a concurrent writer moved the row to revision 2
    expect(state.conflict).toBe(true);

    state = applyReload({ revision: 2, layout: { step_a: { x: 9, y: 9 } } });
    expect(state).toEqual({ revision: 2, layout: { step_a: { x: 9, y: 9 } }, conflict: false });

    state = applySaveResult(state, { revision: 3, layout: { step_a: { x: 9, y: 9 } } }, state.layout);
    expect(state).toEqual({ revision: 3, layout: { step_a: { x: 9, y: 9 } }, conflict: false });
  });
});
