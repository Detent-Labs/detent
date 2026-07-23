## Context

`Actor{id, roles}` is accepted "trusted as given" at every existing boundary
(Runtime API Layer, HTTP wrapper) — nothing verifies it.
`AssignmentState{candidates, claimedBy, claimedAt}` is declared on `Instance`
but never written or read anywhere in the engine. Roadmap #5d (`CLAUDE.md`)
calls this out as needed "before more than one person safely tests against a
shared engine." Enforcement without verified identity is meaningless — an
actor can lie about who they are and bypass any candidate check — so this
change builds both pieces together.

Scope: schema, engine, Runtime API Layer, HTTP wrapper. The editor Player UI
(claim/release buttons, blocked-state messaging) is explicitly deferred to a
follow-up change, matching how the HTTP wrapper (#5b) and Player (#5c) were
themselves separate roadmap items.

No concrete identity provider (password/JWT/OIDC) ships in core. Actor
resolution is a pluggable extension point only, consistent with a headless
engine that isn't itself an identity provider.

## Goals / Non-Goals

**Goals:**
- Give steps a declarative way to restrict who may act on them
  (`Step.assignment`, a registry-validated `AssignmentStrategy` plugin
  resolved to `candidates: string[]` at step entry).
- Make claiming exclusive: a candidate must explicitly claim an unclaimed
  step before acting; only the claimant may submit or release.
- Provide a pluggable `ActorResolver` extension point so an untrusted
  boundary (the HTTP wrapper) can turn a raw credential into a trusted
  `Actor` before calling the Runtime API.
- Keep the two capabilities decoupled: enforcement works against whatever
  `Actor` it's given regardless of how it was produced; resolution's only
  job is producing a trustworthy one at the boundary.

**Non-Goals:**
- No concrete identity provider (JWT/OIDC/session-based auth) ships in
  core — only the extension point plus one non-production dev resolver.
- No editor Player UI changes (claim/release buttons, blocked-state
  messaging) — deferred to a follow-up change.
- No data-driven assignment strategy (CEL-based, external directory) — v1
  ships exactly one built-in static strategy; the registry is the
  extension point for more.
- No migration-time assignment reconciliation — an in-flight claim
  survives a migration untouched, mirroring the already-accepted "reconcile
  in-flight action writebacks across a migration" gap.

## Decisions

**Assignment activates an existing-but-inert schema field, not a new one.**
Discovered during implementation: `src/schema/definition.ts` already
declares `assignment = z.object({ strategy: plugin })` and
`Step.assignment: assignment.optional()`, and `packages/editor` already has
a `PluginEnvelopeEditor`-backed UI for it (`StepsPanel.tsx`, bound to
`step.assignment?.strategy`). It was scaffolded alongside the other plugin
envelopes (actions, data sources, field types) but never validated at
publish or read anywhere at runtime — exactly the "declared but
unenforced" gap `CLAUDE.md` roadmap #5d calls out. This change activates
it: no schema change, `Step.assignment.strategy: { type, config }` is the
real shape (not the flat `{ type, config }` originally proposed), and every
requirement below is phrased against `assignment.strategy.type`/
`assignment.strategy.config`. Absent `assignment` = unrestricted, preserving
all current behavior/examples/tests untouched.

**Assignment resolution is synchronous and pure, evaluated inside
`planStepEntry`.** Unlike actions, which run async post-commit via the
outbox, candidates must exist atomically the instant a step becomes current,
or enforcement has nothing to check against immediately after entry.
`resolve(config, context) => string[]` is closer in spirit to a guard
evaluator than to an action handler. Alternative considered: resolve
candidates lazily on first `claimStep` call — rejected because
`getInstanceView` needs to report candidates for UI rendering before anyone
attempts a claim, and a step could otherwise be entered with no candidates
computed at all if nobody ever tries to claim it.

**v1 ships exactly one built-in strategy: static `{ candidates: string[] }`.**
`resolve: (config) => config.candidates` — a flat list of role names and/or
actor ids, no CEL, no dynamic lookup. Keeps the initial surface small while
proving the registry extension point end-to-end. A data-driven strategy is
explicitly future work against the same extension point (see Open
Questions in the source roadmap notes).

**`Instance.assignment` becomes nullable (schema addition, discovered necessary
during implementation).** `AssignmentState` was already declared but unwritten,
so it had never needed to represent "explicitly cleared." A step entry's
commit patch is a shallow jsonb `||` merge (`applyStepEntry`); an omitted key
in that merge leaves the *previous* step's `assignment` value in place, which
directly contradicts "recomputed fresh on every entry, unset when the target
step declares none." Writing JSON `null` through the same merge — rather than
adding a second targeted `jsonb_set`/`#-` statement — clears it in one
operation and matches the existing `pathId.nullable()`/`fromStepId.nullable()`
precedent in `HistoryEntry` for the identical "must be an explicit, not
omitted, jsonb value" reason. `undefined` remains valid for an
already-persisted instance that predates this field; both read as "no
assignment."

**Candidate matching: ids and role names share one flat namespace.** An
actor is eligible if `actor.id` is in `candidates` **or** any of
`actor.roles` is in `candidates`. No schema change needed — `candidates` is
already `string[]`. Simpler than a discriminated `{kind: "role"|"id",
value}` shape and matches how the field was already documented to allow
mixed content.

**Claim/release as distinct engine operations, not step transitions.**
`claimStep(instanceId, actor)` / `releaseClaim(instanceId, actor)` row-lock
the instance (`SELECT ... FOR UPDATE`, the same pattern
`submitAndTransition` already uses to guard against a concurrent writeback),
mutate only `assignment.claimedBy`/`claimedAt`, and commit — no
`HistoryEntry` (no step change), no `transitionSeq` advance (not a
transition). This keeps claim/release semantically distinct from a
transition in the audit trail: two new `InstanceEvent` kinds
(`assignment.claimed`, `assignment.released`) carry the audit record
instead, following the existing rule that an event never advances the
sequence and several may share one.

**Candidates recomputed fresh on every step entry, never persisted across
visits.** Every transition path that re-enters a step (manual, automatic
cascade, timer-forced, migration's remap) goes through the
`planStepEntry`/`applyStepEntry` seam, so a loop-back to a previously
visited step gets fresh candidates and clears any stale claim from the prior
visit — mirroring how timers are re-armed on every entry rather than
persisted. Alternative considered: carry a claim forward across a loop-back
if the step id is unchanged — rejected as surprising (a claim from a
different lifecycle visit granting access on the new one) and inconsistent
with the timer precedent this design otherwise follows.

**`ActorResolver` is a single injected function, wired once at host
startup.** `(credential: unknown) => Promise<Actor>`, alongside the existing
`Registry`/`resolveBody` injection (`host.ts` pattern). The HTTP wrapper
extracts a credential from the request (a transport detail, not this
module's concern), calls the resolver, and passes the resulting `Actor`
into the Runtime API exactly as it does today. Alternative considered:
resolution logic embedded directly in HTTP middleware — rejected because it
would couple identity verification to one transport, when the extension
point should also serve any other untrusted boundary later.

**One non-production dev resolver ships for local/example use**: trusts a
pair of headers (`X-Actor-Id` / `X-Actor-Roles`) and constructs an `Actor`
directly. This makes today's implicit "trust the caller" behavior explicit
and swappable rather than hardcoded, without pretending to be a real
identity provider.

## Risks / Trade-offs

- **[Risk]** An in-flight claim survives a migration untouched — the step
  id it's on gets remapped like any other field, but the claim itself isn't
  re-validated against the new step's strategy, so a stale claimant could
  retain access after a migration changes who should be eligible.
  **Mitigation**: none in this change; tracked as a known, deliberately
  deferred gap (joins the existing in-flight-action-writeback item in
  CLAUDE.md's decided-not-yet-built list). Revisit only if this proves
  common in practice.
- **[Risk]** The dev header-based `ActorResolver` trusts unsigned headers —
  if a deployment forgets to swap it for a real resolver, any caller can
  claim any identity. **Mitigation**: documented as explicitly
  non-production; no default wiring makes it active without deliberate
  host-side injection.
- **[Trade-off]** Synchronous, pure candidate resolution (no I/O) rules out
  a directory-backed or otherwise externally-looked-up strategy for v1.
  Accepted because atomicity with step entry is required for `submit`/
  `getInstanceView` to have candidates to check against immediately, and a
  future async variant would need its own design (e.g., resolve into a
  pending state, similar to how actions are async post-commit).
- **[Trade-off]** Ids and role names sharing one flat `candidates`
  namespace is simple but means a role literally named the same as an actor
  id would collide. Accepted as an existing constraint of the field's
  documented shape, not newly introduced here.

## Migration Plan

- Additive schema change only (`Step.assignment` optional, `AssignmentState`
  fields already existed unused) — no data migration for existing
  definitions or instances. A body with no `assignment` anywhere publishes
  unchanged; an already-published body without the field continues to
  rehydrate and run exactly as today.
- Rollout order matches the dependency chain in the design: schema +
  registry validation first, then engine-side resolution + claim/release,
  then Runtime API surface, then `ActorResolver` + HTTP wrapper wiring —
  each stage is independently testable and mergeable.
- No rollback complexity beyond normal code revert: nothing here is
  destructive to existing data, since `AssignmentState` was already
  declared but unwritten.

## Open Questions

- None blocking implementation. Noted for future work: a data-driven
  assignment strategy (CEL-based candidate resolution, or an
  external-directory lookup) against the same `AssignmentStrategyDef`
  registry extension point.
