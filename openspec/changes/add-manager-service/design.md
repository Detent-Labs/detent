<!-- antislop: allow-file passive-voice -->
## Context

See `proposal.md` for motivation. See
`docs/superpowers/specs/2026-08-02-pluggable-step-assignment-design.md` for the
approved parent design. This change is its part C.

Four facts of the current code shape everything below.

`src/engine/registry.ts` is deliberately a leaf module. It imports zod and the
schema and nothing else. So `store.ts`, `transition.ts` and `definitions.ts` can
each default a parameter to `createDefaultAssignmentRegistry()`. `store.ts`
imports `SPAWN_ACTION_TYPE` back from it. And `src/auth/users.ts` imports `sql`
from `store.ts`. A database-reading strategy placed in `registry.ts` closes that
cycle.

`resolveStepAssignment` (`src/engine/registry.ts:133`) is the single choke point.
All five step-entry paths call it. Those are `commitTransition`
(`src/engine/transition.ts:439`), `startInstance` (`transition.ts:672`), the
subprocess spawn (`subprocess.ts:130`), `createProcessInstance`
(`src/runtime/api.ts:667`), and the migration path.

Four of those five resolve before their transaction opens. The subprocess return
is the exception. `executeAutomaticTransition` (`subprocess.ts:288`) runs inside
the transaction that read the parent row `SELECT ... FOR UPDATE`.

<!-- antislop: allow synonym-rotation -->
`auth_users` has five columns and no organizational fact. Ten columns elsewhere
in `initSchema` were added later with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
The SQL keyword is quoted verbatim below; it is not prose.

## Goals / Non-Goals

**Goals:**

- One manager pointer per account. A strategy reads it, and an operator changes
  it.
- A deadline that bounds every resolver on every path. That includes the one
  holding a row lock.
- A failure classification. It commits the entry and records why nobody can
  claim.

**Non-Goals:**

- Everything the parent design's Non-goals section already rejects. That is a
  per-process permission store, a role hierarchy, and a CEL-backed strategy. It
  is also a fallback assignee, re-resolution mid-instance, and the Entra or AD
  integration.
- Traversal of the manager pointer. One hop, never a chain. So no cycle check and
  no depth limit.
- A per-strategy deadline. One engine-wide bound holds until a second fallible
  strategy needs its own.

## Decisions

### The manager is a nullable self-referencing column

<!-- antislop: allow synonym-rotation -->
`auth_users` gains `manager_user_id text REFERENCES auth_users(user_id) ON DELETE
SET NULL`. It is added with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, beside
the ten existing ones. `CREATE TABLE IF NOT EXISTS` does not change a table that
already exists. So the column needs its own statement.

The foreign key makes a dangling pointer unrepresentable. Nothing deletes an
account today. So `ON DELETE SET NULL` states an intent rather than a path that
runs.

*Alternative rejected:* a separate `org_edges` table. That is a graph store, and
the parent design rejects the tree it would enable. One column expresses exactly
what one hop needs.

*Alternative rejected:* a plain `text` column with no constraint. The strategy
would then write an id that authenticates as nobody. The stall would look
identical to a missing manager.

A cycle (A manages B manages A) stays representable and stays harmless. The
strategy reads one hop and never walks. So a cycle has no termination condition
to violate.

A self-pointer is the one case rejected, at the write path rather than in the
schema. It names the starter as their own approver. That is an operator mistake
rather than an organizational fact.

### The strategy lives in a new non-leaf module

`src/engine/assignment-strategies.ts` holds the `org.manager-of-starter` entry.
It exports `createDefaultAssignmentRegistry(db: SQL = sql)`. That starts from the
leaf registry's static-only set and adds the org entry.

The name is deliberately the same as the leaf factory's. `src/http/server.ts`
already imports that identifier. It uses it as the default for both
`createServer` and `serve`. So the composition root switches by changing which
module the name comes from. No default-parameter expression changes, and the
diff to that file is one import.

The leaf `registry.ts::createDefaultAssignmentRegistry` keeps its name and its
static-only behaviour. Every in-engine default parameter still resolves to it.
That keeps `registry.ts` importable from `store.ts` without a cycle.

*Alternative rejected:* registering the strategy inside `registry.ts` behind a
dynamic `import()`. It hides a database dependency from the module graph. The
graph is supposed to express exactly that.

*Alternative rejected:* an injected lookup function set at module load. That is
hidden mutable global state. A test that forgets to set it sees a silent empty
list rather than a failure.

### The deadline lives in `resolveStepAssignment`

