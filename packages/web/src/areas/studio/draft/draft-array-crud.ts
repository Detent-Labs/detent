import type { Draft } from "./types";
import type { Mutate } from "./store";

/** Appends `item` to the array `ensureArray` returns (initializing any
 * intermediate object/array along the way), in one `mutate` call. */
export function addToDraftArray<T>(mutate: Mutate, ensureArray: (d: Draft) => T[], item: T): void {
  mutate((d) => {
    ensureArray(d).push(item);
  });
}

/** Shallow-merges `patch` into the item `getItem` returns; a no-op if it's absent (e.g. index out of range). */
export function updateInDraftArray<T>(mutate: Mutate, getItem: (d: Draft) => T | undefined, patch: Partial<T>): void {
  mutate((d) => {
    const item = getItem(d);
    if (item) Object.assign(item, patch);
  });
}
