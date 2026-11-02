import { canonicalize } from "workflow-engine/schema/canonical-json";
import { StudioClientError } from "../api/client.js";
import { t } from "../catalog.js";
import type { Draft } from "../draft/types.js";
import { describeCaughtError } from "../errors.js";
import { isDraftDirty } from "./draftToolbarState.js";

/**
 * The autosave's decisions, apart from its timers and requests, so `bun:test`
 * can pin them (`studio-app`: "A draft saves itself after each change"). The hook
 * `useDraftToolbarActions` in `panels/DraftToolbar.tsx` runs them.
 */

/** A typing pause, short enough for the next press. */
export const AUTOSAVE_DEBOUNCE_MS = 1200;
/** A long typing run still lands. */
export const AUTOSAVE_MAX_WAIT_MS = 10_000;
/** The waits after an answer that may heal. The last one repeats. */
export const AUTOSAVE_RETRY_MS = [5000, 15_000, 30_000, 60_000] as const;

/** One draft and layout, compared by identity: every writer builds new objects. */
export interface SentPair {
  draft: Draft;
  layout: Record<string, unknown>;
}

/** A save that answered neither success, 401 nor 409. */
export interface SaveFailure extends SentPair {
  /** A network failure or a 5xx. Any other 4xx waits for a change or a press. */
  retryable: boolean;
  /** The sends of this one pair that failed in a row. */
  tries: number;
  /** The caught text, for a closed Developer view. */
  detail: string;
}

export interface AutosaveInput {
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  /** The restore notice, the discard dialog, the leave dialog or a save point request stands. */
  held: boolean;
  flushAsked: boolean;
  failure: Pick<SaveFailure, "retryable" | "tries"> | undefined;
  changedSinceFailure: boolean;
  /** Milliseconds since the first change after the last request left. */
  dirtyFor: number;
}

/**
 * May a save run, and after how long? `undefined` arms no timer. A failure
 * outranks `flushAsked`, since a flush clears the failure first, so any failure
 * it sees answers its own try.
 */
export function autosaveWait(input: AutosaveInput): number | undefined {
  const { dirty, saving, conflict, held, flushAsked, failure, changedSinceFailure, dirtyFor } = input;
  if (!dirty || saving || conflict) return undefined;
  if (failure !== undefined && !changedSinceFailure) {
    if (held || !failure.retryable) return undefined;
    return AUTOSAVE_RETRY_MS[Math.min(failure.tries, AUTOSAVE_RETRY_MS.length) - 1];
  }
  if (flushAsked) return 0;
  if (held) return undefined;
  return Math.min(AUTOSAVE_DEBOUNCE_MS, Math.max(0, AUTOSAVE_MAX_WAIT_MS - dirtyFor));
}

/**
 * When the current run of changes began. It clears on a clean draft, and the hook
 * clears it when a request leaves. It starts on the first commit whose draft or
 * layout is not identical to the last sent pair (`changed`). Neither a pause nor
 * the saving commit starts it, so neither can drop the debounce.
 */
export function nextDirtySince(
  current: number | undefined,
  commit: { dirty: boolean; changed: boolean; now: number },
): number | undefined {
  if (!commit.dirty) return undefined;
  if (current !== undefined) return current;
  return commit.changed ? commit.now : undefined;
}

/**
 * How a thrown save reads. A value that is no client error is a timeout firing
 * during the body read, so it counts as a network failure. A network failure can
 * hide a save that committed (`lost`).
 */
export function classifySaveFailure(err: unknown): { retryable: boolean; lost: boolean } {
  const status = err instanceof StudioClientError ? err.status : undefined;
  return { retryable: status === undefined || status >= 500, lost: status === undefined };
}

/** The failure a thrown save leaves. A repeat of the same pair counts up the backoff. */
export function nextFailure(prior: SaveFailure | undefined, sent: SentPair, err: unknown): SaveFailure {
  const repeat = prior !== undefined && prior.draft === sent.draft && prior.layout === sent.layout;
  return {
    ...sent,
    retryable: classifySaveFailure(err).retryable,
    tries: repeat ? prior.tries + 1 : 1,
    detail: describeCaughtError(err),
  };
}

/**
 * The pairs a send may have committed unseen. A lost send adds one. Another
 * failure changes nothing. A success or a real conflict empties the list, since
 * the stored revision is then known.
 */
