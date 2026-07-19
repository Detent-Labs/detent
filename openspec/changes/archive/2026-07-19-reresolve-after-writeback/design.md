## Context

Automatic evaluation (`resolveAutomatic` in `transition.ts`) advances an instance
to rest and is invoked on a manual transition and at instance start. An
all-automatic step with no matching guard is a wait-state; the
`automatic-transitions` spec notes it is "bounded elsewhere by a timer" but says
nothing about the result-driven exit. The outbox worker (`outbox.ts`) delivers an
action and, in a CAS-gated tx2, writes the handler's result into `data` via
`jsonb_set` on `{data,<fieldId>}` — but does not re-drive automatic evaluation.

Two facts shape the design. First, every engine entry point takes `body:
ProcessBody` from its caller; there is no definition store, so a background worker
has no way to obtain a parked instance's frozen body on its own. Second, the
outbox already establishes the durable-flag + claim/CAS idiom this problem wants.

## Goals / Non-Goals

**Goals:**
- Re-drive `resolveAutomatic` after a writeback that changes `data`, so a
  wait-state takes its result-driven path.
- Be durable (survive a crash between writeback and re-resolution), OCC-safe, and
  idempotent, reusing existing patterns rather than adding new machinery.
- Define the minimal seam for a background worker to obtain an instance's body.

**Non-Goals:**
- A persistent definition/version store. This change defines the `resolveBody`
  injection point; its production backing is a separate epic.
- Changing `automatic-transitions` or `transactional-outbox` requirements — this
  adds a new trigger for existing behavior and a durable flag on the existing
  writeback, nothing more.
- An indexed "which step is a wait-state" query. The dirty flag scopes the worker
  to instances that actually changed; no need to scan all parked instances.

## Decisions

### A durable `resolve_state` flag set by the writeback
`instances` gains `resolve_state text NOT NULL DEFAULT 'idle'` (indexed). The
outbox writeback tx2 sets `resolve_state = 'pending'` in the same `UPDATE` that
patches `data` (so it is set iff the row was affected, atomically and durably). A
crash after the writeback commit leaves the flag set; the worker picks it up on
restart. Rationale: the flag is the durable source of truth, mirroring how the
outbox itself never loses an enqueued action. Alternative (re-resolve inline at
the end of the outbox drain) is rejected: it couples the outbox worker to the body
resolver and loses durability if the process dies between commit and the inline
call.

### Claim / re-resolve / CAS-clear worker, with a lease for crash recovery
`drainResolutions(db, resolveBody)` mirrors `drainOutbox`: (tx1) claim due rows
`SET resolve_state='claimed', resolve_claimed_at=now() ... FOR UPDATE SKIP LOCKED`;
then per row, load the body via the injected resolver and run `resolveAutomatic`;
then (CAS) `SET resolve_state='idle' WHERE instance_id=? AND resolve_state='claimed'`.
The claim selects fresh `pending` rows **and** `claimed` rows past a lease
(`resolve_claimed_at < now() - leaseMs`) — an abandoned claim from a pass that
crashed between claim and clear. Without this reclaim, such a row would strand in
`claimed` forever (the claim never re-selects it), losing the re-resolution — so
the lease is what actually delivers the "survive a crash" goal, not just the
durable flag. `startResolutionWorker(db, resolveBody, intervalMs, leaseMs)` is a
peer to `startOutboxWorker`/`startTimerScheduler`; the host wires all three. This
claim/CAS split is exactly what makes the race safe (below).

### The writeback wins the race, so no mark is lost
A writeback landing while a row is `claimed` sets `resolve_state='pending'`
unconditionally, overwriting `claimed`. The worker's CAS-clear only fires `WHERE
resolve_state='claimed'`, so it finds nothing and does not clear — the instance is
re-resolved next pass. This is the same claim/CAS reasoning the outbox uses for
reclaimed-then-late peers; it guarantees a data change is never silently dropped.

### Injected body resolver, no store built here
The worker takes `resolveBody: (processId, version) => ProcessBody | undefined`.
No production backing is built (no definition store exists); a resolver returning
`undefined` leaves the instance marked for a later pass. Tests supply the body
directly, the same way `rehydrate`/`executeManualTransition` tests already do.
Rationale: the re-resolution mechanism is independent of how bodies are stored;
building a definitions table now would balloon this change into the versioning
epic.

### Total guards (discovered during verification)
Running the DB-backed tests surfaced that `evalGuard` was not total: a guard
reading a field absent from `data` (the normal state of a wait-state before its
writeback) threw via cel-js instead of evaluating false, so the very first
`resolveAutomatic` on entering a wait-state crashed — affecting the real
`book`/`booking_status` example too. `evalGuard` now catches and returns false,
honoring the CEL "total" contract. This is a one-line runtime-conformance fix but
a hard prerequisite for wait-states (and thus for this change and `timer-scheduler`)
to function. Alternative (require authors to write `has(data.x) && ...`) is
rejected: the example and the contract both use bare field access.

### System actor for re-resolution
Re-resolution has no acting user, so it runs with `{ id: "system", roles: [] }`.
Automatic-path guards should not depend on `actor`; a wait-state guard that does is
a latent authoring question surfaced, not resolved, here.

## Risks / Trade-offs

- [Poll latency] The result-driven path is taken on the next worker tick, not the
  instant the writeback commits. → Acceptable and identical to the outbox/timer
  cadence; the interval is configurable.
- [No body resolver in production] Until a definition store exists, the worker is
  inert in production (every `resolveBody` returns `undefined`). → Intended: this
  change and the store land on their own timelines; tests fully exercise the logic
  with an injected resolver. The flag accrues harmlessly until a resolver is wired.
- [resolveAutomatic actor coupling] `buildGuardContext` always includes `actor`; a
  system actor makes actor-dependent automatic guards evaluate against an empty
  identity. → Automatic guards keying on `actor` are already dubious; flagged as an
  open question rather than papered over.

## Open Questions

- Where does the production `resolveBody` get bodies — an in-memory registry
  populated at publish/start, or a persistent `definitions` table? Tied to the
  versioning/publish epic.
- Should the resolution worker and the timer scheduler share one poll loop, since
  both scan `instances` for background work? Start independent; consolidate only if
  operationally warranted (same stance as the timer change).
