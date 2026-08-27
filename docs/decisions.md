<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons -->
# Decisions: open questions and deferrals

Forward-looking counterpart to `docs/current-state.md`, which describes what
exists. This file records what was decided and not yet built, and what still
needs a decision. `ROADMAP.md` carries stage-by-stage status.

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.
- `TaskScreen.tsx`'s (app area) `InstanceView` carries no process
  `baseLocale` field, so a task field's `LocalizedText` label renders blank
  instead of falling back, whenever the participant's active locale has no
  entry. Pre-existing gap, not introduced by `studio-formui-ridealong-cuts`'s
  removal of `FieldForm`'s `baseLocale` prop. Fixing it needs an `InstanceView`
  API change plus a `TaskScreen.tsx` wiring change.
- `checkUnknownKeys` (`src/schema/compile.ts`) needs the raw authored body,
  and the studio holds only the Zod-stripped result of
  `authoredProcessBody.safeParse(draft).data`, so the studio's checks rail
  holds that check back for a draft's whole session (`unknownKeysHeldBack`,
  `validation-sequence-module`). A tolerant walk over the raw draft — one
  that survives an unknown key rather than stripping it before the walk ever
  runs — would close that gap and let the studio run the check live. No
  follow-up change tracks this yet.
- No NDJSON/JSONL export exists for the instance history and event audit
  trail, and none is built. `HistoryEntry` and `InstanceEvent` rows
  (`process-contract.md`'s "audit backbone") are already flat, independent
  per-instance records, one row per entry in the `history_entries` table —
  the shape NDJSON is built for, unlike the process definition itself, which
  stays one JCS-hashed document nested by `id` and never becomes NDJSON.
  `historyByInstance` and `selectInRange` (`src/engine/reporting.ts:108` and
  `:98`) fully materialize a date range into memory today before returning a
  JSON array. Worth building when stage 27's reporting-app (cycle time,
  bottlenecks, SLA) needs a downloadable or streamable export, or when a
  `selectInRange` result set gets large enough that the in-memory buffering
  is a measured problem, not speculatively before either happens. Needs its
  own `reporting-app` spec delta when it lands.

  The same buffer-then-return shape holds for `listOutbox`
  (`src/engine/admin-queries.ts:83`), an append-only delivery log the same
  way the history table is: one row per delivery attempt, no nested
  structure. An admin "download the outbox" debugging export is the same
  NDJSON shape as the history export above and would land in
  `admin-operations-api` when built, on the same trigger: a concrete
  downloadable-export ask, not a speculative one.

  `migrateInstances` (`src/engine/migration.ts:547`) is the weaker case.
  It already keyset-paginates instances and buffers outcomes into one
  in-memory `MigrationResult` (`migrated`/`skipped`/`conflicted`/`failed`
  id arrays), not a per-instance record stream, and nothing today asks for
  a per-instance migration report. If an admin-facing "why did instance X
  land in `failed`" report is ever requested, that reason string does not
  exist yet either: `migrateOne`'s catch block in `migrateInstances`
  classifies failures into the four buckets by id only, and a
  per-instance NDJSON report would need it to carry a reason alongside
  each id. Do not build this ahead of that ask.