export function nextUnconfirmed(entries: readonly SentPair[], sent: SentPair, outcome: "lost" | "failed" | "answered"): SentPair[] {
  if (outcome === "answered") return [];
  return outcome === "lost" ? [...entries, sent] : [...entries];
}

/**
 * The lost send a 409 reveals: the entry whose content the stored draft holds. At
 * most one send at a revision can commit, so a match is unambiguous. `canonicalize`
 * sorts keys, since `jsonb` reorders them.
 */
export function landedEntry(entries: readonly SentPair[], stored: { body: unknown; layout: Record<string, unknown> }): SentPair | undefined {
  const body = canonicalize(stored.body);
  const layout = canonicalize(stored.layout);
  return entries.find((entry) => canonicalize(entry.draft) === body && canonicalize(entry.layout) === layout);
}

export type FlushResult = { saved: true; revision: number } | { saved: false };

/**
 * What a waiting flush reads off a commit, or `undefined` while it still waits. It
 * reads "not dirty" first: a conflict on a clean draft has nothing left to save.
 */
export function flushAnswer(commit: {
  dirty: boolean;
  saving: boolean;
  failed: boolean;
  conflict: boolean;
  revision: number;
}): FlushResult | undefined {
  if (commit.saving) return undefined;
  if (!commit.dirty) return { saved: true, revision: commit.revision };
  return commit.failed || commit.conflict ? { saved: false } : undefined;
}

/** What one send answered. A landed answer carries the pair that reached the server. */
export type SaveAnswer = ({ saved: true; revision: number } & SentPair) | { saved: false };

export type UnmountPlan = "nothing" | "save" | "chain" | "keepCopy";

/**
 * What an unmount that bypassed the leave rule does (the browser's Back or
 * Forward). A dropped draft sends nothing. A standing notice holds the one copy
 * the store has room for. A running request chains, whatever the dirty state says.
 */
export function unmountPlan(state: {
  dropped: boolean;
  noticeStands: boolean;
  running: boolean;
  dirty: boolean;
  failed: boolean;
  conflict: boolean;
}): UnmountPlan {
  if (state.dropped || state.noticeStands) return "nothing";
  if (state.running) return "chain";
  if (!state.dirty) return "nothing";
  return state.failed || state.conflict ? "keepCopy" : "save";
}

/** What follows a running request's answer after an unmount. */
export function afterRunningSave(answer: SaveAnswer, latest: SentPair): "nothing" | "save" | "keepCopy" {
  if (!answer.saved) return "keepCopy";
  return isDraftDirty(latest.draft, answer.draft, latest.layout, answer.layout) ? "save" : "nothing";
}

/**
 * Where a save point act lands (design.md D10's outcome table). `unsaved` is a
 * false flush. `gone` is a 404 on a restore or a remove, and the list then
 * refetches. `ended` is a 401, which already ended the session.
 */
export type SavePointOutcome<T> =
  | { kind: "done"; value: T }
  | { kind: "unsaved" }
  | { kind: "conflict" }
  | { kind: "gone" }
  | { kind: "refused"; message: string }
  | { kind: "ended" };

/** How a thrown save point request lands. A refused create prints at its input, a 404 included. */
export function savePointFailure(act: "create" | "restore" | "remove", err: unknown): SavePointOutcome<never> {
  const status = err instanceof StudioClientError ? err.status : undefined;
  if (status === 409) return { kind: "conflict" };
  if (status === 404 && act !== "create") return { kind: "gone" };
  return { kind: "refused", message: describeCaughtError(err) };
}

/** The most of a restored point's name the kept point's name embeds. */
const KEPT_NAME_CLIP = 120;

/**
 * The name of the point a restore keeps. The embedded name clips to 120 characters
 * with "…", so a kept name never exceeds 139, however many rounds nest, and the
 * engine's bound of 200 holds.
 */
export function keptPointName(name: string): string {
  const clipped = name.length > KEPT_NAME_CLIP ? `${name.slice(0, KEPT_NAME_CLIP - 1).replace(/[\uD800-\uDBFF]$/, "")}…` : name;
  return t("savePoints.keptName").replace("{name}", () => clipped);
}

/** The selected steps a restored body still holds. */
export function selectionAfterRestore(selected: readonly string[], body: unknown): string[] {
  const steps = (body as Draft).workflow?.steps ?? [];
  const held = new Set<string | undefined>(steps.map((step) => step.id));
  return selected.filter((id) => held.has(id));
}
