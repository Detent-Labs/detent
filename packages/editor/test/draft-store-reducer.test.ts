import { describe, expect, it } from "bun:test";
import { reducer, type ReducerState } from "../src/draft/store";
import type { Draft } from "../src/draft/types";

describe("DraftProvider's reducer", () => {
  it("increments loadGeneration on replace", () => {
    const state: ReducerState = { draft: { baseLocale: "en" }, loadGeneration: 0 };
    const next: Draft = { baseLocale: "de" };
    const result = reducer(state, { kind: "replace", next });
    expect(result.draft).toEqual(next);
    expect(result.loadGeneration).toBe(1);
  });

  it("does not increment loadGeneration on mutate", () => {
    const state: ReducerState = { draft: { baseLocale: "en" }, loadGeneration: 3 };
    const result = reducer(state, {
      kind: "mutate",
      recipe: (draft) => {
        draft.baseLocale = "de";
      },
    });
    expect(result.draft.baseLocale).toBe("de");
    expect(result.loadGeneration).toBe(3);
  });

  it("increments loadGeneration on every successive replace", () => {
    let state: ReducerState = { draft: {}, loadGeneration: 0 };
    state = reducer(state, { kind: "replace", next: { baseLocale: "en" } });
    state = reducer(state, { kind: "replace", next: { baseLocale: "en" } });
    expect(state.loadGeneration).toBe(2);
  });
});
