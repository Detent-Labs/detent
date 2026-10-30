import type { ActionId, ProcessBody } from "workflow-engine/schema";
import { PROCESS_START_ACTION_TYPE } from "workflow-engine/engine/registry";
import type { Draft } from "./types";

export interface ChainingActionSite {
  id: ActionId;
  processId: string;
}

/**
 * Every `process.start` action site in a raw, possibly-incomplete `Draft`,
 * with its own action id and target `processId`. A shape-tolerant,
 * fully optional-chained walk — never `collect()`
 * (`workflow-engine/engine/registry-check`), which types its parameter
 * `ProcessBody` and calls `body.workflow.steps.forEach(...)` with no
 * optional chaining. A brand-new `+ New process` draft seeds every list empty
 * (`{ key: "", label: {}, baseLocale: "en", fields: [], workflow: { steps: [] } }`,
 * `processListLogic.ts::seededDraftInput`'s no-`seedVersion` branch). A stored
 * draft, or one edited on the JSON surface, can lack `workflow`
 * or any other key, and `EditScreen.tsx` passes the draft straight into
 * `DraftProvider`. A `collect()`-shaped walk would throw the instant its
 * effect runs against such a draft, so this walk mirrors `resolveLoc`'s own
 * tolerant style.
 */
export function collectChainingActionSites(draft: Draft): ChainingActionSite[] {
  const out: ChainingActionSite[] = [];
  for (const step of draft.workflow?.steps ?? []) {
    const actions = [
      ...(step.onEntry ?? []),
      ...(step.onExit ?? []),
      ...(step.onCancel ?? []),
      ...(step.paths ?? []).flatMap((p) => p.onPath ?? []),
      ...(step.timers ?? []).flatMap((t) => t.onFire?.actions ?? []),
    ];
    for (const action of actions) {
      if (action.type !== PROCESS_START_ACTION_TYPE) continue;
      const id = action.id;
      const processId = (action.config as { processId?: string } | undefined)?.processId;
      if (id && processId) out.push({ id, processId });
    }
  }
  return out;
}

/** The two functions `resolveChainingTargets` needs — injected so it can run
 * against fakes with no network, in a test, with no DraftProvider render
 * needed. */
export interface ChainingFetchIO {
  listProcesses: (token: string) => Promise<{ processId: string; version: number }[]>;
  getVersionBody: (processId: string, version: number, token: string) => Promise<unknown>;
}

/** The process list one mount shares across every `processId` it resolves.
 * `current` holds the in-flight or settled `listProcesses` promise; a failed
 * read clears it. */
export interface ChainingListing {
  current?: Promise<{ processId: string; version: number }[]>;
}

/**
 * Resolves each distinct `processId` in `sites` that `fetchState` has not
 * already seen. A `processId` already `"pending"` or `"done"` is skipped
 * outright: two sites that target the same id (the same site across an edit,
 * or two sites anywhere in the draft) share one resolution, and a caller
 * reads the resolved body (once done) straight out of `bodyCache`.
 *
 * Every unseen id shares the one process list in `listing`: the first starts
 * `listProcesses` and stores the promise, later ids (each keystroke in a
 * `processId` field yields a new id) wait on it. An id the list lacks marks
 * `"done"` with no body request and no `bodyCache` entry, so every site
 * referencing it reads not-checked, never an error. A listed id fetches its
 * body once.
 *
 * A failed list read clears `listing.current`, and a failed body read deletes
 * the id's `fetchState` entry. Both leave the id unseen, so the next call
 * (the next draft change) retries.
 *
 * `onSettled()` fires once per distinct `processId` this call actually
 * started, success or failure, after `fetchState`/`bodyCache` are updated for
 * it — the caller's signal to re-sync whatever depends on `bodyCache`
 * (`syncLoadedTargets` below).
 *
 * ponytail: a failed read has no backoff. The ceiling is one retry per draft
 * change while the server is down. Upgrade: a retry timer, or a failure
 * counter in `listing`.
 */
export function resolveChainingTargets(
  sites: readonly ChainingActionSite[],
  token: string,
  fetchState: Map<string, "pending" | "done">,
  bodyCache: Map<string, ProcessBody>,
  listing: ChainingListing,
  io: ChainingFetchIO,
  onSettled: () => void,
): void {
  const neededProcessIds = new Set(sites.map((s) => s.processId));
  for (const processId of neededProcessIds) {
    if (fetchState.has(processId)) continue;
    fetchState.set(processId, "pending");
    (async () => {
      let listed = listing.current;
      let summaries: Awaited<NonNullable<ChainingListing["current"]>>;
      try {
        if (!listed) {
          listed = io.listProcesses(token);
          listing.current = listed;
        }
        summaries = await listed;
      } catch {
        if (listing.current === listed) listing.current = undefined;
        fetchState.delete(processId);
        onSettled();
        return;
      }
      try {
        const summary = summaries.find((p) => p.processId === processId);
        if (summary) {
          bodyCache.set(processId, (await io.getVersionBody(processId, summary.version, token)) as ProcessBody);
        }
        fetchState.set(processId, "done");
      } catch {
        fetchState.delete(processId);
      } finally {
        onSettled();
      }
    })();
  }
}

/**
 * The correct `loadedChainingTargets` mapping for `sites` right now, keyed
 * by each site's own action id — never by `processId` or `loc`. Recomputed
 * fresh from `sites`/`bodyCache` on every call, never patched incrementally:
 * that is what lets an edited `processId` at an existing site stop reading
 * its stale pre-edit target the moment this runs again, per design.md's
 * "loadedChainingTargets and chainingSiteStatus key by the action's own id"
 * decision. A site whose `processId` has no `bodyCache` entry yet is simply
 * omitted, reading not-checked.
 *
 * Given `prev`, it returns `prev` itself when the fresh mapping holds the
 * same ids with the same body objects. `DraftProvider` runs this on every
 * draft change, and its validation `useMemo` depends on the result's
 * identity, so an unchanged mapping must not cost a second validation pass.
 */
export function syncLoadedTargets(
  sites: readonly ChainingActionSite[],
  bodyCache: Map<string, ProcessBody>,
  prev?: Record<ActionId, ProcessBody>,
): Record<ActionId, ProcessBody> {
  const next: Record<ActionId, ProcessBody> = {};
  for (const { id, processId } of sites) {
    const body = bodyCache.get(processId);
    if (body) next[id] = body;
  }
  if (prev === undefined) return next;
  const keys = Object.keys(next) as ActionId[];
  const same = keys.length === Object.keys(prev).length && keys.every((id) => prev[id] === next[id]);
  return same ? prev : next;
}
