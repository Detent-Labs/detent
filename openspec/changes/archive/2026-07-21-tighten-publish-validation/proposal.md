## Why

Two families of statically detectable authoring errors currently parse and
publish cleanly and only surface at runtime as an instance parked forever —
this engine's worst-diagnosability failure mode. `type: "subprocess"` is
uncoupled from the `subprocess` spec and from the all-automatic-paths
requirement the `subprocess-execution` spec already assumes; a terminal
`initialStep` creates an instance that can never complete and, as a
subprocess child, never returns. Separately, identity/uniqueness enforcement
covers only step ids and top-level field ids, while the CEL layer silently
flattens nested `group` fields into the same namespace as top-level fields —
so a colliding nested id/key, a duplicate action/timer/dataSource id, or a
dataSource keyed `data`/`child`/`result` all shadow silently instead of
failing at publish. The four places that resolve field identity (id/key
uniqueness, view-ref resolution, CEL check, CEL eval) also disagree on
whether nested fields are in scope, so a view legitimately referencing a
group sub-field is wrongly rejected today. This is also the first change to
touch these invariants since the contract was written, and `definition.ts` —
the most load-bearing artifact in the repo — has never had its own owning
spec; it is time it got one.

## What Changes

- Couple `type: "subprocess"` to the presence of a `subprocess` spec (and
  vice versa): a step of one without the other is rejected.
- Require a `subprocess` step's paths to be all-automatic (a wait-state), per
  the existing `subprocess-execution` assumption that nothing enforced.
- Fix `createInstance` (`src/engine/store.ts`) to derive a created
  instance's `status` from whether its `initialStep` is terminal, exactly as
  a transition derives it for its target — instead of hardcoding
  `"running"`. A terminal `initialStep` is a legitimate body shape (e.g. a
  migration target instances relocate onto by identity mapping, never
  created against directly — see `test/migration.test.ts` "6.2"), so this is
  a runtime fix, not a publish-time rejection: an earlier draft of this
  change rejected the shape outright and was caught by that pre-existing
  test.
- Extend id-uniqueness checking from step ids and top-level field ids to
  every id kind (path, action, timer, dataSource) and to field ids/keys and
  dataSource keys nested at any depth inside `group` fields.
- Make id/key resolution scope consistent everywhere it is computed today:
  view-ref resolution (currently top-level-only) and the id/key-uniqueness
  checks recurse into `group` fields exactly as the CEL check/eval layer
  already does, so the four agree on one authoritative field set.
- Remove the unsatisfiable "a timer with a `targetPath` counts as an exit"
  branch (`definition.ts:404-406`): a timer's `targetPath` must already be an
  outgoing path of the same step, so a step with zero paths can never
  satisfy it via a timer.
- Every new invariant lands as a Zod refinement in `src/schema/definition.ts`
  (not the publish path) — see design.md for why this placement is correct
  here despite `definition.ts` also being the read-path deserializer.

## Capabilities

### New Capabilities
- `definition-contract`: owns the structural/identity authoring-time
  invariants enforced directly by the `src/schema/definition.ts` Zod
  schemas — id/key uniqueness and resolution scope across the whole field
  tree, step/path/timer shape rules, and the `subprocess` step's coupling
  and wait-state requirement. This capability has never had an owning spec;
  it was previously described only in `CLAUDE.md` prose and exercised by
  `test/validate.test.ts`.
- `instance-creation`: owns what `createInstance` derives from the target
  step when a new instance is created, starting with `status`. This is
  distinct from `definition-contract` — it is engine runtime behavior, not
  authoring-time schema validation — and, like `definition-contract`, had no
  owning spec before this change.

### Modified Capabilities
(none — `subprocess-execution`'s existing requirement text already states a
subprocess step must be all-automatic; this change adds enforcement of that
existing requirement at the schema layer, it does not change what
`subprocess-execution` specifies)

## Impact

- `src/schema/definition.ts`: extended `superRefine` blocks on `step` and
  `processBody`; a new exported `collectFieldsDeep` helper (the one
  authoritative recursive field walk); no schema shape changes, only
  additional rejection paths.
- `src/cel/check.ts` and `src/cel/eval.ts`: their independent inline
  group-recursion walks are replaced by the shared `collectFieldsDeep`, with
  no change in behavior (see design.md).
- `src/engine/store.ts`: `createInstance`'s status derivation (see
  `instance-creation` above).
- `test/validate.test.ts`: a rejecting-variant test per new invariant.
- `test/cel.test.ts`: unchanged behavior verified after the walk relocation.
- `test/engine.test.ts`: a test covering `createInstance`'s status
  derivation for a terminal `initialStep`.
- `examples/*.json` must keep validating and publishing unchanged.
- New `openspec/specs/definition-contract/spec.md` and
  `openspec/specs/instance-creation/spec.md`.
- Rollout risk: because `definition.ts` is also the deserializer for stored
  bodies, any already-persisted definition that happens to violate a new
  check becomes unrehydratable on next read. Addressed in design.md.
