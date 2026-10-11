# Area B: Engine (`src/engine/`)

State: HEAD `5f41cd8a`, read only. Read in full: `store.ts`, `transition.ts`,
`outbox.ts`, `host.ts`, `poll.ts`, `timers.ts`, `resolution.ts`, `definitions.ts`,
`subprocess.ts`, `migration.ts`, `duration.ts`, `admin-queries.ts`, `retention.ts`,
`drafts.ts`, `instance-drafts.ts`, `seeded-create.ts`, `idempotency.ts`, `registry.ts`,
`reporting.ts`, `instance-query-source.ts`, `assignment-strategies.ts`, `ui-strings.ts`,
`templates.ts` (from `:90`). Skimmed: `registry-check.ts`, `config-descriptor.ts`.

## Findings

### B-1: A subprocess step exits on entry when a path without `child` matches

- Case: `examples/subprocess-loan-parent.json`, step `check` (subprocess).
  - An author makes the path `rejected` the else branch: no guard,
    `priority: 2`. The file `authoring-invariants.md` allows this explicitly:
    a guardless default at the highest priority.
  - The call `startInstance` creates the instance at `submit`. The function
    `resolveAutomatic` takes `submit -> check`. The commit enqueues
    `core.spawnSubprocess`.
  - In the next loop round, `check` is all-automatic and not terminal. So the
    loop calls `selectAutomaticPath` with no `child` in the context. The guard
    `child.outcome == "approved"` throws, and `evalGuard` returns `false`. The
    guardless path returns `true`.
  - The instance moves to `rejected` at once. It is `completed` before any
    child exists. The spawn arrives later, sees `parent.status !== "running"`
    and creates no child. So the engine rejects every loan without a check.
  - If the else target is not terminal, the spawn still creates the child. It
    checks only `status`. The child then runs orphaned, and its return is a
    silent no-op.
  - The same holds for every guard that turns true without `child`
    (`data.skip == true`).
- Location: `src/engine/transition.ts:835-844` (no exception for
  `step.type === "subprocess"`), `:764-770`. Also `src/cel/eval.ts:163-170`
  (guardless = `true`, throw = `false`) and `src/engine/subprocess.ts:82-83`.
  Also `src/schema/definition.ts:947-950` (the only subprocess path rule: no
  manual paths). Also `src/cel/check.ts:248-258` (guard env with `child`, but
  no duty to read `child`).
- Severity: high. It breaks "Subprocesses are synchronous call-and-return
  only". The spec `openspec/specs/subprocess-execution/spec.md:10` says "the
  parent parks until the child reaches a terminal step". Nothing enforces
  `:174-176`, "MUST have all-automatic paths ... that guard on
  `child.outcome`".
- Evidence: confirmed. The auditor read the code paths above. Runtime proof is
  missing (repro R1).
- Counter-evidence sought:
  - `compile.ts`: a grep for `subprocess`/`child.outcome`/`guardless` finds
    only mapping checks.
  - `check.ts:248-290`, the `definition.ts` superRefine, the `validate.ts`
    path.
  - `resolveAutomatic` and `planStepEntry`: neither stops at subprocess steps.
  - `test/subprocess.test.ts`: a guardless default sits only in the child
    (`:725`), never at the subprocess step.
  - `docs/authoring-guide.md:850-856` only advises a guard on `child.outcome`.
  - The auditor found no protection.
- Known: new.
- Suggestion: `resolveAutomatic` returns at once at a step with
  `type === "subprocess"`. Only the return handler may leave such a step. It
  commits the first hop itself (`subprocess.ts:287`). Add a publish rule too:
  "every path of a subprocess step carries a guard that reads `child`". This
  needs an OpenSpec change (`authoring-invariants.md`,
  `docs/authoring-guide.md`).

### B-2: The child runs on when the parent leaves the subprocess step without a return. An old return hits a new wait state

