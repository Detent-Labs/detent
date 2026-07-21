## Why

Run-to-rest ("cascade") is committed one hop at a time, and every entry point —
a manual transition, an automatic hop, instance creation on an automatic
`initialStep`, a subprocess spawn's child, and a subprocess return's parent —
drives the remaining hops in-process after its own commit, with no durable
record that more cascading is owed. If the engine crashes (or the request is
otherwise abandoned) between one hop's commit and the next, the instance is
left resting on an intermediate all-automatic step with `resolve_state='idle'`:
nothing re-drives it and no event records the interruption. Instance migration
already solved exactly this problem for its own commit by flagging the
instance `resolve_state='pending'` inside the same transaction as the commit,
letting the existing re-resolution worker finish the cascade later. This change
generalizes that proven pattern to every commit that can be followed by more
cascading, closing the gap for good.

## What Changes

- `applyStepEntry` (the one seam every step-entry commit already goes through)
  additionally sets `resolve_state = 'pending'` on the instance row whenever
  the commit leaves it `running`, in the same transaction as the commit
  itself. (Conditioned on `running`, not unconditional: a commit onto a
  terminal step or a `cancelled` override is never revisited by the
  re-resolution worker regardless, so flagging it would only leave a dead,
  unreadable marker.)
- `createInstance` inserts new instance rows with `resolve_state = 'pending'`
  instead of relying on the column's `'idle'` default, since both of its callers
  (`startInstance`, the subprocess spawn handler) immediately cascade the
  instance they just created.
- `migrateInstances`' now-redundant explicit `resolve_state = 'pending'` update
  (the special case this pattern generalizes from) is removed, since
  `applyStepEntry` already performs it as part of the same commit.
- No new column, event kind, or schema change: this reuses the `resolve_state`
  column and the re-resolution worker that already exist for writeback-driven
  and migration-driven re-resolution.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `automatic-transitions`: generalizes "Automatic evaluation advances the
  instance to rest" — today only a migration commit is permitted to flag the
  instance and return before it is at rest; this change makes durable flagging
  a property of every step-entry commit, so a crash between a commit and its
  in-process cascade is always recovered by the same worker, not only after a
  migration.

## Impact

- `src/engine/transition.ts`: `applyStepEntry`'s UPDATE conditionally sets
  `resolve_state = 'pending'` when the commit's resulting status is `running`.
- `src/engine/store.ts`: `createInstance`'s INSERT gains
  `resolve_state = 'pending'`.
- `src/engine/migration.ts`: removes the now-redundant explicit
  `resolve_state = 'pending'` UPDATE after `applyStepEntry`.
- `test/`: new crash-recovery coverage — a commit whose in-process cascade
  never runs (simulating a crash) is picked up and finished by
  `drainResolutions`, for a plain automatic cascade, an instance-creation
  cascade, and a subprocess return's parent cascade.
- No API, schema, or wire-format change; no behavioral change to the
  synchronous (non-crash) path, which still returns only once the instance is
  at rest.
