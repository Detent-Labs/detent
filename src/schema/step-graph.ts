/**
 * Step-graph dominance: "does step D lie on every path from `initialStep` to
 * step S." Shared by the compile pass's `checkUnsatisfiableRequiredReadonly`
 * and the studio's `writtenFieldCounts`, so the two can never disagree about
 * which step guarantees a value by the time a given step is submitted (see
 * `gate-required-readonly-reachability`'s design.md, Decisions).
 *
 * Iterative dataflow fixpoint, not a dominator-tree library: the authored
 * step graph is small and can contain cycles (a rejection/resubmission path
 * back to an earlier step is a legal authored pattern), and this only ever
 * needs "does D dominate S," never a full dominator tree.
 *
 * `Dom(initialStep) = {initialStep}`, fixed for the whole run — excluded
 * from the per-step recomputation loop, so a back edge into `initialStep`
 * (e.g. a rejection path) cannot make a downstream step appear to dominate
 * it. Every other step's `Dom` starts as the FULL set of step ids, not the
 * empty set: intersecting against an empty starting set would trivially
 * collapse every `Dom(S)` to `{S}` and the fixpoint would never grow it.
 *
 * A step with no predecessor at all (unreachable from `initialStep`, or an
 * `initialStep` that does not itself resolve to any step in the input) never
 * gets its `Dom` narrowed by any intersection, so it stays at the full
 * universal set forever. This is the correct, vacuous-dominance reading, not
 * an algorithmic gap: "every path from `initialStep` to S passes through D"
 * is vacuously true for every D when no such path exists at all.
 *
 * Duck-typed on `{id, paths: {to}[]}[]` so it works on both a pre-parse
 * authored `ProcessBody` and the studio's partially-typed `Draft` shape —
 * tolerant of a missing `id`, a `path.to` naming no step, or an `initialStep`
 * that resolves to nothing: each of those reads as "no edge" rather than
 * throwing, mirroring the studio's own `?? []` / `.find`-returns-`undefined`
 * tolerance elsewhere in the draft layer.
 */

export interface StepGraphNode {
  id?: string;
  paths?: { to?: string }[];
}

/** For every step id present in `steps`, the set of step ids that dominate
 * it — that step included, since a step reachable from `initialStep`
 * dominates itself. */
export function computeDominatorSets(
  steps: StepGraphNode[] | undefined,
  initialStep: string | undefined,
): Map<string, Set<string>> {
  const ids = (steps ?? []).map((s) => s.id).filter((id): id is string => typeof id === "string");
  const idSet = new Set(ids);
  const universal = new Set(ids);

  const predecessors = new Map<string, Set<string>>();
  for (const id of ids) predecessors.set(id, new Set());
  for (const s of steps ?? []) {
    if (typeof s.id !== "string") continue;
    for (const p of s.paths ?? []) {
      const to = p?.to;
      if (typeof to !== "string" || !idSet.has(to)) continue;
      predecessors.get(to)!.add(s.id);
    }
  }

  const seedResolves = typeof initialStep === "string" && idSet.has(initialStep);
  const dom = new Map<string, Set<string>>();
  for (const id of ids) {
    dom.set(id, seedResolves && id === initialStep ? new Set([id]) : new Set(universal));
  }
  // No resolvable seed: every step's Dom stays the full universal set, the
  // same vacuous-dominance outcome an orphan step reads below.
  if (!seedResolves) return dom;

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ids) {
      if (id === initialStep) continue; // fixed for the whole run
      const preds = predecessors.get(id) ?? new Set<string>();
      if (preds.size === 0) continue; // orphan: Dom stays the full universal set

      let next: Set<string> | undefined;
      for (const p of preds) {
        const pd = dom.get(p)!;
        next = next === undefined ? new Set(pd) : new Set([...next].filter((x) => pd.has(x)));
      }
      next!.add(id);

      const cur = dom.get(id)!;
      if (next!.size !== cur.size || [...next!].some((x) => !cur.has(x))) {
        dom.set(id, next!);
        changed = true;
      }
    }
  }
  return dom;
}

/** "D dominates S" — `D ∈ Dom(S)`. An `s` absent from `dom` (no resolvable
 * step under that id) reads as vacuous dominance, the same tolerant default
 * `computeDominatorSets` applies to an unresolved `initialStep`. `d`
 * undefined can dominate nothing. */
export function dominates(dom: Map<string, Set<string>>, d: string | undefined, s: string | undefined): boolean {
  if (typeof d !== "string" || typeof s !== "string") return false;
  const set = dom.get(s);
  if (set === undefined) return true;
  return set.has(d);
}
