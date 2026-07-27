import { describe, expect, it } from "bun:test";
import { initialSaveState, applySaveResult, applyReload } from "../src/screens/draftSaveLogic.js";

describe("draft save/conflict state machine", () => {
  it("starts idle with the loaded revision and layout, no conflict", () => {
    expect(initialSaveState(0, {})).toEqual({ revision: 0, layout: {}, conflict: false });
  });

  it("a successful save adopts the returned revision and layout", () => {
    const state = initialSaveState(0, {});
    const next = applySaveResult(state, { revision: 1, layout: { step_a: { x: 1, y: 1 } } });
    expect(next).toEqual({ revision: 1, layout: { step_a: { x: 1, y: 1 } }, conflict: false });
  });

  it("a 409 (undefined result) enters conflict without touching revision or layout", () => {
    const state = initialSaveState(3, { step_a: { x: 5, y: 5 } });
    const next = applySaveResult(state, undefined);
    expect(next).toEqual({ revision: 3, layout: { step_a: { x: 5, y: 5 } }, conflict: true });
  });

  it("reloading after a conflict adopts the stored revision/layout and clears the conflict", () => {
    const conflicted = applySaveResult(initialSaveState(3, {}), undefined);
    const reloaded = applyReload({ revision: 4, layout: { step_b: { x: 2, y: 2 } } });
    expect(reloaded).toEqual({ revision: 4, layout: { step_b: { x: 2, y: 2 } }, conflict: false });
    expect(conflicted.conflict).toBe(true); // reload derives a fresh state; it does not mutate the conflicted one
  });

  it("full cycle: save conflicts, reload, then the next save succeeds", () => {
    let state = initialSaveState(0, {});
    state = applySaveResult(state, { revision: 1, layout: {} });
    state = applySaveResult(state, undefined); // a concurrent writer moved the row to revision 2
    expect(state.conflict).toBe(true);

    state = applyReload({ revision: 2, layout: { step_a: { x: 9, y: 9 } } });
    expect(state).toEqual({ revision: 2, layout: { step_a: { x: 9, y: 9 } }, conflict: false });

    state = applySaveResult(state, { revision: 3, layout: { step_a: { x: 9, y: 9 } } });
    expect(state).toEqual({ revision: 3, layout: { step_a: { x: 9, y: 9 } }, conflict: false });
  });
});
