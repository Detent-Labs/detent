import { createContext, useContext, useMemo, useReducer, useState, type ReactNode } from "react";
import type { ProcessBody } from "workflow-engine/schema";
import type { Draft } from "./types";
import { runValidation, type ValidationResult } from "./validation";
import { collectUsedLocales } from "./localized-text";

const EMPTY_DRAFT: Draft = {};

export type Mutate = (recipe: (draft: Draft) => void) => void;

interface DraftContextValue {
  draft: Draft;
  mutate: Mutate;
  replace: (next: Draft) => void;
  validation: ValidationResult;
  loadedChildren: Record<string, ProcessBody>;
  setChildForStep: (stepId: string, childBody: ProcessBody | undefined) => void;
  /** Which locale of the *authored process content* (label/description
   * text) is currently shown/edited — independent of the app's own
   * fixed-English UI-chrome text. Ephemeral editor
   * state, not persisted with the Draft. */
  contentLocale: string;
  setContentLocale: (locale: string) => void;
  usedLocales: string[];
  /** Increments only on `replace` (Load/Import), never on `mutate` — the
   * signal `GraphView` uses to re-fit after a load, since a reload of an
   * unchanged process doesn't otherwise produce any other observable state
   * change (see editor-graph-edge-routing design.md). */
  loadGeneration: number;
}

const DraftContext = createContext<DraftContextValue | null>(null);

type Action = { kind: "mutate"; recipe: (draft: Draft) => void } | { kind: "replace"; next: Draft };

interface ReducerState {
  draft: Draft;
  loadGeneration: number;
}

function reducer(state: ReducerState, action: Action): ReducerState {
  switch (action.kind) {
    case "mutate": {
      // ponytail: structuredClone copies the whole draft on every mutate,
      // where produce() shared every subtree the recipe left alone. A
      // component keyed on an untouched subtree now re-renders on every
      // keystroke. Restore produce()/immer if canvas render cost rises
      // measurably.
      const next = structuredClone(state.draft);
      action.recipe(next);
      return { ...state, draft: next };
    }
    case "replace":
      return { draft: action.next, loadGeneration: state.loadGeneration + 1 };
  }
}

export function DraftProvider({ children, initial }: { children: ReactNode; initial?: Draft }) {
  const [{ draft, loadGeneration }, dispatch] = useReducer(reducer, { draft: initial ?? EMPTY_DRAFT, loadGeneration: 0 });
  const [loadedChildren, setLoadedChildren] = useState<Record<string, ProcessBody>>({});
  // Seeded from the initially-loaded Draft's own baseLocale (falling back to
  // "en" for a brand-new Draft) rather than a hardcoded "en" — opening an
  // already-authored process should default to editing in its own base
  // locale, not one that may not even exist in it yet.
  const [contentLocale, setContentLocale] = useState<string>(() => initial?.baseLocale ?? "en");

  const usedLocales = useMemo(() => collectUsedLocales(draft), [draft]);

  // A plain, synchronous recompute on every Draft/children change — no
  // setTimeout debounce. Validating a document this size (dozens of entities,
  // not thousands) runs in low single-digit milliseconds, well under a frame;
  // debouncing would trade correctness (a stale result briefly shown) for a
  // performance problem that doesn't exist yet at this scale.
  const validation = useMemo(() => runValidation(draft, undefined, loadedChildren), [draft, loadedChildren]);

  const setChildForStep = (stepId: string, childBody: ProcessBody | undefined) => {
    setLoadedChildren((prev) => {
      if (childBody === undefined) {
        const { [stepId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [stepId]: childBody };
    });
  };

  const value = useMemo<DraftContextValue>(
    () => ({
      draft,
      mutate: (recipe) => dispatch({ kind: "mutate", recipe }),
      replace: (next) => dispatch({ kind: "replace", next }),
      validation,
      loadedChildren,
      setChildForStep,
      contentLocale,
      setContentLocale,
      usedLocales,
      loadGeneration,
    }),
    [draft, validation, loadedChildren, contentLocale, usedLocales, loadGeneration],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

/**
 * The one way any panel is allowed to change the Draft (task 3.8): every
 * mutation goes through this hook's `mutate`, never through independent
 * component state that happens to shadow part of the Draft. Also the one
 * place `validation` is read from, so every panel sees the same issue list:
 * panels and the canvas read off one validation pass, not independently
 * derived ones.
 */
export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within a DraftProvider");
  return ctx;
}
