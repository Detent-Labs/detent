## Why

`PONYTAIL-AUDIT.md` finding 7 (2026-07-27 scan): `Action.retry`
(`maxAttempts`/`backoff`/`baseDelay`) is authorable and grammar-checked at
publish (`compile.ts:77`), but `drainOutbox` (`src/engine/outbox.ts`)
ignores it, using a hardcoded `MAX_ATTEMPTS = 5` and
`BACKOFF_BASE_MS * 2 ** (attempts - 1)` for every action regardless of
what it declares. `outbox.ts` already carries a `ponytail:` marker on
`BACKOFF_BASE_MS` saying per-action config is the intended upgrade path.
This is a small net ADD, not a deletion, and a real behavior change to
delivery retry timing — unlike the audit's other findings, the audit
itself calls out that this needs its own OpenSpec change.

Deleting the field instead (the audit's original framing before a
2026-07-27 concept review reversed it) would be a data-corruption change:
`compile.ts:111-114` documents that `authoredProcessBody.parse`'s output
(which strips undeclared keys) is what gets hashed, so a stored body
authoring `retry` would silently lose the key on read, changing the
recomputed `definitionHash` and breaking every instance pinned to that
body (`PinMismatch`). `examples/expense-approval.json` authors `retry`
twice (`:184`, `:236`), so this is not a hypothetical.

Bundled into this same change: two other `definition.ts` dead-surface
findings from this scan that have no capability-worthy content of their
own and so ride along here (matching the established precedent of the
archived `2026-07-24-ponytail-audit-cleanup` change, which bundled
several zero-reference deletions onto its one real
`registry-error-consolidation` delta):

- Finding 6: nine exported `z.infer`/derived type aliases in
  `definition.ts` (`Timestamp`, `DefinitionStatus`, `Compatibility`,
  `Execution`, `RetryPolicy`, `TimerAction`, `PublishedProcessBody`,
  `InstanceFaultedReason`, `InstanceEventKind`) have zero references
  anywhere in `src`, `packages/editor/src`, `test`, or
  `packages/editor/test` — confirmed by repo-wide search during this
  change's review. Every backing Zod schema stays; only the dead alias
  names go, including `RetryPolicy` (the type name, not the `retryPolicy`
  schema or the `Action.retry` field this change wires in — they are
  unrelated: one is a dead TS-only export, the other is live schema this
  change adds a reader for).
- Finding 9: `compatibility` on `processVersion` (`definition.ts:717`) is
  optional, never written by `publishBody`, never read anywhere. The
  wrapper is not part of the hashed `ProcessBody`, so removing it carries
  none of finding 7's hazard. `examples/expense-approval.json:6` sets it,
  so the example moves too. Once findings 6 and 9 both land, the
  `compatibility` enum schema itself becomes fully dead too (no remaining
  reader), so this change retires it as well rather than leaving a new
  zero-reference export behind.

## What Changes

- `drainOutbox` reads `action.retry?.maxAttempts` (falling back to the
  existing `MAX_ATTEMPTS = 5` default) for its dead-letter threshold, and
  `action.retry?.backoff`/`action.retry?.baseDelay` (falling back to
  `"exponential"`/the existing `BACKOFF_BASE_MS = 1000`ms default) for its
  backoff delay computation. An action with no declared `retry` behaves
  identically to today. Retires the `ponytail:` marker on
  `BACKOFF_BASE_MS`, since per-action config now exists.
- Delete nine dead `z.infer`/derived type aliases from
  `src/schema/definition.ts` (finding 6).
- Remove `processVersion.compatibility` and the now-fully-dead
  `compatibility` enum schema (finding 9); remove
  `"compatibility": "compatible"` from `examples/expense-approval.json`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `transactional-outbox`: "Failed delivery retries with backoff and
  dead-letters" currently describes only the fixed global default. This
  change adds that an action's own declared `retry` policy overrides the
  default per-action, while an action with no declared policy keeps
  exactly today's behavior.

## Impact

- Affected files: `src/engine/outbox.ts` (retry/backoff now
  per-action-aware), `src/schema/definition.ts` (dead type aliases and
  `compatibility` removed), `examples/expense-approval.json`
  (`compatibility` key removed).
- No change to `definitionHash` computation, `ProcessBody`'s hashed
  shape, or any authoring-time invariant — `retryPolicy`'s schema and the
  `Action.retry` field are unchanged, only read for the first time;
  `compatibility` lives on the unhashed `processVersion` wrapper.
- An action that already authors `retry` (both actions in
  `examples/expense-approval.json`) now actually gets that policy's
  `maxAttempts`/`backoff`/`baseDelay` applied on delivery failure, instead
  of the global default — a genuine behavior change for those two actions
  specifically, though neither is exercised by a failure path in existing
  tests (their happy-path tests succeed on first delivery).
- No dependency changes.
