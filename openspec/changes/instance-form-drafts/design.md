## Context

A participant fills a step's form on a running instance. The only persistence
today is `submitAndTransition` (`src/runtime/api.ts`). That call validates the
whole form and advances the step. `TaskScreen.tsx` otherwise holds the input
in `formValues` and drops it on navigation. The existing `drafts` table and
`src/engine/drafts.ts` store *process definitions* for the studio. That is a
different concept. See proposal.md for motivation.

`instance.data` is the load-bearing state the engine executes against. CEL
guards (`visible`/`required`/`readonly`), data-source option lists, the admin
record, subprocess inputs, and reporting all read it. A saved-but-unsubmitted
input must stay out of `instance.data`.

Every authored step-changing write funnels through one function:
`commitTransition` (`src/engine/transition.ts`). Manual submit
(`commitManualTransition`), the automatic cascade, a transition timer
(`fireTimer`), and cancel-to-sink (`cancelInstance`) all call it. Each call
runs inside its own transaction.

The one non-authored step-changing write is instance migration.
`migrateInstances` calls `migrateOne` (`src/engine/migration.ts`), which
relocates `currentStepId` by calling `applyStepEntry` directly. It does not
call `commitTransition`. So the clear hook must also live there (see
Decisions 3).

## Goals / Non-Goals

**Goals:**

- Persist a participant's unfinished form input per instance, apart from
  `instance.data`, and return it when they reopen the same step.
- Save with no validation, so an incomplete or wrong-typed form still saves.
- Clear the draft automatically when the instance moves, ends, or redaction
  runs.

**Non-Goals:**

- No autosave; the participant saves explicitly.
- No draft on the Start-a-process screen, which creates rather than resumes.
- No "has draft" badge in the inbox, no discard-draft control, no audit event
  for saves, no per-actor drafts.
- No Player-screen draft preview. `PlayerScreen.tsx` keeps seeding
  `formValues` from `next.fields` only and never reads `next.draft`. See
  Decision 7 for the accepted gap this leaves.

## Decisions

### 1. A dedicated `instance_drafts` table and engine module

Store the draft in its own table, `instance_drafts`, keyed by `instance_id`,
with columns `step_id`, `data` (jsonb), `updated_by`, and `updated_at`. A new
`src/engine/instance-drafts.ts` exposes `getInstanceDraft`, `saveInstanceDraft`
(an upsert), and `deleteInstanceDraft`, mirroring `src/engine/drafts.ts`.

Alternatives rejected:

- *Write into `instance.data`* (save equals submit-without-moving). Rejected.
  Partial input would leak into guards, data sources, the admin record, and
  reporting. It could also reshape the form between saves.
- *A jsonb column on the `instances` row.* Rejected. The instances row is one
  jsonb body. Burying a scratchpad inside it complicates every read site and
  blurs committed state.

### 2. Lenient, envelope-only validation

The engine module's `saveInstanceDraft` (the `instance_drafts` upsert) checks
only that `data` is a plain JSON object within `MAX_DRAFT_ENVELOPE_BYTES`. It
then stores the data verbatim. No type, option, constraint, rule, or required
check. `submitAndTransition` stays the sole validator.

No `revision` column. The draft is single-writer at a time. The writer is the
claimant, the starter, or an `ADMIN_ROLE` holder on an assignment-less step. A
plain last-write-wins upsert is enough, unlike the studio's multi-author
`drafts`.

`src/engine/drafts.ts`'s `checkJsonEnvelope` cannot serve this check as-is. It
validates a two-part body+layout envelope. Its `isJsonObject` predicate is also
private and unexported. `instance-drafts.ts` needs its own object-shape check
for the single `data` field: a one-line `typeof`-based predicate.

### 3. `step_id` gating plus a single clear choke point

The draft records the instance's `currentStepId` at save time. The engine
offers a draft only when its `step_id` equals the instance's current step.
This gate is the backstop. The view never offers a stale draft, even if some
path misses a clear hook.

The load-bearing clear rule is deletion inside `commitTransition`'s
transaction, after `applyStepEntry` succeeds. Every authored step change and
every cancel routes through `commitTransition`. So one hook clears the draft
on manual submit, the automatic cascade, a transition timer, and cancel at
once.

Deleting a row that does not exist is a no-op, so automatic hops over steps
with no form cost nothing. `cancelInstance`'s non-running no-op does not reach
`commitTransition`. But a non-running instance never holds a draft. The
transition that made it non-running already deleted the draft, and
`saveInstanceDraft` rejects a non-running instance.

Instance migration relocates `currentStepId` through `applyStepEntry` rather
than `commitTransition`. So the transition hook alone misses it. `migrateOne`
SHALL therefore delete the migrated instance's draft inside its own
transaction. That delete matches the transition hook's no-op delete. It runs
on every migration, not just a relocation.

