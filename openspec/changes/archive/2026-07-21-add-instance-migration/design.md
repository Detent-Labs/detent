## Context

Instances pin `{processId, version, definitionHash}` and rehydrate against exactly
that frozen body. Published versions are immutable. Nothing today moves a running
instance off its version.

Already in place: `migrationSpec` in `definition.ts` (one refinement, no consumer),
`HistoryEntry.cause` including `"migration"`, and `InstanceEvent` built to take kinds
additively.

Two prerequisites supply the machinery: the plan/apply seam with derived status, a
field patch, an events channel and three overrides
(`commit-transition-synthesized-callers`), and a return handler reading the live parent
link under a row lock (`harden-subprocess-return`). Both were extracted from earlier
drafts of this change after review found that reasoning about them *inside* a
migration change produced wrong conclusions three times running.

## Goals / Non-Goals

**Goals:**

- Move running instances between versions of one process under one rule.
- Preserve the audit backbone: a migration is retrievable, and so is one that did not
  happen.
- Compose on the shared commit path rather than reimplementing any part of it.
- Terminate, and never silently lose a concurrent write.
- Change no hashed bytes.

**Non-Goals:**

- Per-instance migration, instance filters, per-run rule overrides.
- Down-migration, rollback, cross-process migration, migrating terminal instances,
  automatic migration on publish, or a migration worker.
- Migrating an instance with actions in flight. Declined, not reconciled — see below.

## Decisions

### The rule is its own entity, frozen by an atomic guard

A plan is a row keyed `(processId, fromVersion, toVersion)`. Registration upserts
under `WHERE applied_at IS NULL`; zero rows means applied, and the registration is
refused.

*Why not on the target version:* a published rule would be **uncorrectable**
(`publishBody` returns the existing version on a hash match, so fixing a typo'd
`stepMap` would require editing the definition itself), and a target version could
serve **one source population only**, since `fromVersion` is singular.

*Why the guard must be atomic:* a read-then-upsert lets a concurrent invocation
migrate under spec A, stamp `applied_at`, and leave spec B stored — so the
`HistoryEntry` is interpreted against a rule that did not produce it.

*Why the invocation snapshots the plan once:* an invocation spanning several batches
could otherwise apply two rules to one population. The plan is read once and stamped
applied before the first instance is processed — not on the first *successful* one, or
an invocation that skips everything leaves the plan editable while it runs.

*Cost:* `migrationSpec` moves off the `processVersion` wrapper and loses `fromVersion`
(the plan key carries it). Both on the **unhashed** wrapper — no body hash changes.

### Migration composes the seam, under a row lock

```
db.begin(tx => {
  inst = SELECT … FOR UPDATE            // the lock is the point
  …compute remap, reconcile timers…
  plan = planStepEntry(inst, target, targetBody, {
    pathId: null, cause: "migration", actions,
    timers: reconciled, entryVersion: toVersion,
    suppressSpawn: stepUnchanged, events: drops })
  applyStepEntry(tx, plan, { version, definitionHash, data })
  // …resolve_state, child link repair
})
```

**The row lock is load-bearing, not hygiene.** The OCC token does not protect `data`:
the action writeback modifies a single field with `WHERE instance_id = … AND status =
'running'` (`outbox.ts:174-178`), advancing and checking nothing. A migration that read
its snapshot in a batch select and later wrote `data` wholesale would erase any
writeback landing in between — silently, with the OCC predicate still matching, over a
window spanning the rest of the batch. So the batch select returns **ids only**, and
each per-instance transaction re-reads the row `FOR UPDATE` and computes the remap
under it.

`suppressSpawn` is set when the step id is unchanged: a parent parked at a subprocess
step that migrates identity-mapped would otherwise advance its sequence, derive a
different deterministic child id, miss the spawn handler's guard, and gain a **second**
child. Same reasoning as suppressing `onEntry` for an identity migration — an earlier
draft applied it to one and not the other.

### In-flight actions: decline, do not reconcile

An instance with any undelivered outbox row is skipped, reason `pending-actions`.

*Why:* `Action.output` is keyed by the **enqueuing version's** `FieldId`. Applied after
a rename it writes the key the migration vacated — an orphan indistinguishable from a
legitimately retained value, and the result is lost.

A previous draft reconciled this by rewriting pending rows' output keys at migration
and detecting stragglers with a version stamp. Review showed it needed an explicit
status list (and `claimed` means both "in flight" and "abandoned", which want opposite
treatment), snapshot semantics for key swaps, a stamp rule to avoid laundering a row
that missed a hop, the version check folded into the writeback's existing predicate to
avoid reintroducing a TOCTOU the code documents avoiding, a new outbox index, and a
defined lock order against the delivery transaction. Six mechanisms that must all be
right, to preserve an action result that a later invocation would deliver anyway.

