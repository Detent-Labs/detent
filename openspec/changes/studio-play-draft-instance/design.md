## Context

`createProcessInstance` (`src/runtime/api.ts:934`) only resolves a published
version via `store.resolveLatest`/`resolveBody`, throwing `NotFoundError`
when none exists — the exact failure a developer hits today trying to test a
never-published process. `resolveBody(processId, version)`
(`src/engine/definitions.ts`) is a single shared function injected into
roughly fifteen independent call sites that each resolve a body at their own
later time, not just at instance creation: outbox dispatch, timers,
resolution worker, retention, subprocess spawn/return/cancel, migration,
reporting, and the runtime API's own view/submit/cancel paths. None of them
resolve-and-cache into their own record; each re-queries `resolveBody`
independently. `definitions` is `PRIMARY KEY (process_id, version)` with
`version integer NOT NULL`, populated only at publish, immutable once
written — the Studio "Versions"/diff screen reads it directly filtered by
`process_id` with no exclusion filter. A draft body (`src/engine/drafts.ts`)
is never validated against the authoring-time invariants a published body
must satisfy, so it can be missing an `initialStep`, contain dangling id
references, etc. See `proposal.md` for why this change is needed.

## Goals / Non-Goals

**Goals:**
- Let a test instance's body resolve through the exact same `resolveBody`
  seam every existing caller already uses, so none of the ~15 callers needs
  to learn a test instance exists.
- Keep `definitions` exclusively the published-version table; no synthetic
  or non-published row is ever written into it.
- Make every visibility boundary (app area, reporting) enforce through as
  few call sites as possible, and structure it so a future "test user/group"
  exception is a small, localized change.

**Non-Goals:**
- Suppressing or mocking side effects during a test run (decided: side
  effects fire for real).
- Pre-play structural validation of the draft (decided: no pre-check;
  failures surface naturally at execution time).
