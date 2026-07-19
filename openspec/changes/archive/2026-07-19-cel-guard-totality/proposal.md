## Why

The `cel-expressions` baseline says expressions are "total" only in the sense of
having no `now()` — it never states what a guard does when it hits a runtime error,
most commonly a field not yet written into `data`. In practice `evalGuard` used to
throw there (via cel-js), which crashes the automatic cascade the instant it enters
a wait-state — a wait-state guard like `data.booking_status == 'booked'` reads a
field that is unset until an async writeback lands. The `reresolve-after-writeback`
change fixed the runtime (`evalGuard` now returns false on a runtime error) and
tested it, but recorded the behavior only in that change's design notes. This
follow-up captures it in the `cel-expressions` baseline so the spec matches the
engine.

## What Changes

- State that runtime guard evaluation is **total**: a guard that errors at runtime
  (e.g. a field absent from `data`) evaluates to `false` and never throws, so the
  path is simply not taken and the instance waits. This is the wait-state idiom.
- No code change: `src/cel/eval.ts` and `test/eval.test.ts` already implement and
  cover this behavior (landed with `reresolve-after-writeback`). This change is
  spec-sync only.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `cel-expressions`: the "Engine evaluates guards with the shared CEL library"
  requirement gains a totality clause and a scenario for a guard on an unwritten
  field.

## Impact

- **Spec**: `openspec/specs/cel-expressions/spec.md` — one MODIFIED requirement.
- **Code**: none (already implemented at `src/cel/eval.ts:70`, tested at
  `test/eval.test.ts`). The tasks verify the existing implementation matches the
  reworded spec rather than adding anything.