A relocation keeps the draft, and a later loop back to the recorded step
re-offers it. The two step ids match again, which the `step_id` gate cannot
prevent. A fieldMap-only migration leaves the step id unchanged. So the gate
passes, and the view offers a draft whose field ids the remap has made stale.
Deleting on every migration closes both.

`redactInstance` (`src/engine/retention.ts`) SHALL delete the draft beside its
comment and attachment deletes. A redacted instance must not keep the
participant's unfinished input. `markFaulted` flips `status` to `faulted`
without `commitTransition` and without a delete. That is safe. Faulting only
parks an instance on an all-automatic step it already reached through a
clearing transition. The hop that entered the cascade deleted the draft
first.

### 4. Authorization parity with submit, via a shared predicate

Extract the submit authorization check from `submitAndTransition` into one
helper. The helper enforces three cases. On an assignment-bearing step, only
the claimant may act. Otherwise the starter or an `ADMIN_ROLE` holder may act.
It throws `InstanceNotRunningError` on a non-running instance.
`submitAndTransition` and `saveInstanceDraft` both share the helper, the way
`loadInstanceForActor` and `isEligibleCandidate` already share. This keeps the
two predicates from drifting.

### 5. Fold the draft into `getInstanceView`

Add `draft?: { stepId, data, updatedBy, updatedAt }` to `InstanceView`. The
field appears only when a stored draft's `step_id` matches the current step.
One round trip serves the form and its draft. A separate `GET` endpoint would
add a second request and a second client code path for no gain.

Every caller that `getInstanceView` already authorizes can read the field.
Those callers include `ADMIN_ROLE`, the starter, the current claimant, and any
eligible candidate. The claimant who saved it is not the only reader. The form
draft is the instance's single shared scratchpad, like the comment thread. It
carries no per-actor split (see Non-Goals).

### 6. `PUT /instances/:instanceId/draft`

Match the existing draft-store convention (`PUT /drafts/:processId`). The
route resolves the actor and calls `saveInstanceDraft(instanceId, data,
actor)`. It returns `200` with `{ updatedBy, updatedAt }`. `data` is the body
field. The server derives `step_id` from the instance, never from the client.

### 7. Client seeding and submission unchanged; Player stays out of scope

`TaskScreen.tsx` seeds `formValues` from `view.draft.data` over `field.value`
when a form draft is present, and otherwise from `field.value` as today. Save
sends `filterToEditable(formValues, view.fields)`, the same filter submit
uses, so readonly and group fields never enter the form draft.
`packages/form-ui` needs no change. The TaskScreen addition is a screen change
under `packages/web`. Its implementation routes through the frontend design
skills first, per the repo convention.

`PlayerScreen.tsx` (`packages/web/src/areas/studio/screens/PlayerScreen.tsx`)
also calls `getInstanceView`, the same function `TaskScreen.tsx` calls. It
keeps seeding `formValues` from `seedFormValues(next.fields)` only. It stays
unchanged in this change and does not read `next.draft`.

`.claude/rules/ui-glossary.md`'s player invariant states that what an author
previews here is what a participant gets. This change knowingly leaves one gap
in that invariant. An author who opens by id an instance with a saved form
draft sees the step's committed `field.value`s in Player. The participant's
Task screen shows the restored draft instead.

The review identified this gap and accepted it as a deliberate scope
limitation, not an oversight. A follow-up change can close the gap later, by
making `PlayerScreen.tsx` read `view.draft`, if that parity turns out to
matter.

## Risks / Trade-offs

- [Instance migration relocates `currentStepId` through `applyStepEntry`, not
  `commitTransition`] → Decision 3 also clears the draft there, so no orphan.
  The `step_id` gate remains the backstop for any path a clear hook misses.
- [Two tabs of the same claimant save at once] → last-write-wins on the upsert;
  acceptable for a single-writer scratchpad.
- `saveInstanceDraft` reads the instance for `step_id` with no lock, then
  writes. `submitAndTransition`, `redactInstance`, and `migrateOne` all lock
  the row first. A concurrent transition can move the instance from step A to
  step B and clear the draft first. The save's write can then land after,
  inserting a stale row still stamped `step_id: A`. A later loop back to step
  A would offer that stale row as current. Accepted, same treatment as the
  two-tabs case above: no locking added (see task 2.2).
- [A lenient draft holds values that fail submit later] → accepted. The
  participant sees the same validation feedback on submit they see today.
- [A participant expects a draft to survive a loop back to the same step] →
  accepted and specified. One draft per visit; a transition clears it.

## Migration Plan

`initSchema` gains `CREATE TABLE IF NOT EXISTS instance_drafts ...` beside the
existing `drafts` table. No data migration exists, and no existing row
changes. The table starts empty. Only new saves populate it.

Each DB-backed test suite calls `initSchema()` in its own `beforeAll`. So tests create the
table the same way they create every other table. Rollback is a plain
`DROP TABLE instance_drafts`. This affects no instance or definition.

## Open Questions

None. The brainstorming round resolved the open decisions (separate draft,
leniency, authorization parity, per-visit lifetime, explicit Save).
