## Context

See proposal.md for motivation. `checkFieldTree` (`compile.ts:533-549`)
runs one `walkFieldsIndexed` pass. It calls `checkPatterns`,
`checkColumnMapping` and `checkFieldKeyFormat` per field, plus an inline
key-length check.

`collectExpressionSites` (`compile.ts:591-639`) runs a second, separate
`walkFieldsIndexed` pass. That pass covers only two field-level positions:
`validation.rule` and `default`. It then continues into a non-field-tree
walk over `body.workflow.steps`. That second walk covers the remaining
expression positions: guards, action outputs, timer deadlines, view field
flags, and subprocess mappings. `checkLengthBounds` (`compile.ts:677-699`)
calls `collectExpressionSites` and bounds every returned `src` by
`MAX_EXPRESSION_LENGTH`.

## Goals / Non-Goals

**Goals:**
- One `walkFieldsIndexed` pass over `body.fields` covers every
  field-tree check: pattern, column mapping, key format, key length, and
  now expression length on `validation.rule`/`default`.
- The checked values, the applied bound, the issue shape and the message
  text all stay the same.

**Non-Goals:**
- Touching the non-field-tree portion of `collectExpressionSites`: steps,
  paths, timers, subprocess mappings. Those positions sit outside
  `body.fields`. `checkFieldTree` has no reason to visit them.
- Finding 67 (`view.renderer` deletion). It stays blocked on the
  audit-environment gate the archived `field-tree-check-consolidation`
  change recorded.

## Decisions

- **Push the field-level expression-length check into `checkFieldTree`
  itself**, as a fourth per-field check beside `checkPatterns`,
  `checkColumnMapping` and `checkFieldKeyFormat`. The alternative was a
  side channel: `checkFieldTree` returning `ExpressionSite`s for
  `checkLengthBounds` to consume. `checkFieldTree` already sees
  `MAX_EXPRESSION_LENGTH`, a top-level constant in the same file. Its
  existing per-field checks already push straight into the shared
  `issues` array. A fifth push keeps that same shape, rather than adding
  a data-passing convention this file does not otherwise use.
- **Alternative considered and rejected**: have `walkFieldsIndexed` itself
  return collected `ExpressionSite`s, threaded out to `checkLengthBounds`.
  That would change `walkFieldsIndexed`'s generic signature to serve one
  caller's need. Today it serves only a `visit` side-effect.
  `checkFieldTree` already owns "the field tree, one pass" as a concept.
  Splitting an expression-length concern's collection from its bound
  check across two functions would add indirection with no reader
  benefit.
- **`collectExpressionSites` keeps its name and its non-field-tree body**.
  It still returns every workflow-level `ExpressionSite`. It drops only
  the `walkFieldsIndexed` call at its top. `checkLengthBounds` calls it
  exactly as before, for those remaining sites.

## Risks / Trade-offs

- [`checkFieldTree`'s stated scope reads narrower than its new job] ->
  name the new check in its doc comment (compile.ts:528-532). It already
  states "one pass over `body.fields`, running per-field checks
  together," so the fix keeps the stated scope accurate.
- [One field's two issues could shift order] -> a `test/` grep found no
  assertion on `structuralIssues`/`compileProcessBody` issue-array
  order. Every such
  test checks only "does the array contain an issue with this
  message/loc." `structuralIssues`' own concatenation order stays the
  same: `checkFieldTree` still runs before `checkLengthBounds`. Only the
  work inside `checkFieldTree` moves one pass earlier.

## Migration Plan

No runtime migration applies here. The change lands as one commit-set
through the normal apply -> verify -> archive cycle. A normal revert
covers rollback: the change is an internal call-site consolidation with
no external contract change.

## Open Questions

None.
