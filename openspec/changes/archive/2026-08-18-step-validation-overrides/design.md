## Context

See the Why section in proposal.md.

Four facts about the current code shape the approach.

First, `ViewField` already carries the per-step overrides a step gets over a
catalog field: `visible`, `required` and `readonly`. Each one is a boolean or a
CEL expression. In `src/runtime/api.ts`, `resolveFields` reads them per step
and reports the resolved values on `ResolvedViewField`. Validation is the one
field property with no such path: `checkConstraints` reads
`rf.field.validation`, straight off the catalog entry.

Second, `checkConstraints` and the `rule` evaluation sit in one function,
`validateSubmissionData`. Both `submitAndTransition` and
`createProcessInstance` call it. A change at that one site covers both entry
points.

Third, the CEL layer walks a body's expression sites explicitly, in
`src/cel/check.ts`. A new expression position is invisible to it until the
walk names it. The walk already visits `view.fields[].visible`, `required` and
`readonly`. It passes `child` at those three sites for a subprocess step.

Fourth, `src/schema/definition.ts` deserializes stored immutable bodies as well
as validating new ones. A rule that may tighten later belongs on the write
path in `src/schema/compile.ts`, not in a Zod refinement.

## Goals / Non-Goals

**Goals:**

- One catalog field keeps one id and one `instance.data` key while its bounds
  vary per step.
- The override reaches every entry point that validates submitted data,
  through one resolution site rather than one check per caller.
- A malformed override is a publish error, never a runtime throw on an
  immutable body.

**Non-Goals:**

- No participant-facing behavior change. The wire view carries no validation
  today and carries none after this.
- No studio control. An author writes the override in the JSON view; a later
  change gives the form editor a control for it.
- No per-step defaults, options or types. Only `validation` moves.

## Decisions

### The override lives on `ViewField`, not on a new step-level array

`ViewField` is where a step already says what it does differently with a
catalog field, and it is keyed by `ref` already. An author finds the override
next to `required` and `readonly`, and the engine finds it during a walk it
already performs.

The alternative was a separate `step.fieldOverrides` array. It buys a cleaner
split between layout and business rule. It costs a second list to keep in step
with `view.fields`. An override whose `ref` names a field the view does not
show would need its own invariant. It would also need its own decision about
what it means. The split is not worth a rule nobody would remember.

### Two flat keys, not a nested envelope

`validation` and `validationMode` sit flat on `ViewField`, beside the existing
flags. A nested `{ validation, mode }` envelope would read more explicitly. It
would also give the JSON view a deeper shape to author by hand. The schema's
other per-step overrides are all flat.

### The mode is an explicit enum, not inferred

The default is `merge`, because that is what an author wanting one different
bound means. It also keeps the override short. The `replace` mode is named
rather than inferred from a `null` value on a key. Inferring it would make one
key's value change how every other key behaves.

### Resolution happens in `validateSubmissionData`, not on `ResolvedViewField`

`resolveFields` looks like the natural home: it already turns a
`(FieldDef, ViewField)` pair into a resolved per-step view, next to `required`
and `readonly`. It is the wrong home, and the reason is the second caller.

`getInstanceView` (`src/runtime/api.ts:891`) puts the return of
`resolveFields` straight into `InstanceView.fields`, and
`handleInstanceView` (`src/http/routes.ts:251`) answers `body: view`. A
`validation` key on `ResolvedViewField` is therefore a key on the response of
`GET /instances/:id`. That publishes every bound to the participant's browser,
which this change does not do. It would also need an `http-api-documentation`
delta and a change to `docs/openapi.yaml`, neither of which this change
carries. It would settle the shape of the later client-side work in passing.

`ResolvedViewField` stays as it is. `validateSubmissionData` takes `step`
already. It builds a `ref`-keyed map from `step.view?.fields` and calls
`effectiveValidation(rf.field, vf)` at the point of the check.
`checkConstraints` keeps its current signature. It stays a pure function of a
validation object and a value. Both entry points reach the same code, because
`submitAndTransition` and `createProcessInstance` both validate here.

The merge is a shallow spread over the six keys, `{ ...catalog, ...step }`.
No nested member exists on `FieldValidation`, so no deeper merge exists to get
wrong. An explicit `undefined` on a key is not a supported way to unset it.
The schema treats an absent key and an undefined one alike. The `replace` mode
is the way to drop a catalog key.

### Publish-time checks split by where they belong

Two pairing invariants are self-contained and structural: `validationMode`
without `validation`, and `validation` with no key. Both go in `definition.ts`
as a Zod refinement on `viewField`. They can only tighten by rejecting bodies
that were always meaningless. No published body carries either shape, because
neither key exists before this change.

The pattern compile check goes in `compile.ts::checkPatterns`, beside the
catalog walk it extends. It belongs there because it is a write-path check
that may tighten. The maximum length is a number someone may lower.

`checkPatterns` needs no second version. It reads `f?.validation?.pattern`, so
it is envelope-shaped rather than field-shaped. A view field entry passes
through it unchanged. Give it the location prefix `steps[i].view.fields[j]`
and it reports the located error the spec asks for.

A step-level `rule` also needs the expression length bound. That bound is a
separate walk, `compile.ts::collectExpressionSites`. The walk visits
`view.fields[].visible`, `required` and `readonly`. This change adds
`validation.rule` beside them. The same walk starts at `body.workflow.steps`,
so it reaches no catalog `validation.rule` today. That gap predates this
change and stays out of its scope.

### A step-level rule is checked without `child`, on every step

The three existing view-field flags are pushed with `child` for a subprocess
step. They resolve while a child instance can exist. A validation rule
runs inside `validateSubmissionData`, against `buildGuardContext(body,
mergedInstance, actor)`, which registers no `child` and no `result`. The walk
therefore pushes `validation.rule` with `child: false` at every step type.

Passing `child` to match the neighboring flags would type-check a rule
referencing a name that is unbound when the rule runs. Under CEL's total
semantics, a reference to an unbound name makes the guard evaluate to "no
match". The field would then fail validation with no visible cause.

## Risks / Trade-offs

- The field catalog no longer shows every bound that applies to a field → the
  JSON view shows the overrides. The follow-up studio change shows them in the
  form editor. Until then the catalog panel tells a partial truth about a
  field with overrides. So does the field matrix. It draws the per-step flags
  in its cells, and this override belongs in the same place.
- `replace` can silently drop a catalog `rule` an author forgot was there →
  the mode is explicit and named. The spec's scenarios pin the behavior.
  Rejecting an empty `validation` object removes the one shape where the drop
  is invisible.
- The effective validation is computed per submitted field, not cached → it is
  a spread over six keys. It sits beside the type and option checks the same
  loop already runs.
- A migrated instance can hold a value its new step rejects → the participant
  sees it at the next submission. Migration writes data without validating it.
  A tightened catalog bound already behaves this way. This adds no new case.
  It adds another source for the existing one.
- A step-level `pattern` adds another publish-time regex site → the same
  compile and length checks apply, in the same function.

## Migration Plan

None. Both keys are optional and neither exists in any stored body, so every
published version parses unchanged and no `definitionHash` moves. A body
authored with an override fails to parse on an engine built before this
change. That is the ordinary forward-compatibility rule for a contract
addition. It needs no migration step.

## Open Questions

Neither question changes the specs, the approach or the task breakdown. Both
can wait for the follow-up studio change.

- Should the form editor show the effective validation beside the override?
  An author would then see what a `merge` resolves to without the JSON view.
- Should the field matrix mark a cell whose step carries an override, the way
  it marks the other per-step flags?