- Case: a subprocess step S has a timer `PT1H`. Its `targetPath` names a path
  back to S.
  - A second form: S leads to a manual step "Escalation", then to "Retry",
    then back to S.
  - Entry at `transitionSeq` 3 spawns child C3
    (`subprocessChildId(parent, 3, S)`). C3 waits at a manual task.
  - The timer forces the path and bypasses the guard. The parent enters S again
    with seq 4 and spawns C4. The engine does not cancel C3.
  - Later someone completes the task of C3. The return handler checks only
    `parent.currentStepId === childInst.parent.stepId`. Both are S.
  - So the handler writes the `outputMapping` of C3 into the parent. It moves
    the parent on per the outcome of C3, while C4 runs. The later return of C4
    is a silent no-op.
  - Without a re-entry, C3 stays as an orphaned running instance with tasks and
    actions.
  - A third trigger is a migration that relocates the instance away from S
    while the spawn is still `pending`. The live-child gate looks only for
    existing children. The spawn arrives later and still creates the child.
- Location: `src/engine/subprocess.ts:195-210` (no match on the child id).
  Also `:82-83` and `:158-162`: the spawn and the backstop check only
  `status`. They ignore the step and `parentSeq`. Also
  `src/engine/transition.ts:883-890` (timer exit with no child cancel) and
  `:612-641` (the engine clears children only on cancel). Also
  `src/engine/migration.ts:431-446`.
- Severity: high. Child and parent run in parallel, which is a fan-out. The
  spec expects a timer at a subprocess step:
  `subprocess-execution/spec.md:216-219`, `subprocess.ts:280`.
- Evidence: confirmed. The auditor read the code. Runtime proof: repro R2.
- Counter-evidence sought: all writers of `parent` links (grep `parent` in
  `transition.ts`, `subprocess.ts`, `migration.ts`). Also `timers/spec.md`,
  `subprocess-execution/spec.md:132-260` and `cancellation`. Nothing cancels
  the child when the parent leaves S. Nothing checks the child id on return.
- Known: new.
- Suggestion: the spawn handler creates the child only when
  `parent.currentStepId === subprocessStepId`. A commit that leaves a
  subprocess step cancels its running child, like the cancel sweep. The return
  checks the expected child id. For that, the parent must carry the id of its
  active child. A derivation from `transitionSeq` breaks after an identity
  migration. This needs an OpenSpec change (`subprocess-execution`, an
  instance field).

### B-3: `process.start` and `instance.transition` resolve assignments with the static registry only

- Case: the start step of process B has
  `assignment.strategy = {type: "org.group-members", config: {groupId: "group_finance"}}`.
  - Process A starts B through `process.start`. The handler builds
    `createDefaultAssignmentRegistry()` from `src/engine/registry.ts`. That
    registry knows only `static`.
  - The function `resolveStepAssignment` finds no entry. It writes
    `candidates: []` and an `assignment.unresolved` with `no-candidates`. The
    started instance has no assignee.
  - The same holds for every step that `instance.transition` and its cascade
    enter on the target instance. It holds for all three `org.*` strategies.
  - Cause: two functions share one name. The one at `registry.ts:193` knows
    only `static`. The one at `assignment-strategies.ts:127` knows all four.
    The file `server.ts:20` imports the right one, and both handlers import the
    wrong one.
- Location: `src/handlers/process-start.ts:27-32`, `:48`, `:79-91`, `:98`.
  Also `src/handlers/instance-transition.ts:25-30`, `:129-131` and
  `src/engine/registry.ts:193-197`. Also
  `src/engine/assignment-strategies.ts:12-16`, `:127-133`.
- Severity: high. Shipped strategies have no effect in two shipped handlers.
  The trigger is realistic.
- Evidence: confirmed. The auditor read the imports and the calls. The type
  `HandlerContext` (`registry.ts:50-63`) passes no registry through.
- Counter-evidence sought: the callers of `startEngine`. At `server.ts:902`,
  the engine passes the org registry only to the worker and the subprocess
  handlers. Also `HandlerContext` and the tests. No test combines
  `process.start` or `instance.transition` with an `org.*` strategy. The test
  `test/validate-sequence.test.ts:241` checks publish only.
- Known: new. Area: the root sits in `src/engine`, the call sites in
  `src/handlers`.
