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
 * optional chaining. A brand-new `+ New process` draft seeds as `{
 * baseLocale: "en" }`, with no `workflow` key at all
 * (`processListLogic.ts::seededDraftInput`'s no-`seedVersion` branch), and
 * `EditScreen.tsx` passes that straight into `DraftProvider` — a
 * `collect()`-shaped walk would throw the instant its effect runs against
 * it, mirroring `resolveLoc`'s own tolerant-walk style instead.
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

/**
 * Kicks off at most one `listProcesses` + `getVersionBody` pair per distinct
 * `processId` in `sites` that `fetchState` has not already seen — the dedup
 * guard design.md's "Chaining targets auto-fetch" decision requires: two
 * sites (the same site across an edit, or two different sites anywhere in
 * the draft) that target the same `processId` share one pair, never issue
 * two. A `processId` already `"pending"` or `"done"` is skipped outright:
 * this function starts no new fetch for it, and a caller reads its
 * already-resolved body (once done) straight out of `bodyCache`.
 *
 * `onSettled()` fires once per distinct `processId` this call actually
 * fetched, after `fetchState`/`bodyCache` are updated for it — the caller's
 * signal to re-sync whatever depends on `bodyCache` (`syncLoadedTargets`
 * below). A `processId` with no matching `listProcesses` entry, or a failed
 * fetch, still marks `"done"` with no `bodyCache` entry: every site
 * referencing it then reads not-checked, never an error.
 */
export function resolveChainingTargets(
  sites: readonly ChainingActionSite[],
  token: string,
  fetchState: Map<string, "pending" | "done">,
  bodyCache: Map<string, ProcessBody>,
  io: ChainingFetchIO,
  onSettled: () => void,
): void {
  const neededProcessIds = new Set(sites.map((s) => s.processId));
  for (const processId of neededProcessIds) {
    if (fetchState.has(processId)) continue;
    fetchState.set(processId, "pending");
    (async () => {
      try {
        const summaries = await io.listProcesses(token);
        const summary = summaries.find((p) => p.processId === processId);
        if (!summary) return;
        const body = (await io.getVersionBody(processId, summary.version, token)) as ProcessBody;
        bodyCache.set(processId, body);
      } catch {
        // A target with no matching listProcesses entry, or a failed fetch,
        // gets no bodyCache entry — every site referencing it reads
        // not-checked, not an error.
      } finally {
        fetchState.set(processId, "done");
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
 */
export function syncLoadedTargets(
  sites: readonly ChainingActionSite[],
  bodyCache: Map<string, ProcessBody>,
): Record<ActionId, ProcessBody> {
  const next: Record<ActionId, ProcessBody> = {};
  for (const { id, processId } of sites) {
    const body = bodyCache.get(processId);
    if (body) next[id] = body;
  }
  return next;
}
