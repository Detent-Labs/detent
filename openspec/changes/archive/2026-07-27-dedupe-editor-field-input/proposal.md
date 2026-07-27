## Why

`PONYTAIL-AUDIT.md` finding 5 (2026-07-27 scan):
`packages/editor/src/player/FieldInput.tsx:60-106`'s `select` and
`multiselect` branches repeat the same 5-line `<option>` map verbatim, and
the `isFreeTextFallback` branch (`reference`/`file`/plugin envelope) and
the final `else` branch (plain `string`) render the exact same
`<input type="text">` line.

## What Changes

- Hoist the `field.options.map(...)` -> `<option>` list into one `options`
  expression computed once, before the `select`/`multiselect` branches,
  and have both branches render it instead of each mapping independently.
- Remove the separate `isFreeTextFallback` early-return branch; since it
  rendered byte-identically to the chain's final `else`, letting
  `reference`/`file`/plugin-envelope types simply fall through the
  `if`/`else if` chain to the existing final `else` (which already
  handles the one remaining `BaseFieldType`, `string`) produces the same
  output with one branch instead of two.

## Capabilities

### New Capabilities
- `field-input-rendering-consolidation`: two structural requirements —
  the option-list rendering for `select`/`multiselect` is computed once
  and reused by both, and free-text-fallback types share the same input
  branch as the plain `string` type rather than a separate copy. External
  behavior (which `<option>` elements render, which types get a text
  input) is unchanged; mirrors the repo's established pattern for
  audit-driven mechanism-level dedup
  (`http-route-handling-consolidation`,
  `runtime-field-type-check-consolidation`,
  `assignment-claim-release-consolidation`).

### Modified Capabilities
None. `openspec/specs/editor-player/spec.md`'s "Field rendering covers
every BaseFieldType" requirement already fully specifies this component's
behavior (including the `reference`/`file`/plugin-envelope free-text
fallback and the dataSource-bound `select`/`multiselect` options
scenario) — no requirement text there changes; this is purely an
implementation-mechanism change underneath an already-correct behavioral
spec, same relationship the prior three consolidation changes had to
their respective behavioral capabilities.

## Impact

- Affected file: `packages/editor/src/player/FieldInput.tsx`.
- No change to any other editor file, the engine, or the JSON process
  definition contract. Every field type renders the identical DOM shape
  (same input types, same disabled/value/onChange wiring, same option
  elements) before and after this change.
- No dependency changes.
