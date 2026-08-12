## Context

See `proposal.md` for motivation. The state that shapes the approach:

- `HandlerContext` carries `{ action, config, idempotencyKey, instanceId }`
  (`src/engine/registry.ts`). No actor, no assignment, no instance body.
- `deliver` builds that context from a `ClaimedRow` (`src/engine/outbox.ts`).
  The row carries the frozen `action` plus its coordinates.
- Three sites run `INSERT INTO outbox`: `store.ts` (subprocess spawn at an
  initial step), `transition.ts::applyStepEntry` (step entry), and
  `transition.ts` (timer fire). Each already holds the instance it commits.
- `src/engine/assignment-strategies.ts::managerOfStarterStrategyDef` is the
  shipped precedent for a plugin that reads the database. It is a factory
  taking `db`, which defaults to the shared `sql` pool. `src/http/server.ts`
  wires it.
- `src/engine/config-descriptor.ts` turns a `configSchema` into a descriptor
  the studio renders as a form. One property it cannot describe drops the
  whole type's descriptor.

## Goals / Non-Goals

**Goals:**

- A notification reaches the actor holding a step, named by role rather than
  by address.
- The actor ids a delivery sees are the ids the enqueuing commit saw.
- The `notification.email` entry keeps its generated form in the studio.

**Non-Goals:**

- No CEL over recipients. A recipient stays a fixed token, not an expression.
- No new assignment strategy, and no change to how candidates resolve.
- No recipient form naming an arbitrary account, a role, or a group. Those are
  separate questions with separate answers.
- No change to `src/schema/definition.ts`. An action's `config` stays opaque.

## Decisions

### Freeze the actor ids at enqueue, in a new `outbox.actors` column

A delivery could instead read the `instances` row through `ctx.instanceId`.
That costs no column and no seam change. It is the cheaper option on its face,
and it is wrong for a measurable reason.

The resolution worker drives automatic cascades on its own poll loop. It does
not wait for the outbox. An `onEntry` notification on an automatic step can
therefore drain after the instance has left that step. A delivery-time read
then names whoever holds the step the instance reached later. The message
still says what the authored `body` says about the first step.

Freezing also matches the discipline the engine already applies. A step entry
computes a timer's fire time and persists it. `outbox.field_version` records
the instance's version at the moment of enqueue. Both answer the same class of
question.

The column follows the five `ALTER TABLE outbox ADD COLUMN IF NOT EXISTS`
statements already in `initSchema`. It holds
`{ candidates: string[], claimant?: string, starter?: string }` as jsonb.

Alternative considered and rejected: derive the actors from the `HistoryEntry`
at `(instance_id, transition_seq)`. That entry records no assignment. It also
does not exist at all for a row enqueued at sequence 0.

### One frozen set per row, not one per trigger position

`applyStepEntry` enqueues `onExit`, `onPath` and `onEntry` rows in one commit.
It stamps all of them from the same instance. So an `onExit` action reads the
candidates of the step the instance ENTERED, not the one it left.

A stamp per position would mean two stamps per commit. It would also mean a
rule an author has to learn. The single stamp needs one sentence: the ids are
the ones in force after the commit that enqueued the action.

An author wanting to reach the actor that just did the work has two options.
One is `claimant`, on an action the engine enqueues before it clears the claim.
The other is `starter`. Reaching "the actor of the previous step" is a
different question. It gets its own token if anyone needs one.

### Widen `HandlerContext` with an optional field, not a required one

`actors` is optional (`actors?:`), the shape `DataSourceContext.heldValues?`
already uses. Two reasons. A row enqueued before the column existed genuinely
carries none. And every existing construction site of a `HandlerContext` in
`src/` and `test/` keeps compiling, so the seam widens without a sweep.

### The handler maps actor ids to addresses, the engine does not

The engine stamps ids. `notification.email` turns them into addresses. The
alternative has the engine resolve addresses and hand the handler a recipient
list. That would put an email concept inside the outbox, and every other
handler would pay for it.

The handler def therefore becomes `notificationEmailHandlerDef(db = sql)`.
`src/engine/host.ts` and `src/http/server.ts` wire it the way they already
wire `createDefaultAssignmentRegistry`. `emailsForUserIds` lands in
`src/auth/users.ts` beside the other account reads.