- Suggestion: add the assignment registry to `HandlerContext`, filled from
  `tenantContexts` in `host.ts`. Delete the constructions inside the handlers.
  Rename the static factory in `registry.ts` to
  `createStaticAssignmentRegistry`, so the two names no longer collide.

### B-4: The outbox lease spans the whole 100-row batch, the deadline one row. The transaction `tx2` does not check whose claim it is

- Case: two engine processes. The runbook supports this
  (`docs/runbooks/deployment.md:162-173`).
  - Process A claims 100 rows at t0, with `claimed_at = now()` for all. The
    target endpoint hangs. Each delivery ends after the `http.request` default
    of 5 s.
  - Row 7 starts at t0+30 s and gets a fresh 30 s deadline. From t0+30 s on,
    process B sees rows 7-100 as expired. B claims them again (`attempts` +1)
    and delivers in parallel.
  - Consequence (1): the external effect runs twice.
  - Consequence (2): the `tx2` of A hits the claim of B. All three CAS check
    only `status = 'claimed'`. The transient branch sets `pending`, resets
    `attempts` to the old value of A and sets `claimed_at = NULL`.
  - The later success `tx2` of B then finds `pending`. It discards the
    writeback of B with its outcome ("already delivered by a peer").
  - If A reaches the limit, A sets `dead-letter`, though B delivered with
    success. The writeback of B is then lost for good.