- Letting a test instance spawn a child process instance at all, whether or
  not the referenced child process has a resolvable published version
  (acknowledged out-of-scope; see `draft-test-instances`'s "a subprocess step
  always fails gracefully for a test instance" requirement).
- The future "test user/group" app-area visibility exception itself — only
  keeping the design from precluding it.

## Decisions

### A frozen draft snapshot lives in a new table, not in `definitions`

**Decision:** add a new table, `draft_snapshots` — `process_id`, a `version`
column holding a negative, per-process-decrementing sentinel, `definition_hash`,
`body` jsonb, `created_at` — as a sibling to `definitions`, never a row
inside it.

**Alternatives considered:**
- *Synthetic negative-version rows directly in `definitions`.* Rejected: the
  Studio Versions/diff screen and any future version-listing query read
  `definitions` filtered only by `process_id`, with no kind exclusion. A
  synthetic row leaks into every one of those UIs unless each is taught to
  filter it out — an invasiveness cost with no offsetting benefit, since
  `resolveBody` can just as easily check a second table.
- *A fully separate parallel instance/execution data path just for test
  runs* (its own history/outbox/claim tables). Rejected: since every
  consumer already reaches a body only through `resolveBody(processId,
  version)`, duplicating outbox/timers/subprocess/migration awareness for a
  second instance concept would reimplement infrastructure that already
  works, for no benefit `resolveBody`'s single-seam fix doesn't already
  capture.

**Sentinel scheme:** negative, assigned per test instance (not a shared
`0`), because the frozen-at-creation guarantee requires each test instance
to own its own immutable snapshot row — a shared sentinel would collide the
moment a second test instance existed for the same process. Real published
versions are always positive (assigned monotonically at publish), so any
negative value can never collide with one, in `definitions` or in the
migration scan's `(body->>'version')::int` cast (`src/engine/migration.ts`)
— a negative value casts cleanly and simply never matches a real
`fromVersion`/`toVersion`, which are always drawn from real, positive,
`definitions`-listed versions.

### `resolveBody` gains a fallback, not its ~15 callers

**Decision:** `resolveBody(processId, version)` checks `version < 0` and, on
a match, resolves from `draft_snapshots` instead of `definitions`. Every
other caller's contract (`(processId, version) -> ProcessBody | undefined`)
is unchanged.

**Why:** this is the single change point that keeps outbox dispatch, timers,
the resolution worker, retention, subprocess spawn/return/cancel, migration
scans, and reporting all working unmodified — none of them need a `kind`
check or any awareness that test instances exist, because they never see
anything but a `(processId, version)` pair and a resolved body, exactly as
today.

### `kind` lives on the `Instance`, not inferred from the sign of `version`

**Decision:** add `kind: "published" | "test"` (default `"published"`)
directly to `Instance`, set once at creation, never inferred elsewhere from
`version < 0`.

**Why:** every visibility/exclusion check (app-area scope filtering, direct
single-instance authorization, reporting, admin badge) needs to ask "is this
a test instance?" without also knowing this change's storage scheme. Keeping
`kind` explicit means those checks stay correct even if the sentinel scheme
ever changes, and it makes the field self-documenting at every call site
that reads an `Instance`.

### A new studio-only route, not a flag on the public instance-creation route

**Decision:** `POST /drafts/:processId/instances` in `src/http/studio-routes.ts`,
gated by `requireAuthoring` (the same gate already in front of the other
`/drafts/*` routes), rather than a `{ fromDraft: true }` field on the
existing public `POST /processes/:processId/instances`.

**Why:** the existing public route has no role gate at all — any
authenticated participant may call it today, by design, since starting an
ordinary instance is a normal end-user action. A flag-based design would
make the *only* thing stopping a participant from minting a test instance a
client-side omission in the app area's own calling code, not a
server-enforced boundary — directly contradicting the requirement that only
an authoring-capable actor may create one. A separate, role-gated route puts
the boundary in the one place every caller (browser or not) must pass
through.

### The real bypass risk is direct-id access, not the task list

**Decision:** add the `kind` check to `loadInstanceForActor`
(`src/runtime/api.ts`, backing `getInstanceView`/`postComment`/
`listComments`) as well as to `listInstances`'s scope-based filtering — not
only to the list.

**Why:** `loadInstanceForActor` authorizes purely on `startedBy`/
`claimedBy`/candidate membership today; `kind` plays no role. A participant
who never sees a test instance in their task list (because the list
excludes it) can still open it directly by id — e.g. a Player URL a
developer shared or that leaked into a browser history — and get a full
view, submit against it, and comment on it. Fixing only the list closes the
common path but leaves the actual security-relevant hole open.

Both checks route through the same shape of predicate: an administrative
actor is always allowed; a non-administrative actor is refused whenever
`kind === "test"`, full stop, in `loadInstanceForActor`, and via the default
exclusion in the shared `buildInstanceWhere` predicate (see the next
decision) for every list- or query-shaped read. This is deliberately the
single place either check lives, so the deferred "test user/group" exception
later touches only these two conditions, not every call site that reads an
instance.

### Kind exclusion defaults to excluded, enforced once in the shared `buildInstanceWhere` predicate

**Decision:** `buildInstanceWhere` (`src/runtime/api.ts:1329`) excludes
`kind: "test"` by default — `kind <> 'test' OR filter.includeTestInstances`
— rather than requiring a caller to opt into exclusion. The opt-in field,
`includeTestInstances`, is added only to `InstanceListFilter` (mirroring the
existing `includeDegraded` field's scope-gating pattern): `listInstances`
sets it for the administrative scope (`scope: "all"`) and leaves it unset
for every participant-facing scope. `InstanceQueryFilter` — the filter type
`queryInstances` accepts — carries no such field, and `queryInstances`'s own
denylist (`QUERY_FILTER_DENYLIST`, `src/runtime/api.ts:1539`) already
rejects a caller trying to borrow a `listInstances`-only key. So every
`queryInstances` caller stays excluded unconditionally, with no opt-in
surface at all.

**Why:** `buildInstanceWhere` is not `listInstances`'s own predicate — it is
the one `WHERE` fragment `listInstances` (`src/runtime/api.ts:1329` call
site) and `queryInstances` (`:1560`) both interpolate. `queryInstances`
backs two callers this change's first draft omitted from its Impact list:
`instance-query-source.ts:130` (the `instance.query` CEL data source, which
can surface another process's instances as field dropdown options to an
ordinary participant filling out a real form) and `runReportQuery`
(`src/runtime/api.ts:1918`, backing `executeReport`/`previewReportDraft` and
the instance-data-tables preview). Both reach `buildInstanceWhere` through
`queryInstances`, so an opt-in-only filter that only `listInstances`'s
admin-scope caller ever sets would leave both of these silently showing
test instances — directly violating the proposal's own "never visible in
the end-user app area... for any actor" requirement. Making exclusion the
default, enforced in the one shared fragment builder, closes both without
either consumer needing to learn a test instance exists — the same
"single change point" reasoning the `resolveBody` fallback decision above
already applies.

## Risks / Trade-offs

- **A future migration-scan change could widen its version predicate and
  accidentally catch a negative sentinel.** → Mitigation: the scan's
  existing behavior already only matches `fromVersion` values drawn from
  real, positive, `definitions`-listed versions; the `definition-store` and
  `draft-test-instances` deltas both state the two identifier spaces are
  disjoint as a spec-level guarantee, not an incidental fact, so a future
  change that violates it fails a test rather than silently sweeping up a
  test instance.
- **A test instance's real side-effect dispatch (emails, webhooks) could
  surprise an author who forgets they're testing.** → Mitigation: explicitly
  accepted in the proposal (real side effects are the whole point of
  "test the actual behavior"); the Player visibly marks a test instance so
  the developer is not left guessing which kind they created.
- **A draft with a `subprocess` step cannot fully execute a test run.** →
  Mitigation: explicitly out of scope; the `draft-test-instances` delta
  specifies a graceful, diagnosable failure at that step rather than a
  crash or a silent success, so the boundary is visible and tested rather
  than an unexplained dead end. This applies even when the referenced child
  process DOES have a resolvable published version: `resolveLatestByContract`
  (`src/engine/subprocess.ts`) resolves purely from `definitions`, with no
  awareness of the parent instance's `kind`, so left unguarded a test
  instance would spawn a fully real, unmarked `kind: "published"` child —
  visible in participant inboxes, admin, and reporting, breaking this
  change's own "never visible... for any actor" guarantee. The spawn handler
  therefore gates on `instance.kind === "test"` before attempting resolution
  at all, failing the same way as the unresolvable-child case regardless of
  whether a child version exists.
- **A `process.start` action dispatched from a test instance could chain into
  a real, unmarked, independent instance.** → `src/handlers/process-start.ts`
  starts its target through the ordinary published-instance path with no
  awareness of the acting instance's `kind`, so left unguarded a test
  instance's `onPath`/`onExit` action of type `process.start` would spawn a
  genuinely real, production-visible instance, linked back to the test
  instance only by `chainedFrom` — a trace a reader has to separately notice
  names a test instance. Unlike the subprocess case, refusing outright would
  contradict "real side effects fire for real" (the whole point of testing
  actual behavior) and this change's own subprocess resolution isn't a
  precedent for refusal here, since `process.start` is dispatched
  async/outbox-driven and cannot fail synchronously back to a user-visible
  request the way instance creation or a subprocess spawn attempt can.
  Mitigation: the handler propagates `kind: acting.kind` onto the instance it
  starts instead of defaulting to `"published"`. The started instance still
  runs a real published body — `resolveBody`'s sentinel/fallback logic is
  untouched — so a chain started from a test instance stays entirely within
  the test-instance visibility rules without refusing to execute the action.
- **Admin diagnostic aggregates blend test-instance data in with no way to
  tell.** → Accepted: `countInstancesByStatus`, `getTimerLagStats`, and
  `listPendingTimers` (`src/engine/admin-queries.ts:136,156,168`) stay
  unfiltered, consistent with test instances being visible in Admin by
  design. An operator who needs to distinguish them uses the all-instances
  list's `kind` filter, not these dashboard aggregates; adding per-aggregate
  filtering here would be new scope with no requirement driving it.
- **The `draft_snapshots` row has no independent cleanup path.** → Accepted:
  it lives exactly as long as the test instance does, the same as an
  `instances` or `definitions` row today; no retention job exists for
  either, so adding one here without a real need would be premature.

## Migration Plan

Two additive schema changes, one new route, no change to `definitions` or to
any other existing table's schema.

- New table `draft_snapshots`, as in the Decisions above.
- New `kind text NOT NULL DEFAULT 'published'` column on `instances`,
  following this codebase's established pattern for the table's other
  non-JSON columns (`resolve_state`, `cancel_sweep_state`, `created_at`,
  `redacted_at`; `src/engine/store.ts:194-272`): `ALTER TABLE instances ADD
  COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'published'`, applied the
  same idempotent way every other column in that block is. Every
  pre-existing row backfills to `'published'` via the column default at
  `ALTER TABLE` time — no separate `UPDATE` statement is needed, and no data
  is lost or reinterpreted.

  `kind` has to be a real SQL column, not only a field of the `Instance`
  JSON schema, because every `kind`-exclusion predicate this change adds
  (`buildInstanceWhere`, `selectInRange`, `bottleneck`'s standalone
  work-in-progress query) filters the stored row directly via
  `body->>'field'` SQL predicates — before `instanceSchema.parse()` ever
  runs, so before a Zod `.default()` could apply. A pre-existing instance's
  stored JSON body has no `kind` key at all; `body->>'kind'` against it
  returns SQL `NULL`, and a `body->>'kind' <> 'test'` exclusion predicate
  would silently treat that `NULL` as "no match" under three-valued logic,
  dropping every pre-existing instance from participant inboxes and every
  reporting query the moment such a predicate shipped. A real column with a
  `NOT NULL DEFAULT` closes that gap unconditionally: every row, old or new,
  always has a `kind` value to filter on, with no dependence on which code
  path last touched it.
- The `Instance` Zod schema still declares `kind: z.enum(["published",
  "test"]).default("published")`, matching the SQL column's own
  `NOT NULL DEFAULT`. The JSON body written alongside the column stays
  consistent with it, and every reader going through `instanceSchema.parse()`
  (the ~15 `resolveBody` callers, the Runtime API Layer's own construction
  paths) sees the same default a stored body predating this change reads
  back as — independent of, and consistent with, the column.

Nothing to roll back beyond dropping the new table, the new column, and the
new route if the change were reverted; no existing instance's resolution
behavior changes.

## Open Questions

None — the deferred "test user/group" visibility exception is a scoping
decision already recorded in the proposal as future work, not an unknown
that affects this change's specs, approach, or task breakdown.
