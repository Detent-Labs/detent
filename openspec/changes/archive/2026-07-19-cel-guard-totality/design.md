## Context

Discovered while verifying `reresolve-after-writeback`: `evalGuard` threw (via
cel-js) when a guard read a field absent from `data`, crashing the automatic
cascade on entry to any wait-state. The fix (return `false` on a runtime error)
landed with that change; this change only aligns the `cel-expressions` baseline
spec with the shipped behavior.

## Goals / Non-Goals

**Goals:**
- Capture runtime guard totality as a normative requirement in the baseline spec.

**Non-Goals:**
- Any code change — the behavior is already implemented and tested.
- Changing authoring-time validation — `result`/unknown-field references are still
  rejected at authoring time; totality is strictly a runtime completion.

## Decisions

### Runtime error → false (not propagate, not require `has()`)
A guard that errors evaluates `false`. Considered and rejected: (a) propagate the
error — breaks the "total" contract the spec already claims and crashes the
cascade; (b) require authors to write `has(data.x) && data.x == …` — the real
`book`/`booking_status` example and the contract both use bare field access, so
defensiveness would be boilerplate on every wait-state guard. False is the safe
boolean completion: an unsatisfiable guard is simply not a match.

### MODIFY the existing evaluation requirement, not a new one
Totality is a property of the existing "Engine evaluates guards with the shared
CEL library" requirement, so it is folded in there (preserving all prior content
and scenarios) rather than added as an overlapping requirement.

## Risks / Trade-offs

- [Masking a genuine expression bug] Returning false on any runtime error could
  hide a malformed guard. → Authoring-time type-checking (a separate, unchanged
  requirement) already rejects unknown fields and type mismatches before publish,
  so a runtime error is essentially a not-yet-written field — exactly the case
  totality is meant to complete to false.
