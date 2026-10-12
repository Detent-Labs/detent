# Proposal

## Why

Three gaps in the publish-time CEL check let a body publish that then fails
without a message. The 2026-10-10 audit reproduced all three (A-1, A-3 and
A-4). Published versions are immutable, so each one costs a replacement
version and a migration of every pinned instance.

A guard `data.status` (a string) publishes. At runtime `evalGuard` compares
the result with `=== true`, so the path never matches and every instance
parks. `data.s.matches("(")` publishes too. It throws on every evaluation,
and `evalGuard` turns the throw into `false`. A `process.start` action's
`inputMapping` skips every CEL check. A mapping with `timestamp()` and three
nested `all()` calls produced 0 issues, and `createSeededInstance` then
evaluates it on the outbox worker's event loop with no bound.

## What Changes

- **A-4, owner ruling 2026-10-10.** Publish requires `bool` from five kinds
  of site: a path guard, a view entry's `visible`, `required` and
  `readonly`, and every `validation.rule`. A `dyn` result stays admissible. The
  message reads `expected bool, got <type>`, the wording the deadline site
  already uses. The scenario in `cel-expressions` that says only the
  deadline declares an expected type no longer holds.
- **A-3, owner ruling 2026-10-11.** `matches()` takes only a
  string-literal pattern, in both call forms (`s.matches("p")` and
  `matches(s, "p")`). The check compiles the literal with `new RegExp` and
  bounds it by `MAX_PATTERN_LENGTH`, the same terms as `validation.pattern`.
  A non-literal pattern fails the check. No nested-quantifier heuristic and
  no ban.
- **A-1, owner ruling 2026-10-11.** The CEL values of a `process.start`
  action's `config.inputMapping` join the checked sites. Only that known key
  counts. The scope is `data`, `instance` and `actor`, with no `result` and
  no `child`. The parse and type check, the time-function ban, the
  structure bounds and the 4,000-character length bound apply there.
- `validateMigrationSpec` runs its own copy of the time-function and nesting
  checks. The change folds both copies into one helper and adds the `matches`
  rule there. A migration transform gets the same rule.
- **BREAKING for hand-authored bodies.** A body whose guard, flag or rule
  infers to a type other than `bool` or `dyn` stops publishing. So does a
  `matches` call with a non-literal or non-compiling pattern. A published
  version stays readable, because the checks run on the publish path alone.
- The definition contract text changes in the same commit:
  `.claude/rules/authoring-invariants.md`, `.claude/rules/process-contract.md`
  and `docs/authoring-guide.md`. The change checks every body under
  `examples/` against the new rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cel-expressions`: adds two requirements, one for the `bool` result type of
  a condition site and one for the `matches` pattern. It also restates the
  deadline requirement, because its last scenario says no other site declares
  an expected type.
- `process-chaining`: a `process.start` `inputMapping` value becomes a checked
  CEL site, with its scope and its bounds. The length bound in
  `definition-contract` already covers every `Expression.src`, so that spec
  stays as it is.

## Impact

- `src/cel/check.ts`: `collect()` gains the `process.start` mapping sites.
  The `bool` expectation joins the guard, flag and rule sites. A shared helper
  adds the `matches` check to `checkSite` and `validateMigrationSpec`.
- `src/schema/compile.ts`: `collectExpressionSites` gains the mapping sites,
  so the length bound reaches them.
- `src/schema/definition.ts` and `src/engine/registry.ts`: the
  `PROCESS_START_ACTION_TYPE` constant moves to the schema module, because
  `compile.ts` may not import from `src/engine/`. `registry.ts` re-exports it,
  so every importer keeps working.
- Tests: one rejecting test per rule in `test/`, and one studio logic test in
  `packages/web/test/`. Existing bodies and tests that publish a non-`bool`
  condition need repair.
- Documents: `.claude/rules/authoring-invariants.md`,
  `.claude/rules/process-contract.md` and `docs/authoring-guide.md`, in the
  same commit as the code.
- `docs/decisions.md`: the audit index entry is struck. The `process.start`
  sentences in FIELDS-17 and FIELDS-22 describe a gap this change closes.
- The studio shows the new issues without code change, because it calls
  `validateReferences`. The condition builder (`fix-condition-and-path-builders`)
  must respect the `bool` rule and merges after this change.
