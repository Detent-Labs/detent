import { createContext, useContext, useMemo, useReducer, useState, type ReactNode } from "react";
import { produce, type Draft as Immer } from "immer";
import type { ProcessBody } from "workflow-engine/schema";
import type { Registry } from "workflow-engine/engine/registry";
import type { Draft } from "./types";
import { runValidation, type ValidationResult } from "./validation";

const EMPTY_DRAFT: Draft = {};

export type Mutate = (recipe: (draft: Immer<Draft>) => void) => void;

interface DraftContextValue {
  draft: Draft;
  mutate: Mutate;
  replace: (next: Draft) => void;
  validation: ValidationResult;
  registry: Registry | undefined;
  setRegistry: (registry: Registry | undefined) => void;
  loadedChildren: Record<string, ProcessBody>;
  setChildForStep: (stepId: string, childBody: ProcessBody | undefined) => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

type Action = { kind: "mutate"; recipe: (draft: Immer<Draft>) => void } | { kind: "replace"; next: Draft };

function reducer(state: Draft, action: Action): Draft {
  switch (action.kind) {
    case "mutate":
      return produce(state, action.recipe);
    case "replace":
      return action.next;
  }
}

export function DraftProvider({ children, initial }: { children: ReactNode; initial?: Draft }) {
  const [draft, dispatch] = useReducer(reducer, initial ?? EMPTY_DRAFT);
  const [registry, setRegistry] = useState<Registry | undefined>(undefined);
  const [loadedChildren, setLoadedChildren] = useState<Record<string, ProcessBody>>({});

  // A plain, synchronous recompute on every Draft/registry/children change — no
  // setTimeout debounce. Validating a document this size (dozens of entities,
  // not thousands) runs in low single-digit milliseconds, well under a frame;
  // debouncing would trade correctness (a stale result briefly shown) for a
  // performance problem that doesn't exist yet at this scale.
  const validation = useMemo(() => runValidation(draft, registry, loadedChildren), [draft, registry, loadedChildren]);

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
      registry,
      setRegistry,
      loadedChildren,
      setChildForStep,
    }),
    [draft, validation, registry, loadedChildren],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

/**
 * The one way any panel is allowed to change the Draft (task 3.8): every
 * mutation goes through this hook's `mutate`, never through independent
 * component state that happens to shadow part of the Draft. Also the one
 * place `validation` is read from, so every panel sees the same issue list
 * (editor-live-validation spec: panels and the future graph view read off
 * one validation pass, not independently derived ones).
 */
export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within a DraftProvider");
  return ctx;
}
