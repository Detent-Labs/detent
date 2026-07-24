## Context

`src/engine/registry.ts` currently declares a full plugin-registry shape for
assignment strategies (`AssignmentRegistry`, `AssignmentStrategyDef`,
create/register/resolve functions, `createDefaultAssignmentRegistry`), mirroring
the action-handler registry (`Registry`/`HandlerDef`). Unlike the action
registry — which has a real second handler (`http.request`, see the
`http-action-handler` capability) — the assignment-strategy registry has
exactly one registrant, `staticAssignmentStrategy`, ever, outside
`test/assignment-registry.test.ts`.

The registry is threaded as an optional parameter (default
`createDefaultAssignmentRegistry()`) through `src/engine/transition.ts`
(`commitTransition`, `resolveAutomatic`, `executeManualTransition`,
`commitManualTransition`, `cancelInstance`, `sweepCancelledChildren`,
`startInstance`, `executeAutomaticTransition`, `fireTimer`) and
`src/engine/definitions.ts` (`publishBody`), and re-exported through
`src/engine/host.ts`, `subprocess.ts`, `migration.ts` wherever they call into
those functions. Almost every one of those ~20 sites passes the registry
through untouched. There are exactly **three** real reads, not one:
`transition.ts::resolveStepAssignment` (one call to
`resolveAssignmentStrategy`, used for every non-creation step entry),
`src/engine/store.ts::createInstance` (its own, independent call to
`resolveAssignmentStrategy` for an assignment-bearing *initial* step — it
does not go through `resolveStepAssignment`, since creation does not route
through `planStepEntry`), and `checkAssignmentRegistry` (one call to the same
resolver, at publish time). The first design draft of this change missed the
`store.ts` site; both runtime reads need the identical inlining treatment.

## Goals / Non-Goals

**Goals:**
- Remove the registry/plugin indirection for assignment strategies —
  `AssignmentRegistry`, `AssignmentStrategyDef`, and every threading
  parameter — while keeping all present, tested behavior identical: `static`
  resolves `config.candidates` verbatim, an unresolvable type or a config
  that fails `{ candidates: string[] }` is a publish-time error, not a
  runtime one.
- Keep `Step.assignment.strategy`'s schema shape (`{ type, config }`)
  untouched in `src/schema/definition.ts` — this is a validation-and-wiring
  simplification, not a contract change.
- Update `CLAUDE.md` (Extensibility + Current-state paragraphs) so the
  documented architecture matches the code once this lands.

**Non-Goals:**
- Not touching `assignment-claim-enforcement`'s claim/release/eligibility
  behavior — those requirements are unaffected; only the mechanism-language
  describing *how* candidates get resolved changes.
- Not touching the action-handler registry (`Registry`/`HandlerDef`) — it
  has a real second registrant and stays exactly as-is.
- Not adding a new assignment strategy or changing what `static` accepts.
- Not implementing ponytail-audit finding #3 (dedupe
  `checkActionRegistry`/`checkAssignmentRegistry`) — moot once
  `checkAssignmentRegistry`'s registry-based form no longer exists.

## Decisions

**Keep a publish-time check, drop the registry underneath it.**
`checkAssignmentRegistry(body, registry)` becomes a parameterless (aside from
`body`) direct check: for every step with a declared `assignment`, if
`strategy.type !== "static"`, emit the same `RegistryIssue` shape naming the
step and the unresolved type; else `safeParse` `strategy.config` against an
inline `z.object({ candidates: z.array(z.string()) })` schema and emit issues
the same way `checkActionRegistry` does for a `configSchema` violation. Same
function name kept (or renamed — see Open Questions) so `publishBody`'s call
site changes minimally: it drops the registry argument, keeps the same
`AssignmentRegistryValidationError` throw on non-empty issues.

*Alternative considered*: drop the publish-time check entirely and only
validate at runtime (in `resolveStepAssignment`). Rejected — this reintroduces
exactly the failure mode the registry existed to prevent: a bad
`assignment.strategy` silently resolving to zero candidates at runtime
(a step nobody can ever claim) instead of failing at publish. The existing
code comment on `resolveStepAssignment` already establishes this reasoning;
the new direct check preserves it.

**Inline `resolveStepAssignment` to read `config.candidates` directly.**
Since `checkAssignmentRegistry` (post-publish) already guarantees
`strategy.type === "static"` and a matching config shape, the runtime
function no longer needs a registry lookup — it can be:
```ts
function resolveStepAssignment(target, body, entering, actorId): Instance["assignment"] {
  if (!target.assignment) return undefined;
  const { strategy } = target.assignment;
  if (strategy.type !== STATIC_ASSIGNMENT_STRATEGY_TYPE) return { candidates: [], claimedBy: undefined, claimedAt: undefined };
  const candidates = (strategy.config as { candidates?: string[] }).candidates ?? [];
  return { candidates, claimedBy: undefined, claimedAt: undefined };
}
```
The defensive `!== "static"` branch is kept (mirroring the removed registry's
`!def` branch) for a body constructed directly in a test without going
through `publishBody` — same defensive posture as today, just without a
registry to miss a lookup in.

