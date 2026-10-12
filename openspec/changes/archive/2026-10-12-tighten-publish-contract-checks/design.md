# Design

## Context

`compileProcessBody` has two branches. A body that passes `publishedProcessBody`
returns at once. Any other body goes through `authoredProcessBody.parse` and
gets a sink injected. `publishedProcessBody` checks only that exactly one step
carries the sink id. The shared structural checks run ahead of both branches,
but none of them looks at the sink.

A concrete case: a child body declares `contract.outcomes: ["approved"]` and a
terminal step `{ id: "step_cancel_sink", key: "x", outcome: "approved" }`.
It takes the first branch untouched. When an operator cancels the child,
`cancelInstance` enters that step. The return then carries
`childOutcome: "approved"`, and the parent takes its approval path.

On the A-8 side, `Action.execution` and `Action.idempotencyKey` parse, enter
`definitionHash`, and reach no reader. The owner ruled on 2026-10-12: reject
`"blocking"`, remove `idempotencyKey`.

## Goals / Non-Goals

**Goals:**
- Every body that leaves `compileProcessBody` carries the sink the engine
  injects, in the position it injects it.
- No accepted action key lacks a reader.

**Non-Goals:**
- Blocking delivery, and any author-chosen outbox key.
- A change to `publishedProcessBody`. The read path keeps the sink-count rule.

## Decisions

**D1. Compare against the engine's own compile of the body.** On the early
branch, the compiler strips the compiled content. It parses the rest as an
authored body, injects a sink and compares canonical JSON with the input.
Equality pins every property of the sink at once, including ones nobody
thought of. A property-by-property check needs a new line each time the sink
gains a property. The existing `stripCompiledContent` inverts the injection.
`test/strip-compiled.test.ts` already guards the pair over `examples/`.

Alternatives: (a) check the sink's fields one by one, rejected for the reason
above. (b) Drop the early branch and always compile the stripped body. That
gains nothing, because the equality check gives the same safety and leaves the
output byte-identical.

A probe of the nine files under `examples/` showed
`compile(strip(compile(x))) == compile(x)` for each.

**D2. Extract the injection into one function.** Both branches call
`injectCancelSink(parsed)`. The comparison then cannot drift from what the
authored branch produces.

**D3. The sink check lives on the publish path.** It meets the first
criterion of the `definition-contract` requirement on placement. A
hand-written body must not bypass it, and `publishedProcessBody` lets such a
body through. It cannot live in the schema, because stored bodies from earlier
compiles carry the same sink and must keep parsing. It reports one located
issue, in the shape the other compile-pass checks use. The message tells the
author to remove the sink and let publish inject it.

**D4. `execution` narrows in the schema, by ruling.** The enum becomes
`["async"]`. This tightens the read path. A stored body with `"blocking"`
stops parsing, and its pinned instances park. No deployment stores one, and
the project stage allows it. A compile-pass check on a wide enum would keep
old bodies readable, but the owner chose the enum.

**D5. `idempotencyKey` leaves the schema.** `checkUnknownKeys` walks the Zod
schema, so removal alone makes publish reject the key, `null` included. A
stored body that set the key still parses, because Zod strips unknown keys on
read. Its recomputed hash then differs from the stored one. An instance
pinned to that version fails with `PinMismatch`. Only dev databases that seed
the two examples hold such a version.
Honoring the key would need a per-instance template, since one constant would
dedupe a delivery across all instances.

**D6. The new rejection reuses the existing path.** The early branch throws
`CompileValidationError`. `validateStructure` already catches it and reports
`structural: "ran"`. `publishBody` rethrows it. The HTTP table maps it to a
422 of type `compile-validation`. A publish-level test covers that path,
because the unit test of `compileProcessBody` does not. Before this change,
`validateStructure` ignored the Zod issues for a body that took the early
return. That gap let the lookalike through.

## Risks / Trade-offs

- An older compiler may have published a body with another sink label. That
  body fails the comparison on re-publish → no such body exists before 1.0.
- The early branch compiles twice → only published-shaped input pays, once
  per publish, the cost of one authored compile.
- The Studio flags `idempotencyKey` in old drafts as an unknown key → the
  author deletes the line.

## Migration Plan

No deployment runs this engine, so nothing migrates. A dev database that
seeded `expense-approval` or `purchase-requisition` before this change needs
a reset and a reseed. Its pinned instances fail with `PinMismatch` otherwise.
The sweep edits two
files under `examples/` in the same commit as the schema change. Rollback is
a revert of that commit. A revert restores the old acceptance of a stray sink,
the `"blocking"` value and the `idempotencyKey` key.

## Open Questions

None. The owner settled `idempotencyKey` and `execution` on 2026-10-12.