## Decided, not yet built (each needs its own OpenSpec change)
- **Instance audit log: a tamper-evident change record for field data.** A
  design pass on 2026-08-25 settled the shape; the owner approved each piece
  in turn. Not started. Likely several changes: the table + trigger, the
  chain + checkpoint, the `redactable` flag + redaction rework.

  **The goal.** Every change to an instance's `data` leaves one readable
  record: which field, old value visible in clear text, who, when, from
  which write path. The record is complete by construction, not by
  discipline, and a reader with database access cannot alter or remove an
  entry without a later verification detecting it. Redaction of a field on
  request stays possible without breaking that verification, and it covers
  the field's whole history in one act, never a single step's value.

  **The design.**
  - One table, `instance_audit`, one row per field change (a delta, not an
    instance snapshot): `instance_id`, `seq`, `field_id`, `op` (`set` |
    `redact`), `value`, `salt`, `value_hash`, `prev_hash`, `hash`, plus
    actor, timestamp, and `source` (user submit, action writeback,
    subprocess return, migration, redaction).
  - A Postgres trigger on `instances` writes the rows. That places the log
    below all five body-writing sites (`transition.ts`, `outbox.ts`,
    `subprocess.ts`, claim/release, `retention.ts`) and below any future
    sixth, which is the completeness argument. The trigger function is
    `SECURITY DEFINER`; the app role gets `REVOKE UPDATE, DELETE` on the
    table, so the application can only append.
  - Hash chain per instance: each row's `hash` covers the row's metadata,
    its `value_hash`, and `prev_hash`. A nightly checkpoint gathers every
    chain head and signs it with a key that lives outside the database;
    the signed checkpoint is stored outside the database too. The chain
    catches an edited row; the checkpoint catches a recomputed chain.
  - `FieldDef` gains `redactable: true`. A redactable field's `value_hash`
    is `H(salt || value)` with a per-row salt; a plain field hashes the
    value directly. The flag must hold at write time — rows written before
    a field became redactable hash the clear value and can never be nulled
    without breaking the chain, so the studio should encourage marking
    generously at authoring time. The name deliberately states the
    treatment, not a legal category: no `personal`, no `gdpr`, no `pii`.
  - Redaction = append one `redact` row naming who, when, why, and which
    fields, then null `value` and `salt` in every prior row of those
    fields, across the whole instance. The fingerprints stay, so every
    hash still verifies. This replaces the current `redactInstance`
    wipe-`data`-to-`{}` approach; the `data-retention` spec's sentence
    "history carries no field values, so it needs no redaction" stops
    being true the moment this lands and must be rewritten in the same
    change.

  **Explicitly not the goal.**
  - Not tamper-*proof*, tamper-*evident*: a superuser can rewrite rows,
    silence the trigger (`session_replication_role = replica`), or drop
    the table; the checkpoint makes that detectable, never impossible.
  - Values in clear text on purpose. "Who was originally in this field"
    must be readable in the audit view without ceremony; an
    encrypt-at-rest variant (crypto-shredding, which would also have
    reached old backups) was considered 2026-08-25 and traded away for
    that readability. Consequence accepted by the owner: a backup taken
    before a redaction keeps the clear value until the backup itself
    expires — a rolling backup retention window is the answer, in ops
    documentation, not in this schema.
  - No full-instance snapshot per row. "State after step 3" is a replay of
    rows up to a `seq`, not a stored copy.
  - No key management. The salt is not a key; it exists so a nulled
    value cannot be recovered by brute-forcing `H(value)` over a small
    value space, and it dies with the value.
  - Not append-everywhere: `instance_comments` and `instance_attachments`
    stay outside this log and keep their delete-on-redaction handling.

  **Open, deliberately.** Whether actor identities (`actorId` in
  `history_entries`, claim records, comment authors) are themselves ever
  redactable is a separate decision with a different retention logic —
  removing them guts the audit trail's central question. And a redaction
  request arrives as "this person's data", not as an instance id; finding
  every instance holding that person needs the cross-instance query
  machinery of the aggregated-data-source / reporting topics, which were
  still under design when this entry was written.