**Apply the identical inlining to `store.ts::createInstance`.** Its inline
block (currently: look up `initial.assignment.strategy` via
`resolveAssignmentStrategy`, build a guard `ctx`, then call
`def.resolve(strategy.config, ctx)`) becomes:
```ts
let assignment: Instance["assignment"];
if (initial?.assignment) {
  const strategy = initial.assignment.strategy;
  const candidates = strategy.type === STATIC_ASSIGNMENT_STRATEGY_TYPE
    ? ((strategy.config as { candidates?: string[] }).candidates ?? [])
    : [];
  assignment = { candidates, claimedBy: undefined, claimedAt: undefined };
}
```
The `ctx` (`buildGuardContext(body, { ...seed, timers }, SYSTEM_ACTOR)`) this
site built is dropped along with the lookup: `staticAssignmentStrategy.resolve`
ignored its second argument entirely (`(config) => config.candidates ?? []`),
so `ctx` was already dead computation — the registry's generic `resolve(config,
context)` shape carried a parameter the one real strategy never read. Cutting
it here is the same YAGNI trim as the rest of this change, not a separate
follow-on.

**Remove the `assignmentRegistry` parameter wherever it only threads
through**, rather than keeping it as a vestigial no-op parameter. A threaded
parameter nothing reads is exactly the kind of indirection this change
removes; keeping it "just in case" reintroduces the same YAGNI the audit
flagged. Every one of the ~20 call sites drops the parameter and its default
value; callers in `host.ts`/`subprocess.ts`/`store.ts`/`migration.ts` drop
whatever they were constructing/forwarding.

**`STATIC_ASSIGNMENT_STRATEGY_TYPE` survives as a plain string constant**
(not a registry entry) — both the publish-time check and the runtime
resolver compare against it directly, so the literal `"static"` stays named
once, not repeated.

## Risks / Trade-offs

- [Risk] Removing a documented extension point (CLAUDE.md's Extensibility
  list) narrows what's architecturally promised, which could surprise a
  future contributor expecting pluggable strategies. → Mitigation: this is a
  deliberate, user-confirmed decision (see proposal's Why); CLAUDE.md is
  updated in the same change so the doc never claims a capability the code
  doesn't have.
- [Risk] A future second assignment strategy (e.g., a CEL-driven or
  data-source-driven candidate list) would need the registry shape rebuilt.
  → Mitigation: acceptable — that's exactly the "only ~50-90 lines, rebuild
  when needed" trade a YAGNI cut makes; the removed shape is simple enough
  (a `Map` + three functions) to reintroduce quickly if a second strategy is
  ever authored.
- [Risk] Mechanical parameter removal across ~20 call sites is a large diff
  by line count even though each edit is trivial, raising review-diff-noise
  risk. → Mitigation: no behavior change at any site other than the two
  functions in Decisions above — the diff is safe to skim mechanically
  (delete a parameter + its default + its pass-through argument).

## Migration Plan

1. Rewrite `checkAssignmentRegistry` (registry-check.ts) to the direct check;
   update its one export signature.
2. Inline `resolveStepAssignment` (transition.ts) AND
   `store.ts::createInstance`'s independent inline block — both are real
   reads, not just threading sites (see Context).
3. Remove the `assignmentRegistry` parameter from every function in
   `transition.ts` that threads it, updating internal call chains
   (`commitTransition` → `resolveAutomatic` → ... ) to drop the argument.
4. Remove the parameter from `publishBody` (definitions.ts) and its call to
   `checkAssignmentRegistry`, and from `store.ts::createInstance`.
5. Update `host.ts`/`subprocess.ts`/`migration.ts` call sites that construct
   or forward a registry (into `transition.ts` functions or into
   `store.ts::createInstance`, e.g. `subprocess.ts`'s spawn handler).
6. Delete the registry types/functions from `registry.ts`.
7. Rewrite `test/assignment-registry.test.ts` for the direct check.
8. Update CLAUDE.md's Extensibility and Current-state paragraphs.
9. `tsc --noEmit` (compiler surfaces every stale call site — the parameter
   removal is compile-error-driven, not grep-driven) then full `bun test`
   with `DATABASE_URL` set.

No data migration, no runtime deployment step — this is a source-level
simplification with no schema or persisted-data change. Rollback is a plain
revert if `tsc`/tests surface a missed call site; no partial-rollback
concern since nothing is persisted mid-change.

## Open Questions

- Rename `checkAssignmentRegistry`/`AssignmentRegistryValidationError` to
  drop "Registry" from the name (e.g. `checkAssignment`) now that there's no
  registry, or keep the existing names for a smaller diff and less churn in
  `assignment-registry-validation`'s spec file name? Leaning toward keeping
  the names — the spec capability folder is already named
  `assignment-registry-validation` and renaming it is a bigger, unrelated
  diff for no behavior change. Function names can drift from the "registry"
  framing without confusing anyone reading the (now much simpler) code.
