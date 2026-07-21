## Why

`src/schema/definition.ts`'s structural invariant "an `Action.output` target must
name a real field" (`action output targets unknown field: <fid>`) only walks
`onEntry`/`onExit`/`onCancel` actions. It silently skips `onPath` actions and a
timer's `onFire` actions — verified empirically: `processBody.safeParse()`
currently accepts a body where an `onPath` action's `output` (or a timer's
`onFire` action's `output`) targets a field id that does not exist anywhere in
the catalog. The very same function has a correctly symmetric collector three
lines above it for a different invariant (`allActionIds`, feeding the
duplicate-action-id check), which walks all five action positions — so the
output-field-resolution check's coverage of only three of them is a gap in an
existing invariant's enforcement, not a considered scope boundary. There is
currently no test anywhere in the repo for this invariant, in any position. A
bogus target in an `onPath`/timer `onFire` action silently writes into a
phantom `data` key at runtime instead of failing at publish/authoring time —
exactly the class of failure the project's structural invariants exist to
catch early (see `README.md` / `CLAUDE.md`'s authoring-time invariants).

## What Changes

- Extend the existing `Action.output` target-resolution check in
  `src/schema/definition.ts` to also cover `onPath` actions (across every path
  on every step) and timer `onFire` actions (across every timer on every
  step), using the same `fieldIds.has(fid)` resolution already in place and
  the same iteration shape as the neighboring `allActionIds` collector.
- No change to the check's placement (stays a Zod `superRefine`, matching the
  three positions it already covers) or its error message shape.
- Add tests covering all five action positions — three already silently
  correct, two currently broken — each rejecting an unknown-field target and
  each accepting a resolvable one.

## Capabilities

### Modified Capabilities
- `definition-contract`: new requirement — an `Action.output` target field id
  must resolve to a declared field from every action position (`onEntry`,
  `onExit`, `onPath`, `onCancel`, and a timer's `onFire`), not only three of
  the five.

## Impact

- `src/schema/definition.ts`: the `superRefine` that already checks
  `onEntry`/`onExit`/`onCancel` output targets is extended to also walk
  `onPath` and timer `onFire` actions.
- `test/validate.test.ts`: new coverage for all five positions.
- `openspec/specs/definition-contract/spec.md`: new requirement + scenarios.
- No engine or publish-path change; `Action.output` always targets a field in
  the same process body doing the writing, so no cross-process resolution is
  needed (unlike the subprocess output-contract change).
- Compatibility note (addressed in design.md): this tightens a Zod refinement
  in the module that also deserializes already-stored bodies. Addressed as a
  deliberate decision, not a casual side effect — see design.md's Risks
  section for why this differs from the project's "validation that may
  tighten over time belongs on the write path" rule for CEL/duration checks.
