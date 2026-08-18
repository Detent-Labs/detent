## Why

Ponytail finding 65 (`PONYTAIL-AUDIT.md`), residual. `checkFieldTree`
(`src/schema/compile.ts:533-549`) already runs `checkPatterns`,
`checkColumnMapping` and `checkFieldKeyFormat` in one `walkFieldsIndexed`
pass over the field tree. `checkLengthBounds` still runs a second, separate `walkFieldsIndexed` pass
via `collectExpressionSites`. That second pass exists only to find each
field's `validation.rule` and `default` expression. Folding it into the
existing pass removes the last duplicate field-tree walk.

## What Changes

- `checkFieldTree`'s existing per-field visit also checks each field's
  `validation.rule` and `default` expression length.
  `collectExpressionSites` drops its own field-tree walk.
- `collectExpressionSites` keeps its non-field-tree walk (steps, paths,
  timers, subprocess mappings) unchanged -- those positions sit outside
  `body.fields` and `checkFieldTree` never visits them.
- The set of checked values, the applied bound, and the issue message text
  all stay the same. This is a call-site consolidation, not a behavior
  change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None -- no spec-level behavior change. This change sets `skip_specs: true`.

## Impact

Affected file: `src/schema/compile.ts`. No API, schema, or test-observable
behavior change beyond a new regression test for the folded field-level
expression-length check. No dependency impact.