`resolveStepAssignment` races `def.resolve(...)` against a timer. The bound comes
from `ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, defaulting to 5000.

One choke point covers all five call sites. No path added later can forget the
bound.

`Promise.race` does not cancel the loser. A resolver that exceeds the deadline
keeps running until its own query settles. That is acceptable, and it is the
property the lock path needs. The orphaned query holds a different pool
connection. So the caller returns, and its transaction commits and releases the
row lock on schedule.

### The subprocess-return lock is bounded, not hoisted

The parent design leaves this open, and `CLAUDE.md` names both candidates. This
change takes the deadline.

Hoisting does not close the resolve-under-lock path. The step the parent enters
is derived from the row read `FOR UPDATE`. It is also derived from the outcome
path matched against that row.

An optimistic pre-read plus a sequence re-check must still fall back to resolving
under the lock when the re-check fails. By then the transaction is open, and the
correct step is only now known. So hoisting makes the unbounded hold rarer
without making it impossible. A bound that always holds is worth more than a
mitigation that usually holds.

Hoisting also costs a second read of the parent row on every return delivery.
That buys a shorter hold on a lock the deadline already caps at five seconds.

The deadline is built for this change regardless. It applies to all five paths
through one mechanism. And it returns control to the caller on time, even when
the resolver has not settled.

*Alternative rejected:* leaving the return path unbounded. The manager lookup is
a real query. An unbounded hold on the parent row blocks every other writer of
that instance, including its cancellation.

The existing spec sentence carving out this path stays true. What changes is that
the carve-out now carries a bound.

### Resolution reports a reason; the caller records the event

`resolveStepAssignment` returns `{ assignment, unresolved? }` instead of bare
`assignment`. It has no transaction handle. On four of five paths it runs before
the transaction opens. So it cannot append the event itself without risking a
committed event beside a rolled-back entry.

Each call site mints the `assignment.unresolved` event. It does so in the
transaction that commits the entry. `commitTransition` passes it through the
`events` field `StepEntryOpts` already carries. The spawn adds it to the
drop-event list it already appends. The two creation paths add it to the events
`createInstance` already writes.

The reason enum is `resolver-raised`, `timed-out`, `no-candidates`.

`no-candidates` covers "no manager on record". The strategy-specific wording is
not knowable at this layer, and it does not need to be. The event envelope
carries `version`, and `stepId` resolves within that frozen body. So a reader
recovers the strategy type from the definition. The payload is
`{ stepId, reason }`, the shape `instance.faulted` already uses.

A `static` strategy configured with an empty list also records `no-candidates`.
That is correct rather than noisy. The instance genuinely stalls, and the record
should say so. Branching the event on the strategy type would also break the
registry spec's rule. No engine code decides by comparing a type against a
literal.

A step declaring no `assignment` records nothing. `resolveStepAssignment` returns
before consulting any registry, so the unrestricted case is untouched.

### The manager route mirrors the roles route

`PATCH /admin/users/:userId/manager`, behind `system:admin`. The body is
`{ managerUserId: string | null }`, and `null` clears the pointer. Two cases are
rejected with 400: an unknown target, and a target equal to the account itself.

## Risks / Trade-offs

- **A hung resolver leaks a pool connection.** → The race bounds the caller. That
  is what the row lock needs. The orphan holds a different connection and a plain
  single-row `SELECT`. A query that can hang forever belongs to the second
  fallible strategy, not to this one.
- **A stalled resolution looks like a step nobody may claim.** → The
  `assignment.unresolved` event distinguishes them. The admin instance record
  already shows events beside transitions.
- **`static` with an empty list now emits an event.** → Intended. Existing tests
  asserting an exact event list on such a step need changing. The change is
  additive for every other body.
- **The deadline default may suit no external directory.** → It is an environment
  variable. A deployment tunes it without a code change. Five seconds already
  exceeds any query this change ships.
- **One import line changes in `src/http/server.ts`.** → Unavoidable. It is the
  composition root. A strategy registered nowhere resolves to an empty list.
  Naming the new factory identically keeps the diff to the module specifier.

## Migration Plan

Additive throughout, in one deploy.

1. `initSchema` adds the column on next start. Existing rows get `NULL`, which
   `org.manager-of-starter` reports as `no-candidates`.
2. The event kind is additive. `instanceEvent` is a discriminated union. A reader
   that does not know the kind never receives one from an older row.
3. No definition changes, no re-publish, no instance migration. A body that names
   no `org.manager-of-starter` behaves exactly as before.
4. Managers are populated afterwards, by the admin screen or the CLI. A process
   using the strategy stalls visibly until they are. That is the designed
   behaviour rather than a migration gap.

Rollback: revert the code. The column stays and is ignored. No published body
references it, so nothing is stranded.

## Open Questions

None. This change could have deferred two questions. Those are the deadline's
home and the row-lock treatment. Both are decided above, because both change the
task breakdown.
