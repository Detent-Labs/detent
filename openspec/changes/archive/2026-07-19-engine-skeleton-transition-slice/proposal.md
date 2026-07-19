## Why

The schema/contract layers are done (validation, authoring-time CEL, cancellation
contract), but nothing executes a definition yet. The paradigm's core claim — a
definition advances an instance from one step to the next — is entirely unbuilt.
This change proves that claim with the thinnest runnable slice: one instance,
persisted, taking one manual transition. Everything heavier (outbox, timers,
automatic paths, cancel runtime) rides on the machinery this slice establishes,
so it is built first and deliberately alone.

## What Changes

- Add an **instance store**: create an instance pinned to
  `{ processId, version, definitionHash }`, persist it via `Bun.sql`, and
  rehydrate it against exactly that frozen `ProcessBody`. Rehydration against a
  non-matching body is rejected.
- Add a **transition executor** for a single **manual** path: trigger ordering
  `onExit(source) → onPath → onEntry(target)`, with `transitionSeq` incremented
  monotonically and used as the optimistic-concurrency token (a stale seq loses).
  Exactly one `HistoryEntry` is appended per committed transition.
- Wire **runtime CEL evaluation** of a path guard using the same
  `@marcbachmann/cel-js` library as authoring-time `src/cel/check.ts` — one
  library, no semantic drift.
- Add a **CEL context projection** for the instance: a single function maps the
  runtime `Instance` onto exactly the authoring-time `INSTANCE_SCHEMA`
  (`instanceId → id`; whitelist `{ id, status, transitionSeq, currentStepId }`;
  drop the rest). `INSTANCE_SCHEMA` is the single source of truth for both the
  authoring check and this projection, so they cannot drift.

Out of scope (each a later change, do not build here): transactional outbox and
action dispatch; timer scheduler and crash recovery; the runtime half of
cancellation (specified in `cancellation`); automatic-path priority evaluation.

Two open questions stay open, documented not decided: a dedicated audit event
type for version migrations (deferred until migration lands; `cause: "migration"`
stays a placeholder), and widening the CEL expression context (stays minimal;
widen reactively when a real guard needs it — both additive/non-breaking later).

## Capabilities

### New Capabilities
- `transition-execution`: instance lifecycle (create, persist, rehydrate against
  the pinned frozen body) and execution of a single manual transition —
  onExit/onPath/onEntry ordering, `transitionSeq` as monotonic OCC token, and the
  append of one `HistoryEntry` per transition.

### Modified Capabilities
- `cel-expressions`: adds the engine-side (evaluate) requirements the spec's
  purpose already claims but does not yet state — runtime guard evaluation via the
  shared library, and the runtime-`Instance`→`INSTANCE_SCHEMA` projection whose
  single-source-of-truth guarantee prevents authoring/runtime drift.

## Impact

- New code under `src/engine/` (instance store, transition executor) and a
  projection helper co-located with `src/cel/` so it shares `INSTANCE_SCHEMA`.
- Uses `Bun.sql` + `DATABASE_URL` (existing `persistence` capability); adds no new
  dependency. First code that requires a running Postgres for its tests.
- No change to `src/schema/definition.ts` — the transition consumes the existing
  `Instance` and `HistoryEntry` schemas as-is.
