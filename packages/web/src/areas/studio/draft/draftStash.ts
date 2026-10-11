import { canonicalize } from "workflow-engine/schema/canonical-json";
import type { Draft } from "./types.js";

/**
 * The unsaved work of one draft, kept in the tab when a request answers 401
 * (`studio-app`: "A session that ends with unsaved changes keeps the draft").
 * The revision is the one the work was built on, so a restore saved against a
 * moved draft answers 409.
 */
export interface DraftStash {
  body: Draft;
  layout: Record<string, unknown>;
  revision: number;
}

/** The three `Storage` methods this module calls. `undefined` stands for a
 * tab with no usable storage, and every function then does nothing. */
export type StashStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;

/** The tab's `sessionStorage`, or `undefined` where it is missing or its
 * access throws (blocked site data). */
export function tabStorage(): StashStorage {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/** Both ids are encoded, so no actor id and process id pair can produce the
 * key of another pair. */
function stashKey(actorId: string, processId: string): string {
  return `studio.draftStash:${encodeURIComponent(actorId)}:${encodeURIComponent(processId)}`;
}

/** Writes the stash. A refused write (quota, blocked storage) is dropped: the
 * logout that follows must run either way. */
export function stashDraft(storage: StashStorage, actorId: string, processId: string, stash: DraftStash): void {
  try {
    storage?.setItem(stashKey(actorId, processId), JSON.stringify(stash));
  } catch {
    // The write is lost; the caller's logout proceeds as it would without it.
  }
}

export function clearStash(storage: StashStorage, actorId: string, processId: string): void {
  try {
    storage?.removeItem(stashKey(actorId, processId));
  } catch {
    // A storage that refuses the removal holds nothing this tab can read back.
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stash for this actor and process, when it differs from the loaded
 * record. A value that does not parse as a stash, or one whose body and layout
 * equal the loaded record under `canonicalize`, is cleared and reads as
 * nothing. `canonicalize` sorts keys, so a layout in another key order still
 * reads as equal.
 */
export function readRestorable(
  storage: StashStorage,
  actorId: string,
  processId: string,
  loaded: { body: unknown; layout: Record<string, unknown> },
): DraftStash | undefined {
  let raw: string | null;
  try {
    raw = storage?.getItem(stashKey(actorId, processId)) ?? null;
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (
    !isObject(parsed) ||
    !isObject(parsed.body) ||
    !isObject(parsed.layout) ||
    typeof parsed.revision !== "number" ||
    !Number.isFinite(parsed.revision)
  ) {
    clearStash(storage, actorId, processId);
    return undefined;
  }

  const stash: DraftStash = { body: parsed.body as Draft, layout: parsed.layout, revision: parsed.revision };
  if (canonicalize(stash.body) === canonicalize(loaded.body) && canonicalize(stash.layout) === canonicalize(loaded.layout)) {
    clearStash(storage, actorId, processId);
    return undefined;
  }
  return stash;
}
