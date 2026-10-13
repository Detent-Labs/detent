import { useContext, useRef, type ReactNode } from "react";
import { DraftContext } from "./store";

/**
 * What a tab body draws: the live `value` while `visible`, otherwise `held`,
 * the last value it drew while visible (`studio-app`: "A hidden tab body that
 * derives from the whole draft shows its last visible draft").
 */
export function holdWhileHidden<T>(held: T, value: T, visible: boolean): T {
  return visible ? value : held;
}

/**
 * Returns `value` while `visible`, and the last value seen while visible
 * otherwise. A body that mounts hidden holds its first value. The hook reads
 * `visible` during render, so the commit that reveals a body draws the live
 * value. A held value keeps its identity, so a `memo` consumer skips every
 * render while its tab stays hidden.
 */
export function useHeldWhileHidden<T>(value: T, visible: boolean): T {
  const held = useRef(value);
  const shown = holdWhileHidden(held.current, value, visible);
  held.current = shown;
  return shown;
}

/**
 * Provides its subtree the draft context as it stood when `visible` was last
 * true. Every `useDraft()` below it reads the held value, so a hidden tab
 * body re-renders on no keystroke. Mutations still reach the live store: the
 * held value's `mutate` and `replace` dispatch to the same reducer.
 */
export function HeldDraft({ visible, children }: { visible: boolean; children: ReactNode }) {
  const live = useContext(DraftContext);
  const held = useHeldWhileHidden(live, visible);
  return <DraftContext.Provider value={held}>{children}</DraftContext.Provider>;
}
