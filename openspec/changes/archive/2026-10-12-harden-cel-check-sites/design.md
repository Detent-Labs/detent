# Design

## Context

`src/cel/check.ts` holds the publish-time CEL check. `collect()` lists every
checked site with its scope. `checkSite()` parses one source and runs the AST
checks for time functions and comprehension nesting. Then it calls
`env.check`. Only the deadline site sets `expect`, the result type it demands.
The studio reaches the same code through `validateReferences`, so one change
serves both.

`validateMigrationSpec` runs its own copy of the AST checks and skips
`checkSite`. A new AST rule must reach it too, or a migration transform
escapes.

`src/schema/compile.ts::collectExpressionSites` lists the same sites a second
time for the 4,000-character length bound. It runs on the raw authored body,
before Zod. It reads sites through duck-typed walks such as
`collectActionSites`.

The CEL in an action's `config` reaches neither list. One handler reads CEL
from its `config`: `process.start`. At delivery, `createSeededInstance`
evaluates that mapping over a guard context with `SYSTEM_ACTOR` as the
actor. The context supplies `data`, `instance` and `actor`. It supplies
nothing else.

See `proposal.md` for the reason and `specs/` for the rules.

## Goals / Non-Goals

**Goals:**

- Every CEL source the engine evaluates from a published body passes four
  checks: parse, type, AST bounds and length bound.
- A condition that cannot yield `true` fails at publish. It never fails
  silently at runtime.
- One implementation of each AST rule, shared by every caller.

**Non-Goals:**

- No wall-clock bound on evaluation. The owner ruled that out
  (`docs/decisions-archive.md`, SEC-7).
- No change to `evalGuard`, `resolveFields` or any runtime path. The checks
  run on the publish path alone.
- No schema field. The hash stays as it is, and the studio mirrors
  (`KNOWN_KEYS`, `PROPERTY_WORDS`, `OWNED_LISTS`, `sectionsFor`) need nothing.
- No change to the studio condition builder. `fix-condition-and-path-builders`
  reads the `bool` rule from this change.
- No `bool` expectation in the Tools scratchpad (`checkAgainstFields`). It
  checks an expression outside any site. It gains the `matches` rule and
  nothing else.

## Decisions

**1. `process.start` mapping sites join `collect()`, not `validateReferences`.**
The brief suggested calling `checkSite` from `validateReferences`. That would
create a second site list in `validate.ts`. A direct call of
`validateProcessBody`, as the unit tests make, would then miss the sites.
`collect()` already owns the scope flags per site, so it gets one more source.
That source is the action list from `registry-check.ts::collect`, filtered to
`PROCESS_START_ACTION_TYPE`. `checkProcessChainingTarget` uses the same filter.
Each `inputMapping` value becomes a site at `<action loc>.config.inputMapping.<key>`
with `result: false`, `child: false` and no `expect`.

The studio runs `validateReferences` without a registry, so a malformed
`config` can reach `collect()`. The new code reads `config.inputMapping` only
when it is a plain object. It skips every entry that is not a CEL expression.

Only the known key counts (owner ruling 2026-10-11). A generic walk over every
`{lang: "cel"}` object in any `Plugin.config` would guess a scope for handlers
that do not exist yet. The code carries this comment:

```ts
// ponytail: only process.start reads CEL from its config. A second handler that
// does needs a per-handler hook on HandlerDef that names its CEL sites and scope.
```

**2. `compile.ts` reads the same sites.** The constant moves to the schema
module. `collectExpressionSites` filters `collectActionSites(body)` by action
type and pushes each mapping value. The type name lives in
`src/engine/registry.ts`, and nothing in `src/schema/` imports from
`src/engine/`. The constant moves to `definition.ts`, beside
`RESERVED_ACTION_PREFIX`, and `registry.ts` re-exports it. Every current
importer keeps working. A string literal in `compile.ts` would drift. An
import from the engine would invert the layering.

**3. `bool` reuses the existing `expect` plumbing.** The guard, the three view
flags and both `validation.rule` sites pass `expect: "bool"`. Those two sites
are the catalog rule and the step rule. `checkSite` already accepts `dyn` and
words the issue as `expected bool, got string`.

`checkSubprocessChildRefs` carries the expectation on its guard too. The first
pass types `child.data` as `dyn`, so it accepts a guard that reads a typed child
output alone, such as `child.data.amount`. The second pass types that output,
so it must demand `bool`. A string guard on a subprocess step then draws the
same issue from both passes. The function `validateReferences` drops an issue
that repeats the location and message of one it holds. The migration transform keeps its own
expectation: the target field's type.

**4. One AST helper replaces two copies, and `matches` joins it.** A new
`astProblem(ast)` returns the first message among the time-function ban, the
nesting limit and the `matches` rule. `checkSite` and `validateMigrationSpec`
both call it. The existing message strings stay byte for byte.

The `matches` rule walks the tree like `forbiddenTimeCall` does. Two node
shapes carry a call. The receiver form is `{op: "rcall", args: ["matches",
receiver, [pattern]]}`. The call form is `{op: "call", args: ["matches",
[subject, pattern]]}`. Three failures exist:

- A pattern that is not an `{op: "value"}` node holding a string fails with
  "matches() needs a string literal as its pattern".
