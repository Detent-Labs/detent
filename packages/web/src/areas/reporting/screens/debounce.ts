import { useEffect, useState } from "react";

/** The timer a debouncer waits on. Tests inject a fake one. */
export interface DebounceTimer {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimer: DebounceTimer = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface Debouncer {
  /**
   * Runs `run` at once when `group` differs from the last call's group.
   * Otherwise runs it `ms` after this call, unless another call comes first.
   * Either way, the pending call drops.
   */
  schedule(group: string, run: () => void): void;
  cancel(): void;
}

export function createDebouncer(ms: number, timer: DebounceTimer = realTimer): Debouncer {
  let group: string | undefined;
  let handle: unknown;
  const cancel = () => {
    if (handle === undefined) return;
    timer.clear(handle);
    handle = undefined;
  };
  return {
    schedule(next, run) {
      cancel();
      if (next !== group) {
        group = next;
        run();
        return;
      }
      handle = timer.set(() => {
        handle = undefined;
        run();
      }, ms);
    },
    cancel,
  };
}

/**
 * `key` once it has held still for `ms`. A new `group` settles at once, so
 * the first value for a process needs no wait. `undefined` until a group
 * exists.
 */
export function useSettledKey(group: string | undefined, key: string | undefined, ms: number): string | undefined {
  const [debouncer] = useState(() => createDebouncer(ms));
  const [settled, setSettled] = useState<string | undefined>();
  useEffect(() => {
    if (group === undefined || key === undefined) return;
    debouncer.schedule(group, () => setSettled(key));
  }, [debouncer, group, key]);
  useEffect(() => () => debouncer.cancel(), [debouncer]);
  return settled;
}