- Location: `src/engine/outbox.ts:195-204` (lease from the claim), `:236-238`
  (deadline from the row start). Also `:250-252`, `:335-337`, `:350-352` (CAS
  with no claim marker). The ponytail comment at `:48-50` ("30s covers
  ordinary handler I/O") misses the batch.
- Severity: medium. It needs operation with several processes and a backlog.
  It breaks a rule in `transactional-outbox/spec.md`:
  `The deadline SHALL be the claim lease, because a delivery still running past its lease holds a row another worker may already have claimed`.
- Evidence: confirmed for the mechanism. The auditor read the lines.
  Consequence (2) stays assumed until repro R5.
- Counter-evidence sought:
  - `host.ts:326`: one outbox worker per process, so only operation with
    several processes is exposed.
  - The writeback version check at `outbox.ts:316-321` guards only against a
    migration.
  - The idempotency key at the handler guards only when the target
    deduplicates.
- Known: ERR-1 and ARCH-1 from `CODE_REVIEW-2026-07-29.md:210`, `:308` count
  as fixed (`bound-async-delivery`). This gap is new.
- Suggestion: set the deadline per row to `claimed_at + leaseMs - now()`. Skip
  rows with an expired lease in the batch. Make every `tx2` CAS also check
  `attempts = ${attempts}` (or `claimed_at`).

### B-5: A row whose `tx2` always fails gets delivered again forever and never reaches dead-letter

- Case: an `http.request` with `output: {field_note: "result.note"}` receives
  `{"note": "a\u0000b"}` from the external system.
  - The handler succeeds, and `tx2` writes `(${[val]}::jsonb)`. Postgres
    rejects `\u0000` in `jsonb` (assumed, repro R4).
  - The `tx2` throws, and the row catch leaves the row `claimed`. After 30 s
    the next pass claims it again (`attempts` +1). It runs the handler again,
    forever.
  - The code checks the limit only in the failure branch of `tx2`. The claim
    does not filter on `attempts`.
  - The same holds for a handler that ends the process every time. It also
    holds for the spec's own case "a writeback whose target path is
    malformed".
  - The `fieldId` schema checks only the prefix `field_` (`definition.ts:24`).
    A field id with `,` or `}` alters the array literal `{data,${fid}}`. The
    comment "fieldId is a validated field_<uuid>" is wrong.
- Location: `src/engine/outbox.ts:334` (the only limit check), `:355-362`,
  `:195-204`. The comment at `:189-194`, and `:277-279`, `:300-301`. Also
  `src/engine/outbox.ts:317`.
- Severity: medium. The trigger is unusual. The effect: external side effects
  repeat without bound every 30 s.
- Evidence: confirmed for the control flow, assumed for the `\u0000` trigger
  (R4).
- Counter-evidence sought: the claim query (`outbox.ts:195-204`, no
  `attempts` filter). In `admin-queries.ts`, requeue and discard apply only to
  `dead-letter`. The spec scenario `transactional-outbox/spec.md:118-123`
  requires "repeated abandonment reaches the maximum and dead-letters". This
  code breaks it.
- Known: `CODE_REVIEW-2026-07-29.md:210` (ARCH-1) counts as fixed. The fix is
  incomplete.
- Suggestion: in the claim, set rows with `attempts >= max` straight to
  `dead-letter`, or dead-letter them before the handler runs. Bind the path as
  `ARRAY['data', ${fid}]`.

### B-6: Completed instances keep `resolve_state = 'pending'`. The claim scan grows with the lifetime

- Case: `examples/subprocess-credit-check-child.json`.
  - The spawn creates the child with `resolve_state = 'pending'`. The inline
    cascade takes `decide -> approved`.
  - The terminal commit leaves `resolve_state` unchanged
    (`ELSE resolve_state`). The child then stays on `completed` + `pending`
    for good.
  - The same holds for every cascade whose last hop ends terminal through a
    running intermediate step. It also holds for hops of several steps in the
    worker. The intermediate hop overwrites `claimed` with `pending`, and the
    CAS clear matches nothing.
  - The worker claim runs every 500 ms per tenant over `instances_resolve_idx`
    (`pending`). For each row it reads `body->>'status'`, which detoasts the
    whole body. Then it discards the row.
- Location: `src/engine/transition.ts:396`. Also `src/engine/store.ts:1279-1280`,
  `:198` and `src/engine/resolution.ts:61-71`, `:114-115`.
- Severity: medium. The load grows with every instance that ends this way.
- Evidence: confirmed for the flags, assumed for the scale (R6).
- Counter-evidence sought: all writers of `resolve_state`. A git grep finds
  only the four sites above. The spec `automatic-transitions/spec.md:77-80`
  does not mark, but it does not clear either.
- Known: new. PERF-1 concerns the fixed interval. It does not concern this
  set.
- Suggestion: write `ELSE 'idle'` instead of `ELSE resolve_state` for results
  that are not running. Move the claim to the column `status`. Add a partial
  index `(instance_id) WHERE resolve_state <> 'idle'`.

### B-7: With `DATA_RETENTION_DAYS` set, the retention sweep reads every unredacted instance every 500 ms

- Case: `DATA_RETENTION_DAYS=30`, 200k instances, 20k of them running.
  - Each tick queries
    `redacted_at IS NULL AND body->>'status' IN (...) AND COALESCE(...) < now() - 30 days`.
  - With nothing to redact, Postgres must check all unredacted rows with their
    bodies. It does so twice per second, for a rule with a resolution of one
    day.
  - The partial index `WHERE redacted_at IS NULL` holds this majority.
    Its comment "most rows are NULL forever, so a partial index stays small"
    contradicts itself.
- Location: `src/engine/retention.ts:97-106`. Also `src/engine/store.ts:284-287`
  and `src/engine/host.ts:329-331`.
- Severity: medium (only with retention enabled).
- Evidence: confirmed for the query and the interval, assumed for the scale
  (R7).
- Counter-evidence sought: other indexes on `status`/`currentStepEnteredAt`.
  None covers this combination. The PERF-1 entry (`docs/decisions.md:839`)
  does not name retention.
- Known: new.
- Suggestion: give the sweep its own interval, in minutes instead of 500 ms.
  Move the predicate to the column `status` with a matching index. Fix the
  comment.

### B-8: Worker ticks run tenant by tenant in series. A hung target of one tenant stops the outbox for all

- Case: SaaS mode. Tenant X has 100 due `http.request` actions against a hung
  target.
  - The outbox tick works through the batch of X first: 100 × 5 s default =
    500 s. With a declared `timeout`, it takes up to 100 × 30 s = 50 min.
  - Only then does tenant Y get its turn. The spawns, returns and writebacks
    of Y wait that long.
- Location: `src/engine/host.ts:315-323` (a sequential loop), `:326`. Also
  `src/engine/outbox.ts:202`, `:236` and `src/handlers/http.ts:24`.
- Severity: medium. It is a tenant boundary on availability, with no effect
  on data.
- Evidence: confirmed. The auditor read the code.
- Counter-evidence sought: workers per tenant. There are none ("worker COUNT
  stays four", `host.ts:294-295`). A time budget per tick: there is none.
- Known: new. PERF-1 (`docs/decisions.md:839`) concerns the query cost per
  tenant.
- Suggestion: work through the tenants of a tick in parallel, with a bound. As
  an alternative, give each tenant a time budget per tick.

### B-9: Not every reader cross-checks the pin hash

- Case: the timer worker, the subprocess spawn and return, and the cancel
  sweep fetch the body through `resolveBody(processId, version)`. They do not
  check `definitionHash`. The module `resolution.ts` and `rehydrate` do. A
  restore or a manual change to a `definitions` row would pass there with no
  notice.
- Location: `src/engine/timers.ts:72-82`. Also `src/engine/subprocess.ts:78`,
  `:85`, `:212`, `:221` and `src/engine/transition.ts:624-630`. For comparison:
  `src/engine/resolution.ts:97-101`, `src/engine/store.ts:1336-1345`.
- Severity: low. Bodies stay immutable through the primary key, and no code
  rewrites `definitions`.
- Evidence: confirmed.
- Known: new.
- Suggestion: check the hash in `createDefinitionStore().resolveBody` against
  `definitions.definition_hash`, once per cache entry.

### B-10: Doc drift: assignment resolution also runs under the row lock on submit

- Case: the function `submitAndTransition` passes `tx` (with `FOR UPDATE`) to
  `commitManualTransition`.
  - The function `commitTransition` calls `resolveStepAssignment(..., db=tx)`.
  - The comments in `registry.ts` and `transition.ts` say that only the
    subprocess return resolves under the lock. They also call the timeout
    safe, because the orphaned query holds "a different pool connection".
  - With `tx`, the query shares the connection of the transaction. The effect
    on the lock duration is assumed.
- Location: `src/engine/registry.ts:155-156`, `:244-251`. Also
  `src/engine/transition.ts:438-449` and `src/runtime/instances.ts:312-347`.
- Severity: low.
- Evidence: confirmed for the call path.
- Known: related to `docs/decisions.md:405-420`, which keeps the return path
  under the lock on purpose. That entry does not name the submit path.
- Suggestion: fix the comments. Check whether the submit path can resolve
  before the lock.

### B-11: The admin outbox list has no index for its sort order

- Case: the outbox screen loads unfiltered by default (`statusFilter = ""`).
  - The function `listOutbox` sorts `ORDER BY created_at DESC, idempotency_key DESC`.
    Only `(status, next_attempt_at)` and `(instance_id)` exist.
  - The engine never deletes delivered rows. So every page load and every next
    page reads and sorts the whole table. Beside it, `countOutboxByStatus`
    runs as a full aggregate.
- Location: `src/engine/admin-queries.ts:97-110`, `:121-124`. Also
  `src/engine/store.ts:158`, `:183` and
  `packages/web/src/areas/admin/screens/OutboxScreen.tsx:137`, `:149`.
- Severity: low (an admin-area view).
- Evidence: confirmed.
- Known: the record already names the buffer form
  (`docs/decisions.md:38-43`). The missing index is new.
- Suggestion:
  `CREATE INDEX outbox_created_idx ON outbox (created_at DESC, idempotency_key DESC)`.

### B-12: Exponential backoff without a cap, `retry.maxAttempts` without a bound

- Case: an author sets `retry: {maxAttempts: 30, backoff: "exponential"}`.
  Try 25 waits `1000 ms × 2^24`, about 194 days. Try 30 waits about
  17 years. The row stays `pending` with `next_attempt_at` far in the future.
  In practice it never reaches `dead-letter`.
- Location: `src/schema/definition.ts:615-619` (`maxAttempts: z.number()`).
  Also `src/engine/outbox.ts:35-46`.
- Severity: low.
- Evidence: confirmed.
- Known: new.
- Suggestion: cap the backoff at a maximum. Write `maxAttempts` as a positive
  integer with an upper bound. This needs an OpenSpec change (definition
  contract).

### B-13: `P1D` means exactly 24 h. Across a daylight saving change, the time of day shifts

- Case: a reminder `P1D`, entered on Saturday 28.03.2026 at 09:00
  Europe/Zurich (08:00Z).
  - It falls due on 29.03 at 08:00Z. That is 10:00 local time instead of
    09:00.
  - The engine stores the time correctly in UTC (`timestamptz`, ISO with
    `Z`).
  - The guide names only months and years as calendar-dependent. It does not
    say that days and weeks are fixed at 24/168 h.
- Location: `src/schema/definition.ts:136-148`. Also
  `src/engine/duration.ts:36-38` and `docs/authoring-guide.md:790-791`.
- Severity: low (docs).
- Evidence: confirmed.
- Known: the ponytail comment at `duration.ts:5-7` (calendar units) does not
  name DST.
- Suggestion: add one sentence to the guide.

### B-14: Exports without an importer, and a duplicate name

- Case: these exports have no reference outside their own file.
  - The auditor ran a word search over all 583 versioned TS files, `test/`
    included. LSP was unusable, since TypeScript 7.0.2 ships no
    `tsserver.js`.
  - The exports: `groupMembersStrategyDef` (`assignment-strategies.ts:76`),
    `actorFromFieldStrategyDef` (`:107`), `staticAssignmentStrategyDef`
    (`registry.ts:180`), `dataListColumn` (`host.ts:106`).
  - Also `MAX_DRAFT_ENVELOPE_BYTES` in `instance-drafts.ts:15`, with the same
    name as `drafts.ts:104`.
  - The duplicate name `createDefaultAssignmentRegistry` is the root of B-3.
- Severity: low.
- Evidence: confirmed by a full-text search.
- Known: precedent in `docs/decisions.md`, Refused simplifications no. 41.
  Exports without an importer lose `export`.
- Suggestion: remove `export`. Import the second constant from `drafts.ts`.

### B-15: Simplification: backward migrations in `initSchema` and duplicate queries in reporting

- Case: before 1.0, with no deployment (`CLAUDE.md`: "nothing deployed to
  preserve"), every start runs retrofits for old databases. For example:
  - The statement
    `UPDATE outbox SET field_version = ... WHERE field_version IS NULL` scans
    the whole outbox with no index.
  - The statement `DROP INDEX IF EXISTS` runs for three old indexes.
  - Many `ADD COLUMN IF NOT EXISTS` statements stand in for columns in the
    `CREATE TABLE`.
  - In reporting, `cycleTime` and `sla` read the history twice (`scan`, and
    then again).
- Location: `src/engine/store.ts:184-190`, `:330-332`. Also
  `src/engine/reporting.ts:207`, `:261`, `:400`.
- Severity: low.
- Evidence: confirmed.
- Known: new. The record already names the reporting materialization itself
  (`docs/decisions.md:24-36`).
- Suggestion: fold the retrofits into the `CREATE TABLE` statements. Let
  `scan` return the history as well.

### B-16: `tx.unsafe` with an unescaped identifier

- Case: `GRANT ... TO "${engineRole}"` with `engineRole = current_user`. A
  `"` in the role name breaks the statement. No outside party controls it.
- Location: `src/engine/store.ts:964-967`.
- Severity: low.
- Evidence: confirmed.
- Known: new.
- Suggestion: use `format('GRANT ... TO %I', current_user)` in a `DO` block.

## Checked without a finding

- Published versions stay immutable. A git grep finds no `UPDATE`/`DELETE`
  on `definitions` or `draft_snapshots` in `src/`. The primary key is
  `(process_id, version)` (`store.ts:213-221`). Only `INSERT` writes
  (`definitions.ts:728-730`).
- Pin `{processId, version, definitionHash}`: set at creation
  (`store.ts:1192-1197`). A migration updates it in one OCC statement
  (`migration.ts:532`, `transition.ts:392-399`). Hash checks: `rehydrate`
  (`store.ts:1336-1345`), `runtime/instances.ts:328-329`, `resolution.ts:100`,
  `migration.ts:396`. Gaps: B-9.
- Exactly one active step: `currentStepId` is a scalar. Every step change runs
  through `applyStepEntry` with OCC (`transition.ts:392-400`). Exception
  through child runs: B-1, B-2.
- Transactional outbox: state and outbox row share one transaction. This
  holds on a transition (`transition.ts:401-423`), on a timer reminder
  (`:915-929`) and on creation (`store.ts:1272-1297`).
- Parallel submits: `FOR UPDATE` plus OCC (`runtime/instances.ts:312-313`,
  `transition.ts:398-400`). Claim, release and delegate run under
  `FOR UPDATE` (`transition.ts:991-995`, `:1031-1043`).
- Outbox idempotency and several pollers: a UUIDv5 primary key
  (`idempotency.ts:28-30`, `store.ts:137-148`), and
  `FOR UPDATE SKIP LOCKED` (`outbox.ts:195-204`). Lease gap: B-4.
- Old findings:
  - ARCH-1 (07-29): the increment in the claim holds (`outbox.ts:195`). The
    limit: B-5.
  - ARCH-2 holds (`timers.ts:34-37`, `:75`, `:91`; `resolution.ts:73-86`).
  - ERR-1 holds per row (`outbox.ts:236-244`). The batch: B-4.
  - The old PERF-1/PERF-2 indexes exist (`store.ts:93`, `:272`).
  - ERR-4 holds (`runtime/instances.ts:324`).
- Time: `next_timer_at timestamptz` (`store.ts:207`). The value `fireAt` is a
  fixed-width UTC ISO string (`duration.ts:36-38`, `:52-78`). A deadline
  without a zone reads as UTC. DST: B-13.
- Migration:
  - The target step resolves through stepMap, identity or policy.
    Registration validates it (`migration.ts:410-420`, `:83-110`).
  - The engine rewrites the outbox rows under the lock (`:456-465`) and
    reconciles the timers (`:474`).
  - The data comes from the locked snapshot (`:468`). The engine deletes the
    form draft (`:536`). The writeback version check sits at
    `outbox.ts:316-321`.
  - Gap at the pending spawn: B-2.
- Half-committed state: the return writeback and the advance share one
  transaction with a lock (`subprocess.ts:195-289`). The cancel sweep can
  resume (`transition.ts:612-641`, `:693-698`). The flag `resolve_state`
  catches a cascade crash (`transition.ts:396`). The auditor found no side
  effect before the commit.
- SQL through parameters: all queries use tagged templates. Exceptions:
  `store.ts:964-967` (B-16) and the array literal `outbox.ts:317` (B-5).
- N+1: loops with `await` have small bounds. They cover events, outbox rows
  per transition, writeback per field, and a spawn depth of at most 15 reads.
  Migration per instance stands as refused simplification no. 18.
- Indexes against the real paths: outbox claim `outbox_claim_idx`, timer
  `instances_timer_idx`. Migration and `liveVersionCounts` use
  `instances_selection_col_idx`, children `instances_parent_idx`.
  Also `appendOutcome` `history_entries_instance_idx`, reporting
  `instances_started_idx`, events `instance_events_kind_idx`. Gaps: B-6, B-7,
  B-11.
- Polling: known as PERF-1 (`docs/decisions.md:839`, `host.ts:326-331`).
- Unbounded lists: the reporting materialization, known from
  `docs/decisions.md:24-36`. The functions `listDrafts`, `listTemplates`,
  `listProcesses` and `listVersions` run without LIMIT over small tables.
- Known points rechecked:
  - `initSchema` still runs without a lock (`store.ts:76-591`, no
    `pg_advisory_lock`; `docs/decisions.md:675`).
  - CLAIM-1 stays as it was (`transition.ts:1078-1081`; `:1548`).
  - Draft creation is slow (`:980`). The engine part `saveDraft` runs two
    `SELECT` and one `INSERT` (`drafts.ts:202-237`). The cause lies outside
    `src/engine`.
- The `ponytail:` sites:
  - `definitions.ts:599`: the limit "publish not concurrent" is formally
    reached, since several developers publish over HTTP. The effect is only a
    primary key failure, with no data damage.
  - `definitions.ts:844`: not measurable. The query loads all bodies without
    LIMIT on every `latest-at-spawn` spawn.
  - `duration.ts:5`: not reached, see B-13.
  - `outbox.ts:48`: the batch breaks the premise, B-4.
  - `reporting.ts:137`, `store.ts:733`, `store.ts:1135`: not reached. Nobody
    can check them without a measurement.

## Repro proposals

- R1 (B-1), in `test/subprocess.test.ts`:
  - Publish the child like `childBody()` and the parent like `parentBody()`.
    Give the second path of the subprocess step no `guard` (`priority: 2`).
  - Call `startInstance(...)`. Expected per spec: `currentStepId` is the
    subprocess step.
  - Assumed: the parent stands on the else target (`completed`). After
    `drainOutbox(sql, registry)`, no child exists. The call
    `subprocessChildId(parent, 1, "step_p_sub")` loads `undefined`.
- R2 (B-2):
  - A child with a manual start step. The subprocess step of the parent has
    the timer
    `{duration: "PT1S", onFire: {targetPath: <path back to the step>}}`.
  - Start the instance and drain the outbox (child C1). Set `next_timer_at`
    in the past and run `drainTimers`. Drain the outbox again (child C2).
  - Then make C1 terminal through a submit, and drain the outbox.
  - Assumed: the parent follows the outcome of C1. The query
    `SELECT count(*) FROM instances WHERE body->'parent'->>'instanceId' = <parent> AND status = 'running'`
    returns 1 (C2).
- R3 (B-3): a target process with the start step `org.group-members` (a group
  with a member). A source process with `process.start`. Let both run, and
  drain the outbox with `createDefaultRegistry()`. Expected:
  `assignment.candidates` holds the members. Assumed: `[]` and an
  `assignment.unresolved` with `no-candidates`.
- R4 (B-5):
  - A registry handler that returns `{note: "a\u0000b"}`. An action with
    `output: {<string field>: "result.note"}`.
  - Call `drainOutbox(sql, reg, deliver, 50)` three times, each more than
    50 ms apart.
  - Assumed: the row stays `claimed`, and `attempts` climbs past
    `MAX_ATTEMPTS`. The handler runs each time. The row never reaches
    `dead-letter`.
- R5 (B-4): 10 rows, a handler that sleeps 100 ms, and two parallel
  `drainOutbox(..., leaseMs: 200)` calls. Assumed: rows from no. 3 on run
  twice. A variant with a throwing handler in the first worker shows reset
  `attempts`.
- R6 (B-6): after the subprocess tests, run
  `SELECT status, resolve_state, count(*) FROM instances GROUP BY 1, 2;`. It
  should show rows `completed`/`pending`. Then run `EXPLAIN (ANALYZE, BUFFERS)`
  on the claim subquery from `resolution.ts:62-70` at 100k such rows.
- R7 (B-7): run `EXPLAIN (ANALYZE, BUFFERS)` on the query from
  `retention.ts:100-106` at 100k unredacted instances.

## Not checked

- No execution: no EXPLAIN, no test. So the claims on volume and runtime in
  B-4 to B-7 carry the tag assumed.
- LSP references: the server did not start (TypeScript 7.0.2 without
  `tsserver.js`). A full-text search replaced them (B-14).
- The auditor only skimmed `registry-check.ts` and `config-descriptor.ts`.
  They have no SQL and no runtime rule.
- The behavior of `Bun.sql` for a query that a timeout abandons on a
  transaction connection (B-10).
- The internals of `src/runtime` (`queryInstances`, `loadInstanceForActor`)
  belong to other areas. So does `src/handlers` beyond the registry imports.
