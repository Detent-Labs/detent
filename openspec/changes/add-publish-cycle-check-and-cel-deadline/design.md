# Design

## Context

See proposal.md for the motivation. The owner settled four points on
2026-09-23, before work on this design started:

- The cycle check runs at publish, and a spawn depth cap backs it at runtime.
- `process.start` chaining stays outside the cycle rule.
- A process that calls itself is a cycle, and publish rejects it.
- CEL gets structural limits at authoring time. It gets no runtime timer.

Three facts about the current code shape the approach.

- **Children publish first.** `validateCrossProcess` in
  `src/engine/definitions.ts` rejects a subprocess step whose child is not
  already published. A cycle therefore never forms inside one publish. It forms
  across versions: A v1 calls nothing, B calls A with `latest-at-spawn`, then
  A v2 calls B. At runtime B's reference now resolves to A v2, and the loop
  spins.
- **Nothing can interrupt `evaluate`.** The library `@marcbachmann/cel-js`
  evaluates synchronously on the event loop. A wall-clock bound needs a Worker
  thread. The library offers parse-time `limits` on the `Environment` instead
  (`maxAstNodes`, `maxDepth`; the defaults are 100,000 and 250).
- **Every checked site goes through `buildEnv` and `checkSite`** in
  `src/cel/check.ts`. Publish and the studio's live validation share them, so
  a check added there reaches both.

## Goals / Non-Goals

**Goals:**

- Publish rejects a body that would close a subprocess cycle. Its message
  names the chain.
- A spawn deeper than 16 levels fails before it creates a child, whatever let
  the cycle through.
- The cost of one CEL evaluation has a bound fixed at authoring time.

**Non-Goals:**

- Cycle detection over `process.start` edges.
- A runtime timer, a Worker thread, or a configurable limit.
- A new field on `Instance` or `ProcessBody`. The depth count reads the
  existing `parent` link.
- Scanning already-published bodies for a cycle. No deployment exists, so no
  published body predates the rule.

## Decisions

### D1. The cycle walk compares process ids and starts at the new body

`validateSubprocessCycle(processId, body, resolvers)` runs a depth-first
search. It starts at the subprocess steps of `body`. Each reference resolves
with the same resolvers `validateCrossProcess` uses. The resolver for `pinned`
is `resolveBody`, and the resolver for `latest-at-spawn` is
`resolveLatestByContract`. The walk throws `CrossProcessValidationError` when
it reaches a child whose `processId` equals the published `processId`. The
message names the path, for example `subprocess cycle: A → B → A`. A visited
set keyed on `processId@version` stops the walk from repeating a shared child.

The comparison uses process ids and ignores versions. A version-exact walk
would let A v2 call B while B pins A v1, since A v1 calls nothing. That chain
terminates, but it is still A calling A, which the owner ruled out. The id rule
is also the simpler one to state in the authoring guide.

Starting at the published body finds every new cycle. A publish changes only
the edges that leave the new version, plus any `latest-at-spawn` edge that now
resolves to it. Every cycle that such a change creates passes through the new
version, so a walk from that version finds it.

The walk runs after `validateCrossProcess` in `publishBody`. By then
`validateCrossProcess` has proven that every direct child resolves. The walk
skips a grandchild that no longer resolves and reports nothing for it. The
child-first rule already ran for that grandchild at its own publish.

Alternative considered: a walk over the whole stored graph on every publish.
It finds nothing more than the walk from the new version, and it costs one
body read per published version.

### D2. The depth cap walks `parent` links in the spawn handler

`MAX_SUBPROCESS_DEPTH = 16` is a constant in `src/engine/subprocess.ts`. On
first delivery, after the test-instance check and before child resolution, the
spawn handler follows `parent.instanceId` upward with `loadInstance`. It counts
the hops and stops at the cap. When the parent's depth is 16 or more, the
handler throws an `Error` that names the step and the cap. A test instance's
refused spawn takes this same path. The outbox retries it, dead-letters it, and
the parent stays parked where an operator sees it.

The walk costs at most 16 row reads, once per spawn. A missing ancestor row
ends the count at the depth reached so far. A redelivery that finds
the child already created skips the walk, as it skips creation.

Alternative considered: a `depth` field on `Instance`, written at spawn. It
saves the reads. But it changes the instance schema for a backstop that fires
only when publish misses a cycle.

### D3. CEL limits live in `buildEnv` and `checkSite`

`buildEnv` passes `limits: { maxAstNodes: 2000, maxDepth: 64 }` to
`new Environment`. When a parse exceeds a limit, `env.check` returns
`valid: false` with the message `Exceeded maxDepth (64)` or
`Exceeded maxAstNodes (2000)`. It does not throw. `checkSite` already turns an
invalid result into a located CEL issue. A probe against the pinned library
confirmed both messages. It also showed that the top level counts toward
`maxDepth`, so 64 nested parentheses already exceed the cap.

The comprehension-nesting check is one helper that walks the parsed AST. It
sits beside `forbiddenTimeCall`, which already walks the same tree. Two
callers run it after a successful parse: `checkSite` and
`validateMigrationSpec`. The second caller keeps its own `env.check` loop, so
a helper in `checkSite` alone would skip every migration transform. A node counts as a comprehension
when it is one of the five macros (`all`, `exists`, `exists_one`, `map`,
`filter`) called on a receiver. The walk tracks the nesting depth. It reports
an issue when a third comprehension opens inside two others.

The tree that `parse` returns keeps the macro call in its source form. The
probe parsed `xs.all(a, xs.exists(b, a == b))` into an `rcall` node named
`all`, whose third child is an `rcall` node named `exists`. The walk matches an
`rcall` node on those five names.

Nested comprehensions drive the cost. One comprehension over a list of n
elements costs n steps, two nested cost n², and three cost n³. A 1,000-row
repeating group makes n³ a billion steps. Two levels cover the patterns that
authors use, such as "every row matches some other row". The node and depth
caps bound the rest of the tree. The 4,000-character source cap stays as it is.

Evaluation in `src/cel/eval.ts` keeps the library's default environment. A
body passed the stricter check at its own publish, and the engine evaluates
only published bodies.

Alternative considered: a Worker thread with a timeout around `evaluate`.
Every guard would pay a thread hop, and a timeout needs a rule for what it
means. The review rates SEC-7 Low, and that cost is out of proportion.

## Risks / Trade-offs

- [An existing example or test fixture exceeds a new limit] → The full test
  suite publishes every example. A red test names the expression. Raise the
  limit only if a real authored pattern needs it, and record why.
- [The studio condition builder emits deep parentheses] → Sixty-four levels
  exceed any group a person builds by hand. The full suite runs the builder's
  round-trip tests, and a red one names the expression.
- [The id rule rejects a terminating chain through an earlier version] →
  Accepted. The owner ruled out self-recursion. Bounded recursion can return as
  its own change when a real case needs it.
- [A direct database write bypasses the publish walk and creates a cycle] →
  The depth cap stops it at 16 levels. The parked parent tells the operator
  where.

## Migration Plan

No data migration. No deployment exists, and the rules apply only to future
publishes and spawns. Rollback is a revert of the change's commits.

## Open Questions

None.
