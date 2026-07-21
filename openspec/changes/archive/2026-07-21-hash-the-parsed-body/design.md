# Design — hash-the-parsed-body

## Context

`compileProcessBody` (`src/schema/compile.ts`) has two exits and both return
input, not parse output: the idempotent early return hands back `body` after a
successful `publishedProcessBody.safeParse`, and the authored path calls
`authoredProcessBody.parse(body)` purely for its side effect (throw on invalid)
and then spreads the original `body` into the sink-injected result. All contract
schemas are Zod default (strip) mode — deliberately, because `definition.ts` is
also the deserializer for stored immutable bodies and must stay permissive on
read. The consequence: unknown keys pass validation, are serialized by
`definitionHash` (JCS canonicalizes whatever is present), and are persisted by
`publishBody` — but every read path (`parseBody` in `definitions.ts`,
`processBody.parse`) strips them. The stored pin hash and the hash of every
resolved body disagree; `rehydrate` refuses with `PinMismatch` on each attempt,
and the outbox/resolution workers requeue forever.

## Goals / Non-Goals

**Goals:**

- The hash covers exactly the body a read returns: strip before hash, on both
  compile exits.
- `publishBody`'s insert path and hash-hit path return the same shape of body
  (the validated, compiled one).
- Regression tests that fail on the current code (publish-with-extra-key →
  round-trip hash stability, rehydrate, no-op re-publish).

**Non-Goals:**

- No schema-mode change: read-path strip semantics stay untouched (strict-mode
  or `.passthrough()` anywhere would either brick stored bodies on read or leak
  unknowns into the hash again).
- No recovery tooling for versions already bricked in a database (none are known
  to exist; see Risks).
- No decision on *rejecting* unknown keys at publish (see Decisions — deferred).

## Decisions

**1. Use the parse output; do not reject unknown keys (for now).**
Two candidate semantics: (a) strip — compile returns the Zod parse result, so
unknowns silently vanish at publish exactly as they already vanish on every
read; (b) reject — a write-path-only strict parse makes an unknown key a publish
error. (b) is friendlier to typo'd optionals but is a *policy* decision (it
forecloses editors round-tripping annotation keys through authored JSON) and
belongs in its own change per the write-path-tightening precedent
(`validateDurations`). (a) is the minimal fix that restores the load-bearing
invariant — hash ≡ read — and is behavior-identical to the read path, so it
introduces no new semantics. Choose (a); note (b) as a possible follow-up lint.

**2. Fix both compile exits, in compile — not by re-parsing in `publishBody`.**
The invariant is compile's to uphold ("the compiled body is what gets hashed"),
and compile has other callers (tests, future tooling) that deserve the same
guarantee. Concretely: the early return becomes `const parsed =
publishedProcessBody.safeParse(body); if (parsed.success) return parsed.data;`
and the authored path spreads `authoredProcessBody.parse(body)` instead of
`body`. A belt in `publishBody` (re-parse before hash) would mask a future
regression in compile rather than prevent it; the tests pin the property at both
layers instead.

**3. `publishBody`'s insert path keeps `definition: body` — which is now the
parsed body.** No structural change needed once compile is fixed; the
consistency with the hash-hit path (`parseBody(row.body)`) becomes real rather
than accidental, and a test asserts both paths return a body that hashes to the
version's `definitionHash`.

**4. Validation order in compile is unchanged.** `validateDurations` keeps
running first over the raw input — it reads only declared fields, so extras are
irrelevant to it, and moving it would change which error an invalid-in-two-ways
body reports first for no benefit.

## Risks / Trade-offs

- [Silent stripping surprises an author whose typo'd key vanishes] → Same
  semantics the read path has always had; the reject-at-publish follow-up (D1
  option b) is the systematic answer, and this change's spec scenario documents
  the strip explicitly.
- [A version already published with extras stays bricked — its stored hash can
  never be recomputed from a read] → No such version is known (the bug requires
  authored extras; the shipped examples and tests publish clean bodies). If one
  exists in a live database, recovery is: re-publish the resolved (stripped)
  body post-fix — it mints a clean version — then `migrateInstances` the pinned
  instances onto it. Out of scope here.
- [Zod parse deep-copies the body → compile output is no longer reference-equal
  to input] → Nothing in the codebase relies on identity of the compiled body;
  hashing and persistence are value-based.

## Open Questions

None — the reject-vs-strip policy question is explicitly deferred, not open
within this change.
