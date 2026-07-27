## Why

`runValidation` (`packages/editor/src/draft/validation.ts:61-97`) has four
near-identical loops, one per validator dimension (duration, registry, CEL
on the main body, CEL on a subprocess child), each mapping that
validator's `{loc, message}` issue list into `EditorIssue` the same way:
`for (const x of items) issues.push({ ...resolveLoc(body, x.loc), message: x.message, source: "X" })`.
`PONYTAIL-AUDIT.md` (2026-07-26 scan, finding 3) flags this as the same
mapping-loop shape already deduped on the engine side into
`mapConfigIssues` (`src/engine/registry-check.ts`).

## What Changes

- Extract one `pushIssues(issues, body, items, source)` helper in
  `validation.ts` and use it at all four sites (duration, registry, CEL
  main, CEL subprocess-child).
- The Zod-issue mapping (`parsed.error.issues.map(...)`, the early-return
  branch on a structurally-invalid Draft) is explicitly **not** folded
  into this helper — it resolves locations against `draft` (there is no
  parsed `body` yet at that point) using Zod's own `path` field, not the
  other four validators' `loc` string convention, and returns directly
  rather than pushing into the shared `issues` array. Forcing it through
  the same helper would need parameters for both differences, which is
  more indirection than the ~3 lines it would share.

## Capabilities

### New Capabilities
- `validation-issue-mapping-consolidation`: a structural requirement that
  `runValidation`'s four validator-to-`EditorIssue` mapping loops
  (duration, registry, CEL-main, CEL-subprocess-child) share one
  implementation, instead of duplicated inline — the editor-side
  counterpart to the engine's `registry-config-check-consolidation`
  (`mapConfigIssues`). External behavior (each issue's `entityType`/
  `entityId`/`message`/`source`) is unchanged; this capability exists to
  keep the "don't re-duplicate this" constraint from silently regressing.

### Modified Capabilities
None. `editor-live-validation`'s requirements describe validation
*behavior* (which validators run, when, what "not checked" means) — this
change doesn't alter any of that, only how the already-produced issue
lists get mapped into `EditorIssue` internally.

## Impact

- Affected file: `packages/editor/src/draft/validation.ts` only.
- No change to `src/schema/definition.ts`, the JSON contract, or any
  engine validator — `runValidation` still calls the exact same four (plus
  Zod) unmodified engine functions, in the same order, against the same
  inputs.
- No dependency changes.