- **Aggregated data source: a field's options read from other instances.** A
  design pass on 2026-08-25 settled the shape, in the same session as the
  instance audit log above. Not started.

  **The goal.** A field's option list can come from the field values of
  other instances. The worked case: an onboarding step offers only the
  laptops that no other running onboarding instance holds. The author
  configures it in a form, the publish validates it, and no author writes
  CEL or SQL to get it.

  **The design.**
  - A third data source registry type, `instance.query`, beside the
    existing `static` and `db.list`. Its config names the target process,
    a status set, a list of field comparisons, and which field supplies an
    option's value and which its label. A comparison's right side is a
    literal or a field of the *reading* instance, which is what makes the
    form cover real cases ("same location as this instance") instead of
    constants only.
  - Publish validates every field reference against the target process's
    field catalog, through the same registry-at-publish-time mechanism
    `db.list` already uses.
  - The studio's config form is generated from the handler's Zod schema by
    `src/engine/config-descriptor.ts`, so no second description of the
    form is maintained beside the schema.
  - Read authorization is the existing process-scoped `permission_grants`,
    checked at publish against the author.
  - Free SQL stays reachable, but only as a separate registry type against
    an *external* database, with the connection in operations config
    rather than in a process definition.

  **Explicitly not the goal.**
  - No SQL against the engine's own `instances` from any authoring
    surface. A query there would bypass tenancy, version pinning, and the
    redaction state of a value. `instance.query` is the only way in.
  - No CEL over foreign instances. The standing decision that keeps CEL
    data-source-blind is not reopened here. A `other.data.x == data.x`
    filter expression was weighed on 2026-08-25 and dropped: it needs a
    second CEL context, a publish check against a foreign catalog, and a
    translation to SQL, for cases the form already covers.
  - No per-field export lists and no cross-process release lists. An
    author changing process A never has to republish and migrate process
    B. That was the owner's stated reason for rejecting both.
  - No per-instance visibility. Consequence accepted on 2026-08-25: an
    actor granted read on process B sees, through a data source, values
    from every B instance, including instances they could not open in the
    app.
  - The form is a small query language, and calling it "no-code" would be
    a false claim. What it buys over free SQL is field ids as stable
    anchors that publish can check, a layer that hides how instance data
    is stored, and a boundary that can be widened later but never
    narrowed once definitions depend on it.

  **Open, deliberately.** Per-instance visibility ("who may see instance
  101") stays open, and it is a larger decision than this topic: the same
  rule would govern the instance list, the detail view, and reporting.
  Nothing carries such a list today — `assignment.candidates` covers the
  current step only, and `instance-query`'s spec states the read is not
  implicitly scoped to the calling actor. Two shapes were sketched on
  2026-08-25: accumulate participants as an instance moves through its
  steps, plus an optional per-process `visibleTo` naming the fields that
  carry people, for the starter-not-a-candidate gap. Adding it later only
  narrows a result set, so it invalidates no published definition.

  One property rests on the choice above and would end with it: because
  authorization settles at publish, runtime resolution needs no actor at
  all. A timer, an outbox delivery, an automatic transition, a migration,
  and a participant's open form all resolve the same list. Should
  per-instance filtering land, submission validation has to decide whether
  it checks membership against the viewer's list or the full one, and the
  actor-free execution paths need an answer for whose view they use.
- **Instance data tables: a report builder over instance field values.** A
  design pass on 2026-08-25 settled the shape, in the same session as the
  two entries above. Not started.

  **The goal.** A department builds a table of instances and reads their
  field values as columns. The worked case: HR lists every onboarding of
  the last twelve months with `new_employee`, `start_date` and
  `assigned_manager` as columns. The table is saved, named, and shared
  with the people who need it.

  **The design.**
  - The query half is the same one `instance.query` uses (target process,
    status, date range, field comparisons). Build it once, not twice. The
    output half differs: several fields become columns rather than one
    field becoming an option list.
  - `listInstances` deliberately carries no `data` payload, so this is a
    read beside it, not a widened version of it.
  - Column choices come from the **union** of the field catalogs of every
    version in range, each field marked with the versions that hold it. An
    instance spans versions over twelve months, and a backward-looking
    table is exactly the case that needs a field a later version dropped.
  - A cell is empty for three different reasons, and the three render
    differently: the field held no value, the field did not exist in that
    instance's version, and the value was redacted. One rendering for all
    three would make a reader draw wrong conclusions.
  - One computed column type, and only one: **merge**, which collects the
    first non-empty value from an ordered list of fields. It covers a
    value that moved between differently named fields across versions,
    for instances a migration plan never touched. Where two source fields
    both hold a value, the cell concatenates and marks the collision, and
    the editor counts the affected rows. Concatenating is ugly on purpose:
    overwriting produces a table that looks right and is wrong, which is
    the worse failure for a report. A merged column of mixed source types
    is text, so it sorts as text.
  - A saved report is a stored object with an `owner` and two principal
    lists, `viewers` and `editors`. Both hold actor ids and role or group
    names mixed, matched by the same `isEligibleCandidate` the assignment
    candidates already use. A personal report is not a mode: it is a
    report whose lists are empty. The owner cannot be removed from
    `editors`, so a delegate cannot lock out the person who built it.
  - Report visibility and process read grants **both** apply. A viewer
    without a `permission_grants` read on the target process gets an
    empty table. Sharing a report can therefore only narrow what someone
    already reads, never widen it, which is what makes an `anyone` share
    safe.

    The second half of that rests on a permission nothing carries yet.
    `Permission` (`src/auth/authorize.ts:77`) is `"publish" | "cancel" |
    "migrate"`, and no entry covers reading. A pass on 2026-08-25 priced
    a fourth one and found it additive rather than restrictive, because
    the bulk read is already closed: `src/http/routes.ts:437` runs
    `requireRole(actor, ADMIN_ROLE)` for `scope=all`, while `scope=mine`
    and `scope=started` justify themselves through the caller's own
    assignment or authorship and need no grant at all. So a `read`
    permission keeps `ADMIN_ROLE` as its short-circuit and lets a grant
    open one process to a non-admin, leaving an installation with no
    grant row every answer it had — the property the storage half
    shipped under. `listInstances`'s own docstring ("an unfiltered call
    returns every instance") describes the engine function, not the
    route above it, and reads as the opposite until the route is
    checked.

    Order settled 2026-08-25: the `read` permission first, as its own
    change against `authorization` and `instance-query`; the shared query
    core (see the aggregated-data-source entry above) second; this
    feature third. The cost of that order is that the first change this
    topic produces is not a table.

  **Explicitly not the goal.**
  - Not the three existing reporting views. Cycle time, bottleneck and
    SLA (`src/engine/reporting.ts`) compute over time and stay as they
    are. This is a different artifact that reads field values.
  - No expression language in the report editor. Merge collects values;
    it does not compute. Arithmetic, conditions and formatting rules are
    a second language beside CEL and are not built on speculation.
  - No aggregates, groupings or charts in the first shape. The owner's
    request was a table of instances and their values.
  - A report never grants data access. Rejected 2026-08-25 because it
    would turn sharing into permission delegation that no administrator
    sees in `permission_grants`.
  - No validation that blocks sharing a report with someone who lacks the
    process grant. Building a report for a viewer with no access to its
    source is an author mistake, not a case for the engine to prevent.
    A hint in the editor naming such a viewer is welcome; an error is not.
  - No as-of values. The table reads current values. Reading a value as
    of a past date becomes possible once the audit log above exists, and
    it is a later ask, not part of this.

  **Open, deliberately.** A download of the table (CSV for a department,
  NDJSON for a machine) is the obvious next request and is unbuilt; it
  meets the export question this file already records under Open
  questions. Sorting and filtering a table over field values reads
  `body->'data'` through expression paths with no index, the same shape
  `reporting.ts` already carries a note about for `startedAt`. That is
  where the owner's 2026-08-25 suggestion bites — promote the keys whose
  structure never changes (`processId`, `version`, `status`,
  `currentStepId`, `startedAt`, `startedBy`) out of `body` into real
  columns, retiring the expression indexes that stand in for them today.
  Which keys qualify, and the mechanism, are settled under its own entry
  below. The answer for this feature is that none of them unblock it:
  `data` is the key a report sorts and filters over, and `data` is the one
  key that can never be promoted, since its key set belongs to a process
  version.
- **Promoting standardized instance keys out of `body` into columns.** A
  design pass on 2026-08-25 settled which keys qualify, in the same session
  as the entry above, which asked for it. Not started.

  **The goal.** A predicate over an instance key reads a plain column
  through a plain index. Eight expression indexes stand in for that today
  (`instances_selection_idx`, `instances_claimed_by_idx`,
  `instances_candidates_idx`, `instances_parent_idx`,
  `instances_current_step_idx`, `instances_started_by_idx` — the last two
  added 2026-08-27 by `instance-query-core`, covering `currentStepId` and
  `startedBy` for the first time — plus the two the scheduler and the
  retention sweep own), and `(body->>'startedAt')` carries none at all
  (`src/engine/reporting.ts:91`).

  **The test a key has to pass.** Its structure is fixed by the runtime
  schema for every process and every version, never by a process author.
  `instance` (`src/schema/definition.ts:1144`) splits four ways under it.

  - Already a column, and still written into `body` as well:
    `instanceId`, `transitionSeq`, `redactedAt`. `redacted_at` is the
    precedent worth copying — one value in both places, the body
    unchanged as what `parseInstance` reads.
  - The six the entry above named: `processId`, `version`, `status`,
    `currentStepId`, `startedAt`, `startedBy`. Each is a scalar and each
    is somebody's predicate today.
  - Standardized, outside that six, each already carrying an expression
    index or an in-memory filter: `assignment.claimedBy` and
    `assignment.candidates` (`AssignmentState` is
    `{candidates, claimedBy?, claimedAt?}` and nothing else, and the two
    carry the inbox predicate, the hottest read in the product),
    `parent.instanceId`, `currentStepEnteredAt` (the retention sweep
    filters it in memory over the reduced row set),
    `chainedFrom` (no index, no reader, and a report dimension the moment
    somebody asks which instances a process started).
  - Never: `data`, whose key set belongs to a process version. `timers`,
    an array the scheduler already reduces to the one scalar it needs in
    `next_timer_at`. `definitionHash`, structurally eligible and nobody's
    predicate anywhere.

  **The mechanism.** A Postgres generated column
  (`GENERATED ALWAYS AS ((body->>'processId')) STORED`) costs no
  application change and cannot drift from the body, which a dual write
  can. One constraint bounds it: the expression must be immutable, and
  `jsonb ->> text` is while `text::timestamptz` is not, since that cast
  reads `DateStyle` and `TimeZone`. So a timestamp key takes a generated
  `text` column instead. Every writer produces
  `new Date().toISOString()`, and ISO-8601 in UTC orders lexicographically
  the way it orders chronologically, so a text column still ranges and
  sorts correctly. Probe that against Postgres 16 before relying on it.

  **The key stays in `body`.** Removing it would make `parseInstance`
  rebuild an `Instance` from a row plus a body at every read site in the
  engine, for no gain a promoted column does not already give.

  **Not a prerequisite for the report builder.** Its first shape filters
  by process and by date range, and `instances_selection_idx` plus
  `instances_created_idx` already cover both. `created_at` is an
  approximate double of `startedAt` — `DEFAULT now()` on the insert that
  writes the body a few milliseconds after the application clock stamped
  `startedAt`, and rows older than that column got `now()` at migration
  time, which orders that population among itself and nowhere near its
  real start. The one predicate this change cannot help is the one the
  report wants most, sorting and filtering over `body->'data'`, because
  `data` is the key that never qualifies.

  `instance-query-core` (2026-08-27) reaches the same two clocks from a
  different angle: it added `createdAfter`/`createdBefore` to the instance
  list read, bounding `instances.created_at` rather than `startedAt`. The
  cycle-time range above bounds `startedAt`; those filters bound
  `created_at`. One twelve-month question can therefore answer differently
  depending on which range a caller uses, and a later promotion of
  `startedAt` into a column inherits that question rather than closing it.
- **Process-scoped permissions: the filter, the draft scope, and the
  `permissions` booleans.** A design pass on 2026-08-15 settled the shape;
  `ROADMAP.md` stage 40 carries it in full. The seam shipped 2026-08-15 as
  `process-scoped-permission-seam`, and the storage half shipped 2026-08-16
  as `process-scoped-permission-grants`. `can(actor, permission, processId,
  db)` and `requirePermission` sit in `src/auth/authorize.ts` over three
  permissions; `src/auth/grants.ts` holds the `permission_grants` table's SQL
  behind them, and three `system:admin`-gated routes administer a grant.
  Nobody was blocked by the seam alone, and no account gained or lost access
  the day storage landed: an installation that writes no grant row keeps
  every answer it had.

  Three pieces stayed open, each its own later OpenSpec change. Two still
  are.

  The `scope=all` filter and the reporting aggregates turn a gate into a
  query predicate. That reaches `instance-query`, not `authorization`.

  Shape decided 2026-08-25, pulled forward by the instance-data-tables
  entry above, which depends on it. `Permission` gains a fourth member,
  `read`, with `ADMIN_ROLE` as its reserved short-circuit in the
  module-private `PERMISSION_ROLE`. `REPORTS_ROLE` stays what it is,
  "may use the reporting area", and does not become the short-circuit:
  area access and data scope are two questions, and one role answering
  both makes every later narrowing impossible. The three reporting
  aggregates (`src/http/reporting-routes.ts:40` and `:57`) each already
  take a `processId`, so `requireRole(actor, REPORTS_ROLE)` there becomes
  the role plus `read` on that process.

  The work is not the default. It is that a process-scoped grant cannot
  gate a query naming no process: `requireRole(actor, ADMIN_ROLE)` at
  `src/http/routes.ts:437` answers yes or no without one, and
  `requirePermission` needs one. Two answers exist.

  Keep it a gate, and
  `scope=all` without `ADMIN_ROLE` requires an explicit `processId`;
  that is cheap, and a report reads exactly one process, so it covers
  the case that pulled this forward. Or make it the predicate this
  paragraph originally named, restricting the result set to the granted
  processes. Build the first. The second waits for somebody asking for a
  list that spans processes, which nobody has.

  A draft-scoped `"author"` permission would let an installation limit who
  sees and edits which draft. `drafts.process_id` is scopeable — it is the
  table's own key, named from `PUT /drafts/:processId`'s first save — but
  every author reaches every draft today.

  The third piece closed 2026-08-19 as `scope-migration-plan-visibility`.
  The web areas reading `actor.roles` directly was framed as a gap across
  "the resource views," plural. An audit of every client-side role check in
  `packages/web` found it real in one place: the Studio Versions screen's
  "Plan migration" control. Publish and Cancel already rendered
  unconditionally and let the server's 403 carry the gate. `GET
  /drafts/:processId` now carries a `canPlanMigration` field, computed from
  the seam's own `can()`; the Versions screen reads it instead of a role.
  No general `permissions`-booleans framework landed — the audit found no
  second case that needed one.

  A directory group name is a principal, not a permission, and that decision
  is built, not pending: the identity provider is the authority on who
  someone is and which groups they hold, and the installation is the
  authority on what a group may do inside it. `claimToRoles`
  (`src/auth/jwt.ts:81`) passes an issuer's claim through verbatim, so
  `Actor.roles` needed no new shape. A grant maps a role string to a
  permission and a scope, `{ type: "process", config: { processId } }` the
  only type shipped. Encoding the scope into the grant's own name
  (`system:publish@proc_...`) was considered and dropped 2026-08-16: it would
  have inverted the split, making the directory admin the authority on this
  engine's own opaque ids, for an installation that never asked for it.
  `Actor.roles` stays a `string[]` of free text from either source;
  `auth_users.roles` stays a `TEXT[]`.

  `tmp/open-work-priority.md` tracks the three open pieces above.
- **CEL-readable data-source results.** Runtime option-list resolution for
  `field.dataSource` is DONE (see `docs/current-state.md`) — but `src/cel/check.ts`
  still registers a data source at no site (guards/output/transforms), so a CEL
  reference to one remains a publish error (`unknown variable`). Widening that is
  a separate, more consequential decision (an unresolvable reference there could
  only park a wait-state forever or throw mid-delivery); it stays deliberately
  out of scope until a concrete need for CEL-visible data-source values exists.

  Stage 29 tested that deferral and left it standing. `FieldDef.columnMapping`
  now writes a picked option's column attributes into ordinary catalog fields,
  before the transition commits, so a guard reads `data.<key>` as it always
  has. That is not a data source in the CEL context. The engine resolves the
  value, checks it against the target field's declared type, and writes it; CEL
  then reads a field, exactly as it does for a participant's own input. The
  unresolvable-reference hazard this row names never arises, because nothing
  CEL evaluates names a data source.
- **A data-source type whose resolution leaves the database.** Two types now
  ship: `"static"` and `"db.list"` (the latter reads two engine-owned tables,
  see `docs/current-state.md`). Neither leaves the engine's own Postgres, so
  neither exercises a resolution deadline of its own — `"db.list"` inherits the
  `Bun.sql` connection timeout, and `DataSourceHandlerDef.resolve` carries no
  deadline seam. The first type that reaches an outside service (e.g. an
  HTTP-backed data source) owns the timeout, cache and error semantics, which
  stay open questions not worth deciding speculatively. A deadline would widen
  `DataSourceContext`, the same additive move `heldValues` already made, so
  this is a deferral rather than a door that closes.
- **An assignment strategy whose resolution leaves the database.** Three
  strategies now ship: `"static"`, `"org.manager-of-starter"`, reading
  `auth_users.manager_user_id`, and `"org.group-members"`, reading the
  `groups` store (see `docs/current-state.md`). None leaves the engine's own
  Postgres, so none exercises a network failure mode.
  The resolution deadline (`ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, default 5000),
  the failure classification and the `assignment.unresolved` event all exist
  and already bound EVERY strategy. The first one reaching an outside
  directory inherits them rather than owning them. What it owns is its own
  retry and cache semantics, and whether a per-strategy deadline earns the
  granularity. A deferral, not a door that closes.

  This change closes the subprocess-return row-lock question: bounded by the
  deadline, not hoisted above the lock. A hoist needs an optimistic pre-read
  plus a sequence re-check. That re-check must still fall back to resolving
  under the lock when it fails. Hoisting makes the unbounded hold rarer
  without making it impossible. It also costs a second read of the parent
  row on every return delivery. Do not re-propose the hoist without a
  measurement showing the bounded hold is itself the problem.
