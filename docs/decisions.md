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
- Which `instances.body` keys become real columns. The table holds
  `instance_id`, `transition_seq`, `body`, `resolve_state`,
  `resolve_claimed_at`, `cancel_sweep_state`, `next_timer_at`, `created_at`
  and `redacted_at`. Every other field of `Instance` lives inside the jsonb,
  and four expression indexes stand in for six of those keys:
  `instances_selection_idx` over `processId`/`version`/`status`,
  `instances_claimed_by_idx` over `assignment.claimedBy`,
  `instances_candidates_idx` (GIN) over `assignment.candidates`, and
  `instances_parent_idx` over `parent.instanceId`.

  Ten keys are standardized in the sense that matters here: the engine owns
  them, every instance carries them, and their shape never depends on a
  process version. Those are `processId`, `version`, `definitionHash`,
  `currentStepId`, `transitionSeq`, `status`, `startedAt`, `startedBy`,
  `currentStepEnteredAt` and `redactedAt`. Four of them have no index of any
  kind today — `definitionHash`, `currentStepId`, `startedAt` and
  `currentStepEnteredAt` — and `startedBy` has none either. `currentStepId`
  is the one that has since become urgent: the aggregated data source below
  filters on it on every form render, every submission, every timer fire and
  every automatic transition, and it is the only filter that whole feature
  has.

  Three keys cannot follow. `data` belongs to a process version, `timers` is
  a variable-length array, and `assignment.candidates` is a list that wants
  the GIN index it already has whether it sits in jsonb or in a `text[]`.

  Look at `transition_seq` and `redacted_at` first when this is designed.
  Both already exist as a column AND as a body key, so the promotion pattern
  has a precedent here, and so does its hazard: two writers of one fact drift
  apart when a later write site forgets one of them. A Postgres generated
  column (`GENERATED ALWAYS AS (body->>'currentStepId') STORED`) avoids that
  hazard entirely — it is derived, never written, indexable, and it changes
  no write site. It costs the same disk the duplicate would cost and leaves
  `body` canonical, which the read path needs, since it parses the whole jsonb
  back into an `Instance`. Shrinking `body` is a separate and much larger
  question, and nothing today asks for it.

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
  design pass on 2026-08-25 settled a shape, and a second pass the same day
  replaced it. Not started.

  **The goal.** A field's option list comes from the instances of another
  process. The worked case: a Laptop Inventory process holds one instance per
  device, and the step that instance stands on says where the device is — on
  the shelf, issued, in repair, retired. An onboarding step offers the devices
  whose own instance stands on the shelf step. The author configures it in a
  form, publish validates it, and no author writes CEL or SQL.

  **The design.**
  - A third data source registry type, `instance.query`, beside the existing
    `static` and `db.list`. A leaf handler like both of them: it reads, and it
    composes nothing.
  - The filter axis is `currentStepId`. `Instance.status` is the lifecycle
    (`running`, `completed`, `cancelled`, `faulted`), and every circulating
    laptop is `running` whichever step it stands on, so a status set answers
    the wrong question. The config names the target process, a set of step ids,
    a lifecycle status set defaulting to `running` alone, and a list of field
    comparisons whose right side is a literal or a field of the reading
    instance.
  - No set subtraction, which is what the second pass changed. The first pass
    put the pool in a `db.list` and removed the values other instances held,
    which needs either an `exclude` mode carrying a base-source reference or a
    fourth `set.difference` type. Both need one data source to resolve another,
    so both widen `DataSourceContext` with a resolver callback and add
    reference and cycle checks at publish. Putting the pool in a process
    retires all of that: an issued laptop is absent from the list because its
    own instance stands on the issued step, not because anything subtracted it.
    Do not re-propose the subtraction without a case whose universe is not
    itself a process.
  - An option's `value` is the source instance's id. Its `label` is a field of
    that instance, and its `attributes` are further fields, which
    `FieldDef.columnMapping` writes into the reading instance's own catalog
    fields. That path shipped in stage 29 and needs nothing new.
  - The id and the label copy are both stored, on purpose. The id survives a
    rename of the source: an asset tag corrected from `MBP-0041` to
    `LT-2024-0041` leaves the reference intact, and the picker shows the new
    tag for the same device. The copy survives the id: a cancelled source
    instance leaves a reference that resolves to nothing, and the frozen
    `MBP-0041` is then the only thing a reader has to go on. A field value
    alone was rejected on 2026-08-25 for two silent failures. A renamed source
    strands every holder of the old string. And nothing makes a plain field
    unique the way the `PRIMARY KEY (list_key, value)` of `data_list_values`
    makes a list value unique, so two identically tagged devices produce two
    options a submission cannot tell apart.
  - Every field `columnMapping` writes is `technical: true`. The engine
    resolves such a field readonly on every step regardless of the view, so the
    copy has exactly one writer, and a difference against the live value has
    exactly one cause.
  - `DataSourceContext` gains the reading instance (`{ id, data }`, the shape
    `AssignmentContext` already carries). The comparisons need it for their
    right side, and the self-exclusion rule below needs the id.
  - A query whose target is the reading instance's own process excludes that
    instance. A rule, not a config option: an instance's own contribution to an
    aggregate over its own process is never what a picker wants.
  - Publish validates every field and step reference against the union of the
    catalogs of the target's versions holding live instances, marking each
    reference with the versions carrying it and the instance count outside
    them. It reports rather than rejects, because `createProcessInstance`
    accepts an explicit `opts.version` and migration moves instances, so the
    population a publish-time check reads keeps moving after the check.
    Checking the latest version alone — what `validateProcessChaining` does for
    `process.start` — is right there because that action creates an instance at
    the latest version, and wrong here because this one reads instances across
    many.
  - Read authorization is the existing process-scoped `permission_grants`,
    checked at publish against the author.
  - Free SQL stays reachable, but only as a separate registry type against an
    external database, with the connection in operations config rather than in
    a process definition.

  **The missing half.** Nothing moves the laptop's own instance from the shelf
  step to the issued step when a participant picks it. `src/handlers/` holds
  `http.request`, `notification.email` and `process.start`, plus the
  engine-owned spawn and return pair. `process.start` creates an instance and
  the subprocess pair drives a new child, so no action type transitions an
  instance that already exists. Without one the option list never shrinks and
  the reading half is decorative. An author can reach `POST
  /instances/:id/submit` through `http.request` today, which leaves the
  transaction, authenticates as the configured credential rather than the
  participant, and guards the HTTP call rather than the business effect with
  the outbox's idempotency key. That is not the path to recommend for a
  first-class capability. Whether the transition action ships in this change or
  its own is undecided. That it ships is not.

  **Explicitly not the goal.**
  - No SQL against the engine's own `instances` from any authoring surface. A
    query there would bypass tenancy, version pinning, and the redaction state
    of a value. `instance.query` is the only way in.
  - No CEL over foreign instances. The standing decision keeping CEL
    data-source-blind is not reopened here, and it closes one tempting shape: a
    guard cannot compare a frozen copy against its live source, because
    `src/cel/check.ts` registers a data source at no site and such a reference
    is a publish error.
  - Drift between a frozen copy and its live source is information, not an
    alarm. A fleet re-tagged on one Monday puts every instance that ever
    referenced a device into disagreement on Tuesday, and not one of them has a
    problem. Three states render differently, the same three-way rule the
    report builder below applies to an empty cell: the reference resolves and
    agrees, the reference resolves and disagrees (show both, neutrally), the
    reference does not resolve (this one is the fault).
  - No per-field export lists and no cross-process release lists. An author
    changing process A never has to republish and migrate process B. That was
    the owner's stated reason for rejecting both.
  - No per-instance visibility. Consequence accepted on 2026-08-25: an actor
    granted read on process B sees, through a data source, values from every B
    instance, including instances they could not open in the app.
  - No composite field value. `Literal` already admits an object, so a field
    holding `{ ref, display }` is contract-legal, but `FieldOption.value` is a
    string, and membership validation, the renderer and every CEL read of
    `data.<key>` assume a scalar. The pointer and its copies stay separate
    fields, and the convention binding them belongs in
    `docs/authoring-guide.md`. A migration that splits a pointer from its
    copies in practice is the evidence that would justify the composite.
  - The form is a small query language, and calling it "no-code" would be a
    false claim. What it buys over free SQL is field ids as stable anchors that
    publish can check, a layer that hides how instance data is stored, and a
    boundary that can be widened later but never narrowed once definitions
    depend on it.

  **Open, deliberately.**
  - `config-descriptor.ts` cannot generate this form. Its supported subset is
    flat — string, number, boolean, enum, string-array — and a nested object
    property falls back to the studio's raw JSON textarea. A list of field
    comparisons is exactly that shape. Either the module learns nested arrays,
    or `instance.query` gets a hand-written form, which is the second
    description beside the schema that the module exists to prevent.
  - A source instance the step filter excludes while a reader still holds it.
    `db.list` settled the analogous case: a value is deactivated, never
    deleted, so `heldValues` keeps resolving its label. A cancelled or retired
    source instance needs the same treatment, resolved for a held reference
    even though the filter excludes it.
  - Two participants picking the same device. Submission validation re-resolves
    the option list under the reading instance's row lock, which narrows the
    window without closing it, since nothing locks the source instance. Once
    the transition action above exists the collision surfaces there instead, as
    a second delivery arriving at an instance no longer on the step its path
    departs from, which the transition machinery can refuse. That is a better
    failure than a silent duplicate, and still a post-commit one.
  - Per-instance visibility ("who may see instance 101") stays open, and it is
    a larger decision than this topic: the same rule would govern the instance
    list, the detail view, and reporting. Nothing carries such a list today —
    `assignment.candidates` covers the current step only, and `instance-query`'s
    spec states the read is not implicitly scoped to the calling actor. Two
    shapes were sketched on 2026-08-25: accumulate participants as an instance
    moves through its steps, plus an optional per-process `visibleTo` naming
    the fields that carry people, for the starter-not-a-candidate gap. Adding
    it later only narrows a result set, so it invalidates no published
    definition.

    One property rests on the choice above and would end with it: because
    authorization settles at publish, runtime resolution needs no actor at all.
    A timer, an outbox delivery, an automatic transition, a migration, and a
    participant's open form all resolve the same list. Should per-instance
    filtering land, submission validation has to decide whether it checks
    membership against the viewer's list or the full one, and the actor-free
    execution paths need an answer for whose view they use.
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
  where the owner's 2026-08-25 suggestion bites — promote the fields whose
  structure never changes (`processId`, `version`, `status`,
  `currentStepId`, `startedAt`, `startedBy`) out of `body` into real
  columns. Before `instance-query-core` (2026-08-27), only one expression
  index, `instances_selection_idx`, stood in for any of those six —
  covering three (`processId`, `version`, `status`); `currentStepId` and
  `startedBy` had no index at all. That change added
  `instances_current_step_idx` and `instances_started_by_idx`, covering
  those two as well, so five of the six now have an index and only
  `startedAt` does not. `instances` carried four expression indexes before
  that change and carries six after; the other three
  (`instances_claimed_by_idx`, `instances_candidates_idx`,
  `instances_parent_idx`) stand in for keys this note does not name. So a
  future promotion of these six fields into real columns retires three
  indexes — the selection, current-step and started-by ones — not six and
  not four. It is worth its own change and helps more than this feature.
  `data` itself cannot follow: its key set belongs to a process version.

  `instance-query-core` also adds `createdAfter`/`createdBefore` to the
  instance list read, bounding `instances.created_at` — a different column
  from the `startedAt` this note already flags for promotion. The cycle-time
  range above bounds `startedAt`; these filters bound `created_at`. The two
  clocks can differ (one is written by the engine at start, the other by
  Postgres's own `DEFAULT now()`), so one twelve-month question can answer
  differently depending on which range a caller uses. A later promotion of
  `startedAt` into a column inherits that question rather than closing it.
  The full column inventory is under Open questions, above.
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
