## Why

The engine can advance an instance across a *manual* path, but a step whose paths
are `automatic` has no executor: on entry, nothing evaluates its guards or moves
the instance. Automatic paths are the mechanism behind every result-driven and
wait-state transition (e.g. the booking outcome in the expense-approval example),
so without them the engine cannot run any process that reacts to its own data.
The structural contract for automatic paths already exists and is enforced at
authoring time; what is missing is the runtime that acts on it.

## What Changes

- On step entry, the engine evaluates an all-automatic step's paths in ascending
  `priority` order, taking the first path whose CEL guard holds (the guardless
  default, if present, is the highest-priority else-branch). This reuses the
  existing `onExit → onPath → onEntry` machinery, `transitionSeq` concurrency
  token, outbox dispatch, and `HistoryEntry` append — only the *entry trigger* is
  new; the commit path is shared with manual transitions.
- A committed automatic transition records `cause: "automatic"` in its
  `HistoryEntry`.
- **Wait-state semantics**: an all-automatic step where no guard matches does not
  transition — the instance waits (bounded later by a timer, out of scope here).
  This is distinct from a step that always resolves via its default path.
- **Bounded cascade**: entering the target of an automatic transition may land on
  another all-automatic step that resolves immediately. The engine follows this
  chain within a single invocation under an explicit bound (cycle / max-depth
  guard) so a mis-authored loop terminates instead of running forever. The
  bounding strategy is the central design decision (see `design.md`).
- Engine-side CEL **evaluation** of guards against the frozen instance context
  (`data`, `instance`, `actor`, named data-source results) — the runtime
  counterpart to the existing authoring-time CEL check.

Out of scope (owned elsewhere): timer-forced transitions and their guard-bypass,
`Action.output` result-writeback, and any change to the definition schema. The
authoring-time invariants for automatic paths (all-automatic-XOR-all-manual,
unique `priority`, single guardless default at highest priority) already live in
`src/schema/definition.ts` and are **not** touched by this change.

## Capabilities

### New Capabilities
- `automatic-transitions`: how the engine evaluates an all-automatic step's paths
  on entry (priority order, first-matching-guard-wins, guardless default),
  commits the chosen path through the shared transition machinery with
  `cause: "automatic"`, treats a no-match step as a wait-state, and follows an
  automatic cascade under an explicit termination bound.

### Modified Capabilities
<!-- None. transition-execution already scopes automatic-path evaluation OUT as a
     separate capability, and the schema/CEL-authoring capabilities are unchanged. -->

## Impact

- **Code**: `src/engine/transition.ts` (new automatic-evaluation entry point,
  reusing `orderedTriggerActions` and the commit path); engine-side CEL guard
  evaluation wired via the existing `@marcbachmann/cel-js` library.
- **Specs**: new `automatic-transitions` capability; `transition-execution`
  unchanged.
- **Contract**: none — `src/schema/definition.ts` is untouched.
- **Tests**: `bun test` — priority ordering, first-match, guardless default,
  no-match wait, and cascade termination each ship a rejecting/failing case.