- **The editor dock.** The studio canvas edit screen leaves its lower band
  empty on a tall window. `.studio-canvas-layout` is a grid that grows with
  the viewport, so the canvas fills its middle column to the bottom edge. The
  two side columns do not. The 12rem `EditRail` holds seven entries, and the
  22rem `ChecksRail` holds one line when a draft is clean. A design pass on
  2026-08-15 settled a dock for that band.

  The dock is a collapsible strip below `.studio-canvas-layout`, full width,
  collapsed by default. It renders only in the canvas sub-state of the
  structure surface. The form editor and the panels screen each replace the
  canvas, so neither shows it. Open, it takes a bounded height, and
  `.studio-canvas-layout` keeps its 36rem floor.

  Three tabs ship, in this order. **Changes** repeats what
  `VersionsScreen.diffAgainstBase()` does. An author reads what a publish
  would change without leaving the canvas. `versionDiffLogic.ts` exports
  `diffJson` and `canDiff` already, and both are pure. **Field matrix** mounts
  `FieldMatrixPanel`, and its `/edit/panels/matrix` route stays.

  The change corrected two claims above. Only `diffJson` carries the Changes
  tab. `canDiff` guards the versions screen's two-version selection, and the
  dock compares a draft against one version, so its guard is
  `baseVersion !== null` instead.

  And `FieldMatrixPanel` is not read-only. It writes flags through `setFlag`
  and `mutate`. A second mount still costs nothing, for a different reason:
  the panel takes no props, reads `useDraft()`, and holds no state the two
  mounts must share.

  **Paths** is the one new view. It gives one row per path across the whole
  process. The columns are source step, trigger, priority, guard and target.
  A canvas hides the rules that govern paths, and a table shows them. The
  row-building function is pure over `draft.workflow.steps`, and it carries
  the test.

  The dock persists nothing. Open state and active tab live in `EditorArea`
  component state, so they survive a selection change and reset on a reload.
  The dock claims no key in `saveState.layout`. That blob is per-draft, so one
  author's open dock would open for every author of the draft. A later
  "remember my dock" requirement needs a per-author preference store, which no
  area has today. It does not need a different dock.

  Two failure modes appear at ten times the current scale. A 200-step process
  gives the Paths tab 400 rows and the Field matrix 200 columns, one per step.
  The band's height is bounded. Both tabs scroll their own overflow, and a
  filter is the first thing that scale demands. Neither tab earns a filter at
  four steps and three fields.

  The Player was rejected for this band and stays rejected. A step form needs
  height, and the dock's whole premise is that it takes little. Docking the
  Player would either squeeze the canvas below its floor or show one field at
  a time. `screens/PlayerScreen.tsx` keeps its own route. Do not re-propose it
  as a tab without a design that answers the height.

  Two candidate tabs are deferred, not rejected. A translation-coverage grid
  would map every `LocalizedText` against every locale and mark the gaps that
  the `baseLocale` invariant permits. A CEL scratchpad would evaluate an
  expression against the draft's field catalog through `cel/check`. Tabs are
  additive, so each one costs a single entry in a list once the dock exists.

  The OpenSpec change writes a delta against `studio-canvas`. It touches
  `screens/EditScreen.tsx`, `app.css`, one new panel component, the studio
  i18n catalog, and `.claude/rules/ui-glossary.md`. That glossary entry
  registers **dock** as the one word for this part, beside *edit rail* and
  *checks rail*. The new component needs a name distinct from
  `panels/PathsPanel.tsx`, which is the per-step inspector panel. A real
  browser check covers the collapse, the tab switch, and the canvas floor.

  Built 2026-08-15 under the OpenSpec change `studio-editor-dock`, which is
  neither applied nor archived yet. The strip lives in `dock/EditorDock.tsx`
  over the pure `dock/pathRows.ts`, and the glossary carries the noun. This
  entry leaves the section when that change archives; the decisions that
  outlive it are the Player rejection, the two deferred tabs and the
  no-persistence rule.
