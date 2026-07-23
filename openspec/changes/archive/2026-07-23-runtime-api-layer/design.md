## Context

The engine (`src/engine/`) exposes only in-process TypeScript functions. There
is no boundary a UI (or, later, an HTTP server) can call to run an instance
without knowing engine internals — how to resolve a `ProcessBody`, how to
merge a step's `view` against the field catalog and current data, how to
compute which manual paths are currently available, or how to write submitted
data at all (nothing in the engine validates or writes arbitrary
user-submitted data today; the only existing write paths are `Action.output`,
migration `transforms`, and internal subprocess mapping).

This change adds a **Runtime API Layer**: a new in-process module,
`src/runtime/`, exposing exactly three operations — create an instance, get
"what to display" for an instance, and submit data while triggering a manual
path. It is a library boundary, not a transport: no HTTP server is built here.
An HTTP wrapper (or the editor's future preview/player UI) can sit on top of
it later as a thin adapter, once a concrete consumer exists.

**Revision note.** An earlier draft of this design threaded a submitted
`dataPatch` into `applyStepEntry`'s `extraFields` without specifying its exact
shape, and left `submitAndTransition`'s transaction/locking boundary
unspecified. Both are load-bearing and are now pinned down explicitly below
(see "Committing a data patch correctly" and "Concurrency and row locking"),
because getting either wrong reproduces a bug class the engine's own
`applyStepEntry` docstring already warns about.

## Goals / Non-Goals

**Goals:**
- A single in-process module that a UI or HTTP adapter can call to run an
  instance end-to-end: create, view, submit.
- Resolve a step's `view` against the field catalog and current instance
  data into a display-ready shape (`ResolvedViewField[]`), and compute which
  manual paths are currently available.
- Validate submitted data against `FieldValidation`, `FieldDef.options`, and
  the resolved view before writing it — this validation does not exist
  anywhere in the engine today.
- Write submitted data and commit the triggered transition atomically, reusing
  the engine's existing plan/apply commit seam rather than forking it, without
  losing a concurrent async action writeback and without leaving the
  in-memory `Instance` the cascade continues from out of sync with what was
  just written.

**Non-Goals:**
- **HTTP transport.** No server, no routing, no serialization framework.
  Plain async TS functions only.
- **Auth / actor resolution.** Every function takes an explicit `actor: Actor`
  parameter, exactly as the engine's `executeManualTransition` does today.
  This layer trusts the actor it's given; identifying *who* the caller is
  (sessions, tokens, headers) is a concern for whatever wraps this layer
  later.
- **Assignment / claim enforcement.** `AssignmentState` (`candidates`,
  `claimedBy`) is declared in the schema but the engine enforces it nowhere —
  any actor can trigger any manual path today. This layer matches that
  behavior: `actor.id` is recorded (as `HistoryEntry.actorId`) but never
  checked against `candidates`/`claimedBy`. Claim-based authorization is a
  separate, later feature.
- **List/history endpoints.** Only the three named operations. No "list
  instances", "get history", or similar — add those in a later change if a
  concrete consumer needs them.
- **`FieldDef.default` application.** Verified: nothing in `src/engine/`
  reads `FieldDef.default` today — it is as unbuilt as data-source
  resolution. This change does not change that. A visible-and-required field
  with a declared `default` and no submitted/existing value is still rejected
  as `required-missing`; an author relying on `default` to auto-populate a
  required field is relying on behavior that does not exist yet anywhere in
  the engine, not something this change regresses.

## Decisions

### Module shape

New module `src/runtime/api.ts`, plus additive changes to two existing engine
files — chosen over duplicating commit logic in the new module, per this
repo's rule that a caller whose commit is an ordinary authored hop extends the
plan/apply seam rather than forking it:

1. **`src/engine/definitions.ts`** — `createDefinitionStore`'s returned object
   gains `resolveLatest(processId): Promise<{ version: number; body: ProcessBody } | undefined>`,
   alongside the existing `resolveBody` and `resolveLatestByContract`. Same
   shape as `resolveLatestByContract` minus the contract-hash filter: newest
   `version` for a `processId`.
2. **`src/engine/transition.ts`** — split today's `executeManualTransition`
   into two composable pieces, mirroring how `commitTransition` already
   composes `planStepEntry`/`applyStepEntry`:

   ```ts
   // Commits exactly one manual transition (guard check + commit), with no
   // resolveAutomatic cascade. New, exported.
   export async function commitManualTransition(
     instance: Instance,
     pathId: string,
     body: ProcessBody,
     actor: Actor,
     db: SQL = sql,
     dataPatch?: Record<FieldId, Literal>,
   ): Promise<Instance>

   // Unchanged signature and behavior for every existing caller: now
   // commitManualTransition(...) followed by resolveAutomatic(...).
   export async function executeManualTransition(
     instance: Instance,
     pathId: string,
     body: ProcessBody,
     actor: Actor,
     db: SQL = sql,
     dataPatch?: Record<FieldId, Literal>,
   ): Promise<Instance>
   ```

   Both gain the same optional `dataPatch`. `executeManualTransition`'s
   existing callers pass none and see byte-identical behavior. The runtime
   module calls `commitManualTransition` directly — see "Concurrency and row
   locking" below for why the cascade is deliberately *not* bundled into the
   same transaction as the commit.

The runtime module itself resolves `ProcessBody` internally (via a
`createDefinitionStore` instance it owns), so its callers never touch
`ProcessBody` directly — only `processId`/`instanceId`.

`createInstance` (`src/engine/store.ts`) already accepts an `opts.data` seed
and an optional `opts.instanceId`, so `createProcessInstance` needs no engine
change there.

### Committing a data patch correctly

`applyStepEntry`'s `extraFields` merges into the instance row via `body ||
extraFields::jsonb` (`transition.ts`) — Postgres jsonb `||` is a **shallow**
merge: a `data` key present in `extraFields` **replaces** the row's entire
`data` object, it does not deep-merge individual fields. `migration.ts`
already gets this right — `remapData` returns the complete post-migration
`data` object, not a partial one, and that whole object is what's passed as
`extraFields.data`. `commitManualTransition` MUST follow the same rule:

```ts
const mergedData = dataPatch ? { ...instance.data, ...dataPatch } : instance.data;
```

`mergedData` — the **full** object, not `dataPatch` alone — is what goes into
`extraFields.data`. Passing `dataPatch` directly would silently erase every
field of the instance's `data` that wasn't part of this submission, on every
single call.

The same `mergedData` is also what the target path's guard is evaluated
against, and — critically — `commitManualTransition` passes an instance
carrying `mergedData` (not the original `instance.data`) as the base `instance`
argument to `commitTransition`/`planStepEntry`. This matters for two things
`planStepEntry` derives from its `instance` argument, both of which read
`data` at target-step entry:

- **The armed timer set.** `armStepTimers` evaluates a `deadline` expression
  against the entering instance's projected `data`. If the target step's
  deadline reads a field the submission just set, it must see the merged
  value, not the pre-submission one.
- **The returned in-memory `Instance`.** `planStepEntry` never re-derives
  `data` — its output instance carries whatever `data` its input instance
  had. If `commitManualTransition` passed the *original* (unpatched) instance
  through, the `Instance` it returns — and that `executeManualTransition`
  then feeds into `resolveAutomatic` — would still show the pre-submission
  data, even though the database row was correctly patched via
  `extraFields`. Every automatic guard `resolveAutomatic` evaluates
  immediately after a data-patched manual transition would then be evaluating
  against stale data — a real correctness gap, not a cosmetic one, since a
  manual step routing straight into a result-driven automatic wait-state
  (submit a decision, auto-route on it) is an entirely ordinary process
  shape.

So: `commitManualTransition` builds one `patchedInstance = { ...instance,
data: mergedData }` and threads it through consistently — as the guard
context, as `commitTransition`'s `instance` argument, and (via `mergedData`)
as `extraFields.data` — rather than mixing the original and the merged
instance across these three uses.

### Concurrency and row locking

`applyStepEntry`'s own docstring states the obligation directly: *"A caller
patching `data` must hold the instance row locked (`SELECT ... FOR UPDATE`)
across its read and this commit: the predicate does not protect `data`, since
a post-commit action writeback [`outbox.ts`] `jsonb_set`s a disjoint
`{data,<fieldId>}` path without advancing or checking `transitionSeq`, and a
wholesale `data` patch computed from an earlier read would erase such a
writeback silently even though the predicate still matches."* Both
`migration.ts` (`SELECT ... FOR UPDATE` on the instance row inside its own
transaction) and `subprocess.ts` (same, for the parent row during a
subprocess return) already follow this. `executeManualTransition` never
needed it before this change, because it never wrote a wholesale `data`
patch — its commit touched only `{currentStepId, transitionSeq, status,
timers}`, fields an async writeback never touches. Adding `dataPatch` makes
`commitManualTransition` the first caller of the *manual-transition* path
that needs the same discipline.

`submitAndTransition` therefore does not use `store.ts::rehydrate` (a plain,
unlocked `SELECT`) for its authoritative read. It instead:

1. Opens its own transaction (`db.begin(async (tx) => { ... })`).
2. Inside it, reads the instance row with `SELECT body FROM instances WHERE
   instance_id = $1 FOR UPDATE`, parses it, and resolves + hash-verifies its
   pinned `ProcessBody` (the same check `rehydrate` makes, done manually here
   since the row is locked before the body is known — the same two-step
   "peek raw body for `processId`/`version`, then resolve, then verify hash"
   shape `resolution.ts::drainResolutions` already uses for the same reason:
   there is no column to learn `processId`/`version` from without first
   parsing the row).
3. Runs the field-set boundary and validation (below) against the
   pre-submission committed data, all still inside the transaction/lock.
4. Builds `mergedData`, confirms the target path's guard.
5. Calls `commitManualTransition(instance, pathId, body, actor, tx, data)` —
   passing `tx` (a transaction-scoped client) as the `db` argument, so
   `commitTransition`'s internal `withTransaction(tx, ...)` joins via
   `savepoint` (per `store.ts::withTransaction`'s existing "join one already
   in progress" behavior) instead of attempting a nested `begin`, which Bun
   rejects. The whole read-validate-commit sequence is therefore one
   transaction holding one row lock.
6. Once that transaction commits (the `db.begin` callback returns and the row
   lock releases), `submitAndTransition` calls `resolveAutomatic(committed,
   body, actor, db)` **separately, with the plain (unlocked) `db`** — not
   inside the same transaction.

Step 6 is a deliberate choice, not an oversight: bundling the *entire*
post-submission automatic cascade into the same locked transaction as the
initial commit would hold the row locked for the cascade's duration and would
diverge from how every other caller's cascade behaves today — each hop
commits as its own transaction, with `resolve_state = 'pending'` as the
crash-safety net if the caller's process dies mid-cascade
(`applyStepEntry`'s docstring). Splitting `executeManualTransition` into
`commitManualTransition` + `resolveAutomatic` (both already composed that way
internally) lets `submitAndTransition` lock the row for exactly the one
commit that needs it, then hand the resulting instance to the ordinary,
already-battle-tested cascade path — no new transactional shape for the rest
of the system to reason about.

`createProcessInstance` does not need row locking: `createInstance` inserts a
brand-new row (`INSERT ... ON CONFLICT (instance_id) DO NOTHING`), so there is
no pre-existing `data` for a concurrent action writeback to race against.

### `createProcessInstance`

```ts
createProcessInstance(
  processId: ProcessId,
  actor: Actor,
  opts?: { version?: number; data?: Record<FieldId, Literal> },
  db?: SQL,
): Promise<Instance>
```

- `opts.version` defaults to the newest published version (`resolveLatest`);
  pass it explicitly to pin against an older one.
- `opts.data`, if given, is validated (see **Validation** below) before
  creation — field-set boundary, type, option membership, constraints, and
  `validation.rule` — but **not** the required check. Validating requires a
  guard context (`buildGuardContext` takes an `Instance`), but no instance
  exists yet at this point. `createProcessInstance` resolves this the same
  way `store.ts::createInstance` itself does internally when arming the
  initial step's timers "against itself": it mints the instance id up front
  (`inst_${crypto.randomUUID()}`), derives the initial `status` the same way
  (`initialStep.terminal ? "completed" : "running"`), and builds a stub
  `Instance` — `transitionSeq: 0`, `currentStepId: initialStep`, `data:
  opts.data ?? {}` — to validate against. That exact minted id is then
  passed as `createInstance`'s `opts.instanceId`, so the instance actually
  created is the same one that was validated, not a reconstruction of it.
  Omitting the required check here is a deliberate correction found during
  implementation, not an oversight: requiredness is a transition-time gate
  everywhere else in the engine — `submitAndTransition`'s required check
  fires whenever a step is *left* via a manual path, not whenever an instance
  merely rests on or is created at one. Enforcing it at creation would block
  the ordinary "create an empty instance, then fill in the initial step's
  form via `submitAndTransition`" flow — which is exactly the flow
  `examples/expense-approval.json`'s "capture" step (also the initial step,
  with `amount`/`reason` marked required) depends on.
- Internally, once validation passes: `store.ts::createInstance` (with that
  `instanceId`) followed by `resolveAutomatic`, the existing
  create-then-run-to-rest sequence. The returned `Instance` may already be
  past the initial step if it auto-advances.

### `getInstanceView`

```ts
getInstanceView(instanceId: InstanceId, actor: Actor, db?: SQL): Promise<InstanceView>

type InstanceView = {
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  status: InstanceStatus;
  step: { id: StepId; key: string; label: LocalizedText; type: StepType };
  fields: ResolvedViewField[];
  availablePaths: AvailablePath[];
};

type ResolvedViewField = {
  field: FieldDef;              // catalog def: id, key, label, type, options, validation, fields (if group)
  value: Literal | undefined;   // current instance.data value
  required: boolean;
  readonly: boolean;
  group?: string;
};

type AvailablePath = { id: PathId; key: string; label?: string };
```

Reads use the ordinary (unlocked) `rehydrate`/peek-then-resolve path — a view
is read-only, so there is nothing to race against a concurrent writeback.

- Works for **any** instance status — `status` is always in the result, so a
  caller can tell why `availablePaths` is empty (not running; a subprocess
  wait-state with only automatic paths; a terminal step).
- `fields` contains only the current step's `ViewField`s whose resolved
  `visible` is `true` (default `true` when the flag is absent) — invisible
  fields are omitted entirely, not flagged. `visible`/`required`/`readonly`
  are resolved by evaluating `viewField.{visible,required,readonly}`: a plain
  `boolean` is used as-is; an `Expression` is evaluated with `evalGuard`'s
  total semantics against `buildGuardContext(body, instance, actor)` — the
  same context and semantics path guards already use, since `check.ts`
  validates these expressions at publish under that identical scope. (Note:
  `evalGuard`'s actual signature is `(guard: Expression | undefined, ctx)` —
  it does not accept a raw `boolean`; the boolean/Expression union needs a
  small dispatch, not a direct call.)
- **Group-container fields are excluded from `required`/`readonly`
  resolution and from `submitAndTransition`'s editable field set.**
  `collectFieldsDeep`'s own doc comment confirms a `ViewField` may legitimately
  reference a `FieldDef.type === "group"` container's own id (not just its
  leaves) — but a group container's own id is never a valid key in
  `instance.data` (`orphan-key-inspection`'s invariant: "a group field's own
  id is never a valid key regardless of catalog declaration"). Left
  unhandled, a view field referencing a group container would (a) be
  permanently unsatisfiable if the view also marks it `required` — the
  runtime API would reject every creation/submission on that step forever,
  since `instance.data` can never carry a value under that id — and (b) if
  naively included in the editable set, would let a submission write an
  orphan key into `data`, the exact defect `orphan-key-inspection` exists to
  surface. `getInstanceView` still includes a group-container `ViewField` in
  `fields` (`value` always `undefined`, `required`/`readonly` reported as
  `false` regardless of the view's declaration) so a UI can render the
  grouping/heading; it is never part of the visible-and-required set used
  for the required check, and never part of the visible-and-editable set
  `submitAndTransition` accepts.
- `availablePaths` contains only manual paths on the current step whose
  guard currently holds against `buildGuardContext(body, instance, actor)` —
  paths that don't match are omitted, not flagged. A guardless manual path is
  always included (`evalGuard` treats no guard as satisfied). Since a
  `subprocess`-typed step's paths are schema-enforced to be all-automatic
  (`step`'s superRefine: "a subprocess step is a wait-state: its paths must be
  all-automatic"), `availablePaths` is *provably* empty for a `subprocess`
  step, not just typically so.

### `submitAndTransition`

```ts
submitAndTransition(
  instanceId: InstanceId,
  pathId: PathId,
  data: Record<FieldId, Literal>,
  actor: Actor,
  db?: SQL,
): Promise<Instance>
```

- Rehydrates the instance fresh under a row lock (see "Concurrency and row
  locking" above) — the function takes `instanceId`, not a caller-supplied
  `Instance` snapshot, to keep the whole read-validate-commit sequence inside
  one call and one transaction rather than spanning a round trip through
  whatever wraps this layer later. Two concurrent `submitAndTransition` calls
  on the same instance do **not** race into `ConcurrencyConflict` against
  each other: `FOR UPDATE` serializes them, and the second's read — blocked
  until the first's transaction commits — comes back *fresh*, reflecting the
  first's already-committed result, not a stale pre-commit snapshot. The
  second therefore either succeeds against the new state or fails with
  whatever ordinary domain error applies to it (an unresolvable `pathId` if
  the step changed, `GuardRefused`, `SubmissionValidationError`) — not
  `ConcurrencyConflict`. That error remains reachable exactly where it always
  was: an *unlocked* engine-level commit (a direct `executeManualTransition`
  or `fireTimer` call elsewhere in the system, holding a stale in-memory
  `Instance`) racing against `submitAndTransition`'s locked commit loses when
  it discovers, at its own commit, that `transitionSeq` moved out from under
  it.
- **Field-set boundary:** every key in `data` must be present among the
  *current* step's `visible && !readonly` fields, excluding group-container
  refs (resolved the same way `getInstanceView` resolves `fields`, against
  the pre-submission committed data). A key outside that set is an
  `unknown-field` or `readonly-field` issue — a client can only submit what
  the view actually offered as editable.
- **Validation** (all issues collected, not fail-fast; see below).
- On success: commits via `commitManualTransition(instance, pathId, body,
  actor, tx, data)` inside the locked transaction (data write and step
  transition land atomically under the shared `transitionSeq` predicate),
  then — after that transaction commits — calls `resolveAutomatic` with the
  plain `db`. A guard failure still throws the existing `GuardRefused`.

### Validation

New logic — nothing in the engine validates runtime data against
`FieldValidation` or view constraints today; `validation.rule` is only
type-checked at publish, never evaluated.

For each submitted field (excluding any resolving to a group-container ref,
which is never submittable), against the merged (not-yet-committed) data:

1. **Type match** against `FieldDef.type`, mirroring `check.ts::celType`'s
   existing baseFieldType → shape mapping so the runtime check doesn't invent
   a second, possibly-diverging rule: `string`/`date`/`datetime`/`select`/
   `reference` → JS `string`; `number` → JS `number`; `boolean` → JS
   `boolean`; `multiselect` → array of strings; `file` and a plugin
   (`object`) type → opaque, accepted as-is (the same "unknowable, accept"
   stance the CEL layer takes). `date`/`datetime`/`reference` are checked only
   for being a string here — no ISO-format or referential check — matching
   `celType` mapping all three to CEL `string`; a stricter shape belongs in
   `pattern`/`validation.rule` if an author needs it.
2. **Option membership**: if `FieldDef.options` is declared (non-empty), the
   submitted value (each item, for `multiselect`) must equal one
   `option.value`. This did not exist in the original draft of this design
   and is added because nothing else in the engine constrains a `select`/
   `multiselect` value to its declared option set — without it, an arbitrary
   string would be silently accepted for a field whose whole point is a
   closed choice list.
3. **Constraints**: `min`, `max`, `minLength`, `maxLength`, `pattern`.
4. **`validation.rule`** (CEL, if present): evaluated with `evalGuard`-style
   total semantics against `buildGuardContext(body, mergedInstance, actor)` —
   the identical context `check.ts` type-checks a catalog field's `rule`
   against (no `result`, no `child` — "no step" scope). A rule referencing
   the field's own value does so via `data.<key>`, like any other guard.

Then, over the full merged data (not just submitted keys, and excluding
group-container refs):

5. **Required check** (`submitAndTransition` only — see below): every field
   in the current step's visible-and-required set (resolved pre-submission,
   same as the field-set boundary) must have a defined value in the merged
   data. (See the `FieldDef.default` non-goal above: a declared default does
   not satisfy this check, because nothing applies it.)

`createProcessInstance` runs steps 1–4 against `opts.data` but explicitly
**skips** step 5: requiredness is enforced whenever a step is *left* via a
manual path (every `submitAndTransition` call checks it, regardless of which
path is taken), not whenever an instance is merely created at or resting on
one — see "Decisions › `createProcessInstance`" above for why.

All located issues are collected into one thrown error — mirroring the
existing convention of error classes that carry every located issue at once
(`CelValidationError`, `RegistryValidationError`), rather than failing on the
first problem found:

```ts
export class SubmissionValidationError extends Error {
  issues: SubmissionIssue[];
}

type SubmissionIssue =
  | { kind: "unknown-field"; fieldId: FieldId }
  | { kind: "readonly-field"; fieldId: FieldId }
  | { kind: "type-mismatch"; fieldId: FieldId; expected: string }
  | { kind: "invalid-option"; fieldId: FieldId }
  | { kind: "constraint"; fieldId: FieldId; constraint: "min" | "max" | "minLength" | "maxLength" | "pattern" }
  | { kind: "rule-failed"; fieldId: FieldId }
  | { kind: "required-missing"; fieldId: FieldId };
```

### Error handling summary

| Condition | Error |
|---|---|
| Submitted data violates field-set boundary / type / option membership / constraints / rule / required | `SubmissionValidationError` (new) |
| Target path's guard is false after merging valid data | `GuardRefused` (existing, re-thrown as-is) |
| Instance moved between rehydrate and commit | `ConcurrencyConflict` (existing) |
| Instance pinned to a body that doesn't match what's stored | `PinMismatch` (existing) |
| Unknown `processId`/`version` | plain `Error` (matches existing engine style for unresolvable references) |
| The post-commit automatic cascade re-enters a step already seen in the same advance | `AutomaticCascadeLoop` (existing, re-thrown as-is) — **not** a rejected submission; see below |

`AutomaticCascadeLoop` is qualitatively different from every other row: by
the time it can be thrown, `submitAndTransition`'s own transaction has
already committed — the submitted data was written and the manual transition
took effect. The loop is detected only in the subsequent, separately-run
`resolveAutomatic` cascade (see "Concurrency and row locking"), which marks
the instance `faulted` and throws. A caller catching `AutomaticCascadeLoop`
from `submitAndTransition` must not treat it as "nothing happened" the way
the other rows imply — the write succeeded; the instance is left `faulted`
and a subsequent `getInstanceView` call will reflect that. This is an
existing engine behavior (`resolveAutomatic` has always been able to do this
to `startInstance`/`executeManualTransition` callers); this change surfaces
it through a new entry point rather than introducing it.

## Risks / Trade-offs

- **[Risk]** `commitManualTransition`'s `dataPatch` widens what was
  previously an absolute guarantee ("a manual transition never overwrites
  `data`") into a conditional one. → **Mitigation:** the parameter is
  optional and additive; every existing call site omits it and sees
  byte-identical behavior. The `transition-execution` spec's requirement text
  states the guarantee is conditional on the caller supplying no patch, and
  is tested both ways.
- **[Risk]** Splitting `executeManualTransition` into `commitManualTransition`
  + `resolveAutomatic` changes an internal function's shape. →
  **Mitigation:** `executeManualTransition`'s exported signature and behavior
  are unchanged for every existing caller; the split is purely internal
  decomposition, of exactly the kind `commitTransition`
  (`planStepEntry`/`applyStepEntry`) already demonstrates in this file.
- **[Risk]** Duplicating "which fields are visible/required/readonly right
  now" logic between `getInstanceView` and `submitAndTransition`'s field-set
  boundary could drift. → **Mitigation:** both resolve through the same
  internal helper (view resolution against `buildGuardContext`, with
  group-container refs excluded from required/editable sets), so there is
  one implementation, not two.
- **[Risk]** `submitAndTransition` locks the instance row for the duration of
  its one commit, serializing concurrent submissions to the same instance
  rather than letting them race and lose on OCC. → **Accepted**: this is the
  same trade-off `migration.ts`/`subprocess.ts` already make for the same
  reason (a wholesale `data` patch is not otherwise safe against a concurrent
  async writeback); the lock is held only for one commit, not for the
  subsequent cascade.
- **[Trade-off]** No list/history endpoints means a consumer that wants to
  show "your pending tasks" must build that itself later. Accepted per the
  proposal's explicit non-goal — no concrete consumer needs it yet.
- **[Trade-off]** Option-membership and group-container handling add two new
  concerns beyond the original three-operation scope. Accepted: without them,
  the new validation layer would silently under-validate a `select` field and
  could either wedge a step permanently (an unsatisfiable required
  group-container ref) or write an orphan key — both worse than the small
  added surface.

## Migration Plan

Purely additive: a new module and two additive-but-slightly-more-involved
engine changes (the `executeManualTransition` split, `resolveLatest`). No
data migration, no schema change, no deployment sequencing — this can land
and be adopted incrementally by future consumers. Rollback is deleting the
new module and reverting the two engine changes.

## Open Questions

None outstanding — the transaction boundary, the data-merge shape, and the
validation scope are now pinned down above; remaining detail (exact test
cases) belongs in tasks.md.