*Cost:* an instance with a dead-lettered row never migrates until that is cleared
operationally. That is arguably correct — a dead-lettered action is already an
operational problem — and it is visible, because the skip is recorded.

*Why this beats "migrate and drop the writeback":* dropping is a silent, permanent loss
of an effect the handler already produced. Declining is a deferral.

### Which actions a migration enqueues

`onExit` never runs — the instance is not leaving by an authored path, the rule cancel
follows. Target `onEntry` is enqueued only when the step actually changed: an identity
migration re-firing entry actions would send one duplicate notification per instance
across the population, and the idempotency key derives from the sequence, which
migration advances, so dedup does not prevent it. A relocation is the opposite — the
instance arrives somewhere it has never been.

### Data is remapped losslessly, from a snapshot

`fieldMap` renames computed against a pre-migration snapshot and applied as one patch;
`transforms` (also over the snapshot) overlay. Unmapped keys retained, including ones
the target catalog no longer declares.

Snapshot semantics are load-bearing: read as sequential mutation a swap collapses to
one value, and a rename into an occupied field depends on the authored JSON's key
order. `fieldMap` also gains an injectivity refinement.

Retaining orphans is safe: `buildGuardContext` re-keys `data` against the target
catalog and skips ids it does not find (`eval.ts:71-74`), so an orphan cannot be
observed or collide.

### Types are checked where data crosses versions

`celType` equality for every `fieldMap` pair, **and** for every field id declared by
both catalogs with no `fieldMap` entry — the identity-carried case has no entry to hang
a per-entry check on. Transform result types checked via the `Site.expect` machinery
that already enforces the `deadline` site.

### Timers are reconciled, exhaustively

Four cases: carried+unfired+declared → keep `fireAt`; carried+**fired**+declared → keep
as fired; declared+not carried → arm at the migration instant; carried+not declared →
drop. The fired case is the one a three-way reading omits, and omitting it re-fires a
timer that already fired.

Newly armed timers are armed against the **target** body, the **post-remap** data and
the **new** sequence. Their drops reach the commit through the seam's events channel.

### Termination

Keyset pagination on `instance_id`. A bare limit over the source-version predicate does
not terminate: skipped, conflicted, pending-actions and unreadable instances all stay
on the source version and in the predicate, so a batch's worth of them is returned
forever.

Each instance is processed in its own transaction inside its own `try`, covering the
row parse and body resolution as well as the commit.

An instance that cannot be read is reported **failed**, not skipped: an event envelope
needs `instanceId`, `version` and `transitionSeq`, which a row failing `instance.parse`
cannot supply.

## Risks / Trade-offs

- **An instance with in-flight actions is not migrated** → Intended and recorded. A
  dead-lettered row blocks it until cleared.
- **A skipped instance is skipped again on every re-invocation** → Intended for
  `reject-and-pin`; the repeated events are the record.
- **Migration holds a row lock across CEL evaluation and the commit** → Bounded,
  datastore-local, and the alternative loses writes. It serialises with the return
  handler, which takes the same lock.
- **Migration defers the cascade to the resolution worker** → An instance reaches rest a
  moment later than after a manual transition.
- **Two concurrent invocations** → Safe (one winner per instance). The row lock held
  across each instance's read and commit means the winner always completes its own OCC
  commit; the loser blocks, then reads the already-migrated row and returns `none` (in
  no result category), rather than reporting it as conflicted. The `conflicted` category
  is therefore defensive: a migration cannot lose its own OCC race under the lock, so it
  is populated only if that invariant is ever broken. A racing *authored* transition is
  the one that loses (on its side, as `ConcurrencyConflict`) — covered by the
  same-sequence one-winner scenario.
- **A surviving timer id with a changed declaration keeps the old fire time** →
  `TimerState` carries no provenance, so "unchanged" and "silently redeclared" are
  indistinguishable by construction.
- **`assignment` is carried across unchanged** → Matches every existing commit path; no
  new behaviour, stated because the reader will ask.

## Migration Plan

`migration_plans` and the scan index are added by `initSchema` with the established
idempotent pattern. `definitions`, the publish path and the outbox are untouched.
Removing `migration` from the `processVersion` wrapper touches an unhashed, unconsumed
field. Rollback is removing the code path.

## Open Questions

- **A transform that raises is not recorded.** The `timer.unarmed` precedent says an
  omission should be queryable; deferred to keep the event surface to one new kind.
- **Orphan-key accumulation has no tooling.**
- **Reconciling in-flight action writebacks across a migration** is deferred, not
  solved. Revisit if `pending-actions` skips turn out to be common in practice.
- **No API surface.** Migration lands as an engine function alongside `cancelInstance`
  and `startInstance`.