- A literal over `MAX_PATTERN_LENGTH` fails with the length bound.
- A literal that `new RegExp` rejects fails with "pattern does not compile as
  a JavaScript RegExp". That is the wording `compile.ts::checkPatterns` uses.

A `matches` call with a missing argument falls through to the type check,
which already rejects the arity.

The tree walk must visit every child. A unary operator (`!`, `-`) keeps its
single operand node in `args`. Other operators keep an array there. The existing walkers for the time-function ban
and the nesting limit skipped that shape. An expression such as
`!data.items.all(a, data.items.all(b, data.items.all(c, true)))` passed
publish with three nested comprehensions. One shared child enumerator now
serves all three walkers. The base requirement "The authoring-time check
bounds an expression's structure" already demands the fix.

The cel-js 8.0.0 library has no overload for the call form `matches(s, "p")`.
Its type check refuses that form, whatever the pattern. The rule still covers
the form, so a library upgrade cannot open the hole.

At publish, the 4,000-character expression bound caps a literal first, because
it equals `MAX_PATTERN_LENGTH`. The pattern bound still matters for a migration
transform, which has no expression bound, and for the scratchpad.

`check.ts` imports `MAX_PATTERN_LENGTH` from `compile.ts`. `compile.ts` does
not import `check.ts`, so no cycle forms. The header comment of `check.ts`
lists its dependency exceptions and gains one line.

The runtime compiles with `new RegExp(pattern)`, so the publish check uses
the same engine. RE2 accepts an inline `(?i)` flag and JavaScript does not.
Such a pattern fails at publish, as it would fail at every evaluation.

**5. The deadline requirement stays, with changed content.** Its last scenario
is "the result-type expectation does not leak to other sites". It claimed that
only the deadline declares an expected type. That claim ends. The name
still states a true rule: the `string` expectation stays at the deadline.

OpenSpec forbids dropping a base scenario from a MODIFIED block. The name
survives, so the block keeps it and restates the content. REMOVED plus ADDED
would copy the same fifty lines for no gain.

**6. The documents change with the code.** `authoring-invariants.md` gets three
bullets: the `bool` sites, `matches` and the mapping sites.
`process-contract.md` gets the same facts in its Expressions section. Its
subprocess-mapping paragraph says a `process.start` mapping follows the same
total-evaluation rule. `docs/authoring-guide.md` teaches the `bool` rule and
the literal pattern to authors.

`docs/decisions.md` loses the audit index entry for this change. Its FIELDS-17
and FIELDS-22 entries state that no check reads a `process.start` mapping
value. That sentence turns false, so both lose it.

**7. Placement.** `definition-contract` asks every new invariant to name its
placement and the criterion behind it. The `bool` rule, the `matches` rule and
the mapping check live on the publish path, in `check.ts` behind
`validateReferences`. They need the CEL library, which `definition.ts` must not
import. Criterion one decides it: a hand-written body must not bypass them.
Criterion two fails, because a published body can already hold a violation.
A refinement in `definition.ts` would strand the instances pinned to it.

The mapping length bound lives in the compile pass, beside the other
`Expression.src` bounds. That pass runs before the hash-hit return in
`publishBody`. The CEL checks run after it.

## Risks / Trade-offs

- **A residual ReDoS stays.** A bounded literal such as `^(a+)+$` still
  backtracks on a long participant string (287 ms at n=26). The pattern length
  bound does not stop that. Owner ruling 2026-10-11 chose parity with
  `validation.pattern`, which carries the same residual. The design adds no
  heuristic, because one has false positives and misses `(a|a)+`. Mitigation:
  `authoring-guide.md` states the residual.
- **`dyn` hides a non-bool.** A guard over a plugin-typed field passes the
  check and can still yield a non-bool at runtime. The deadline site accepts
  `dyn` for the same reason. No further mitigation exists.
- **Fixtures with a non-bool condition now fail.** A test or example body that
  publishes `data.x` as a guard stops publishing. Mitigation: a sweep task
  reads every `examples/` body and runs the full suite. Today `examples/` holds
  9 condition sites, all comparisons. Each fallout gets a comparison.
- **A body published earlier keeps its non-bool guard.** The CEL checks run
  after the hash-hit return of `publishBody`. An identical re-publish skips
  them. Pinned instances keep their behavior. The mapping length bound is the
  exception: it runs in the compile pass, before that return. An identical
  re-publish of a body with an over-long mapping value would now fail. No
  example or template carries one, and instances stay pinned either way.
- **Overlap with the next contract changes.** `tighten-publish-contract-checks`
  and its successors change `compile.ts` and the rules files. The lane merges
  them one after the other. Mitigation: resolve conflicts at the push step.

## Migration Plan

No data migration. Every check runs on the publish path, so a stored body
keeps reading and its pinned instances keep running. A hand-authored body that
breaks a new rule stops publishing until its author repairs it. The repair is
a comparison for a non-bool condition, and a literal pattern for `matches`.

Rollback is a revert of the change commit. No stored row depends on it.

## Open Questions

None. The owner answered both questions of the brief on 2026-10-11: the
pattern rule takes parity with `validation.pattern`, and only the
`process.start` key counts as a CEL site in a plugin `config`.
