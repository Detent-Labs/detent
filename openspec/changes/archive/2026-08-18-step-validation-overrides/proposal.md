## Why

A field's validation lives on the catalog `FieldDef` and applies everywhere the
field appears. A CAPEX process needs one `betrag` field whose ceiling is 10000
in most steps and 1000 in a "small request" step. Today an author has two
choices: one bound for every step, or two catalog fields. The second choice
costs two ids and two `instance.data` keys. That splits the value a report
reads and a migration maps.

## What Changes

- `ViewField` gains an optional `validation`, the same shape the catalog field
  carries: `min`, `max`, `minLength`, `maxLength`, `pattern`, `rule`.
- `ViewField` gains an optional `validationMode`, either `merge` or `replace`.
  Absent reads as `merge`.
- The runtime resolves an effective validation per step: `merge` overlays the
  step's keys on the catalog's, `replace` drops the catalog entry whole. A step
  may loosen a bound as well as tighten it.
- Publish rejects `validationMode` without `validation`, and type-checks and
  compiles a step-level `rule` and `pattern` the way it already does the
  catalog's.
- No participant-facing change. The wire view carries no validation today and
  carries none after this. A bound is still enforced at submit and reported as
  a submission issue.
- No studio change. An author writes the override in the JSON view. No form
  editor control exists for it yet.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: `ViewField` accepts `validation` and `validationMode`;
  a step-level pattern compiles at publish; `validationMode` without
  `validation` fails to parse.
- `runtime-api`: submission validation reads the resolved effective validation
  for the current step instead of the catalog field's own.
- `cel-expressions`: a step-level `validation.rule` is a checked expression
  site, in the same scope its catalog counterpart gets.

## Impact

- `src/schema/definition.ts`: two optional keys on `viewField`, plus the
  refinement pairing them. Additive, so a stored body parses unchanged and no
  `definitionHash` moves.
- `src/runtime/api.ts`: `validateSubmissionData` resolves the effective
  validation for the step and passes it to `checkConstraints`.
  `ResolvedViewField` does not change. That is what keeps the override off the
  wire, since `getInstanceView` reports that type straight to
  `GET /instances/:id`.
- `src/schema/compile.ts`: `checkPatterns` walks step view fields as well as
  the catalog tree, and `collectExpressionSites` gains the step-level `rule`.
- `src/cel/check.ts`: the view-field walk pushes `validation.rule`.
- Tests: `test/validate.test.ts`, `test/compile-validation.test.ts`,
  `test/cel.test.ts`.
- `docs/authoring-guide.md`: the guide describes no validation rule today, so
  this adds a section on the per-step override rather than syncing one.
- `.claude/rules/authoring-invariants.md`: the pattern invariant it states
  names the catalog alone and now covers a second site.