- **No "Long text" field type.** `field-catalog-redesign`'s type picker lists
  the ten `baseFieldType` values under friendly names and stops there. The
  contract has no multiline string variant, and `tmp/Field Catalog
  Redesign/`, the Claude Design template that change realizes, is direction
  rather than a contract proposal — it shows a "Long text" entry the
  definition contract cannot back. A future multiline type is a separate
  definition-contract change, gated on a real need: rendered behavior (a
  `<textarea>` versus a single-line `<input>`) that a `string` field cannot
  already express through the existing renderer.
- **`FieldDef.default` now seeds an instance's initial data.**
  `field-catalog-redesign` shipped no editor for it and no runtime reader,
  since building one before the engine read the value would have shipped UI
  with no visible effect. `field-catalog-editor-rework` landed both:
  `createProcessInstance` (`src/runtime/api.ts`) fills a field's still-open
  slot from its catalog `default` — a `Literal` directly, an `Expression`
  through `src/cel/eval.ts::evalFieldMap` over the same stub `Instance` the
  seeding-in-progress `data` builds — before `validateSubmissionData` runs.
  The Values tab's Default-value zone writes the key. `submitAndTransition`
  never applies or re-checks a default; it seeds a fresh instance's data
  once, at creation, same as any other explicitly submitted value from that
  point on.
