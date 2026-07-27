## Why

`PONYTAIL-AUDIT.md` finding 3 (2026-07-27 scan): `src/runtime/api.ts`'s
`typeMatches` and `expectedTypeLabel` are two separate `switch` statements
over the same `BaseFieldType` -> JS-shape grouping, at submission
validation — a trust boundary, since this runs on user-submitted `data`
before it's written. `BaseFieldType` (`src/schema/definition.ts`) is a
closed, 10-member `z.enum`, so a lookup table can cover it exhaustively
with no runtime fallback needed for a *known* field type; only the
genuinely open case — `FieldDef["type"]` being a `Plugin` envelope, not a
`BaseFieldType` string — still needs an explicit opaque-accept branch.

## What Changes

- Replace `typeMatches`/`expectedTypeLabel`'s two switches with one
  `JS_TYPE: Record<BaseFieldType, string>` table plus two short functions
  that read it. The plugin-type case (`typeof fieldType !== "string"`)
  stays an explicit branch ahead of the table lookup in both functions,
  preserving today's opaque-accept/`"any"`-label behavior.
- Table values map every `BaseFieldType` to the exact string
  `typeMatches`/`expectedTypeLabel` already produce for it today:
  `"string"` for `string`/`date`/`datetime`/`select`/`reference`,
  `"number"` for `number`, `"boolean"` for `boolean`, `"string[]"` for
  `multiselect` (checked via `Array.isArray` + per-element `typeof`, not a
  literal `typeof` result), `"any"` for `file`/`group` (opaque, always
  matches).
- Net effect: because `Record<BaseFieldType, string>` is exhaustively typed
  over a closed enum, a future `BaseFieldType` addition becomes a
  **compile-time** error (missing table entry) instead of the current
  switches' silent fail-open `default` — a strictly safer outcome at the
  trust boundary, while every value accepted or rejected *today* is
  accepted or rejected identically after this change.

## Capabilities

### New Capabilities
- `runtime-field-type-check-consolidation`: one structural requirement —
  the field-type -> JS-shape mapping used for both the runtime type check
  and its issue's `expected` label is implemented once, table-driven, not
  as two independently-maintained switches. External behavior (which
  values pass/fail `typeMatches`, and the exact `expected` string on a
  `type-mismatch` issue) is unchanged; this mirrors the repo's established
  pattern for audit-driven mechanism-level dedup (e.g.
  `http-route-handling-consolidation`,
  `registry-config-check-consolidation`).

### Modified Capabilities
None. `openspec/specs/runtime-api/spec.md`'s "A type mismatch is rejected"
scenario (governing `submitAndTransition`'s validation behavior) already
covers this code's *behavior* without pinning the exact `expected` string,
so no requirement text there needs to change — this is purely an
implementation-mechanism change underneath an already-correct behavioral
spec.

## Impact

- Affected file: `src/runtime/api.ts` (`typeMatches`, `expectedTypeLabel`,
  and the new shared `JS_TYPE` table — all module-private, no exported
  signature changes).
- No change to `src/schema/definition.ts`, the JSON process definition
  contract, or any other module. `submitAndTransition`'s externally
  observable validation results (which submissions are accepted, which
  `type-mismatch` issues are raised and with what `expected` value) are
  byte-for-byte unchanged for every currently-defined `BaseFieldType`.
- No dependency changes.