No new module carries this. The `assignment-strategies.ts` split had one
cause: `registry.ts` is a leaf. The handler module is no leaf. It imports
`src/auth/users.ts` directly, and that closes no cycle.

### Two flat config lists, not one union

`to: string[]` and `toActors: enum[]` sit side by side. A single
`to: (string | { actor: token })[]` would carry the same information in one
place, which reads better as JSON.

The studio decides it. `describeConfigSchema` walks flat properties. It
describes a union of an object and a string in none of them. A union would
drop the whole type back to the raw JSON textarea. That outcome is the one
this change exists to prevent.

### Widen `describeStringArray` for an enum element

`z.array(z.enum([...]))` has an element whose node type is `enum`, and
`describeStringArray` requires `string`. Left alone, `describeConfigSchema`
returns `undefined` for `notification.email`. The inspector then silently
loses the generated form for `to`, `subject` and `body` as well.

The fix reuses the existing `enumValues` descriptor field on the existing
`string-array` kind. It adds no `enum-array` kind. A new kind would need a new
branch in every consumer of `ConfigFieldKind`, and the browser's mirror type
in `areas/studio/api/types.ts` already declares `enumValues`.

The browser then needs one conditional in the array editor. Today a
`string-array` renders as one `<textarea>` holding newline-separated values
(`PluginEnvelopeEditor.tsx`). There are no rows to put a picker in. So when
`enumValues` exists, that textarea gives way to a checkbox group: one
`<input type="checkbox">` and `<label>` per value. The committed value stays a
plain array of strings.

A `<select multiple>` would fit the same slot. The checkbox group wins on
keyboard use, and it shows every option without a scroll.

### An empty resolved list succeeds

The rule and its reasoning are in the delta spec
(`specs/notification-email-action-handler/spec.md`). The design-level point:
this keeps the dead-letter list a list of things an operator must act on. A
step with no candidate already records `assignment.unresolved`. The operator's
action there is to fix the assignment, not to discard a notification row.

## Risks / Trade-offs

- **A large candidate list produces a large `RCPT TO` sequence, and the
  handler checks every address before `DATA`.** → No cap. Candidates come from
  a publish-validated strategy, not from operator input. The shipped
  strategies produce a configured list or one manager. A `ponytail:` comment
  names the ceiling at the resolution site.
- **The `actors` stamp duplicates state the instance also holds.** → Accepted,
  and deliberate. The duplicate is the frozen copy, which is the whole point.
  Migration already locks and rewrites an instance's outbox rows. This column
  is not among the ones it rewrites, and must not be.
- **An address change between enqueue and delivery is not frozen.** → Accepted.
  The engine freezes the ids, and the address lookup runs at delivery. An
  account that changed its address should receive mail at the new one.
- **The studio's array editor gains a branch.** → One conditional. The delta
  spec's scenarios and a browser check cover it. The free-text path stays as
  it is, and the `static` strategy's `candidates` list proves it.
- **`to` loses its `.min(1)`, so the schema alone no longer rejects an empty
  list.** → The object-level rule replaces it. It rejects the same bodies, plus
  the new both-empty case. A test asserts the publish rejection.
- **`to` also loses the editor's inline required error.** → Accepted. The
  both-empty rule spans two properties. The base spec already places such a
  cross-field rule at publish, not in the generated form.
- **A `db` bound at registry construction is a per-boot binding.** → Named,
  not solved here. Stage 24 gives each tenant its own database.
  `createDefaultAssignmentRegistry(db = sql)` already carries the identical
  binding. `src/http/server.ts` builds both registries once at boot. Stage 24
  revisits the two together. This change adds no new class of error. It does
  not settle the question.

## Migration Plan

- `initSchema` adds the column idempotently. An existing database gains it on
  the next start, with `NULL` on every row.
- No backfill. No body published before this change can name an actor
  recipient. No pending row therefore has a consumer for the value.
- A row carrying `NULL` delivers as it does today. The handler treats it as
  resolving no actor address.
- Rollback is a code revert. The column stays, unread and harmless.

## Open Questions

None. Item 4 in `tmp/open-work-priority.md` raised three questions, and
Decisions above answers all three. One question stays open on purpose: the
per-boot `db` binding. The Risks section records it as stage 24's to settle.
