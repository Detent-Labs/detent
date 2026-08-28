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

  `migrateInstances` (`src/engine/migration.ts:557`) is the weaker case.
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
  in turn. Change 1 landed as `instance-audit-log-chain` — `89e4c70`
  implemented it, `9379091`/`f2631b6`/`7e003e8` corrected the design across
  review, `2b9b905`/`072b9e1` closed its verification gaps, and `591c6c4`
  archived it; its spec is `openspec/specs/instance-audit-log/spec.md`.
  The nightly checkpoint, once proposed as a third change, was struck
  2026-08-27 (see "Explicitly not the goal" below), vacating that slot.
  Change 2, `redactable-field-flag`
  (`openspec/changes/redactable-field-flag/`), is implemented and
  verified as of 2026-08-27, pending archive. Change 3,
  `instance-audit-log-view`, took the vacated slot and closes the
  readable-admin-view gap "Open, deliberately" named below: it adds the
  audit-entry read beside `verifyInstanceChain`, a `system:admin` route
  over each, and the instance screen's own Audit Log section. Three
  changes, in this order.

  1. The table, the two triggers sharing one diff function, the
     `set_config` call at all six write sites, the hash chain, and
     `verify_instance_chain()`. The chain belongs here rather than in a
     later change: a row written without `prev_hash` and `hash` needs its
     chain computed after the fact, and a chain computed after the fact
     proves nothing about the window before it existed. Either the log is
     chained from its first row, or the first rows are decoration. Built:
     the trigger function and `verify_instance_chain()` are defined in
     `src/engine/store.ts:658`; `verifyInstanceChain`, the TypeScript wrapper
     over that SQL function, is `src/engine/admin-queries.ts:259`.
  2. `FieldDef.redactable`, narrowing `redact_instance_fields()`'s field
     selection to the fields a process author marks redactable. This is the
     only piece change 1 left out: the salted `value_hash`, the definer
     redaction function, and the `redactInstance` rework all landed already.
     This one touches `FieldDef`, so it is a definition-contract change and
     carries that ceremony: the spec delta, the `examples/` sweep,
     `docs/authoring-guide.md`, and a test that rejects a violating input.
     Implemented 2026-08-27 as `redactable-field-flag`
     (`openspec/changes/redactable-field-flag/`), whose design.md settles
     three questions this entry left open: the instance's *currently
     pinned* version's catalog is the sole source of `redactable`, never
     the version active when a given audit row was written; a field id the
     audit log still holds but that catalog no longer declares stays
     unredacted through this path, an accepted opt-in limitation rather
     than a fail-safe default (see "Open, deliberately" below); and
     `redactable` places no restriction on `technical` — the two flags are
     independent, and only a `redactable` `group` field fails publish,
     mirroring `technical`'s own restriction on `group`.

  **The goal.** Every change to an instance's `data` leaves one readable
  record: which field, old value visible in clear text, who, when, from
  which write path. The record itself is complete by construction: the
  trigger fires on every write, so no site can omit a row. A reader with
  database access cannot alter or remove an entry without a later
  verification detecting it. Redaction of a field on request stays
  possible without breaking that verification, and it covers the field's
  whole history in one act, never a single step's value.

  Attribution is not complete the same way. A trigger sees `OLD` and `NEW`
  and nothing else, so the actor and the source reach it through a
  transaction-scoped setting each write path sets before its own statement
  — `SELECT set_config('detent.actor', $1, true)`, read back as
  `current_setting('detent.actor', true)`, whose second argument makes a
  missing setting return null instead of raising. A path that forgets
  writes a row with a null actor. That is a visible gap rather than a
  missing entry: the field change is still recorded, and a constraint or
  an operator query finds the unattributed rows. Nothing in `src/` sets a
  session variable today, so all six sites gain the call.

  **The design.**
  - One table, `instance_audit`, one row per field change (a delta, not an
    instance snapshot): `instance_id`, `seq`, `transition_seq`, `field_id`,
    `op` (`set` | `redact`), `value`, `salt`, `value_hash`, `prev_hash`,
    `hash`, plus actor, timestamp, and `source` (instance creation, user
    submit, action writeback, subprocess return, migration, redaction). The
    two sequence columns count different things. `seq` orders field changes
    within the instance and carries the chain. `transition_seq` is copied
    from `NEW.transition_seq`, which the trigger already holds, and it is
    the join to `history_entries` and `instance_events` — both key on
    `(instance_id, transition_seq)` and both index it. Without that column
    there is no way to ask which step changed a field, and the "state after
    step 3" replay below has no boundary to replay to.
  - Two Postgres triggers on `instances`, one `AFTER INSERT` and one
    `AFTER UPDATE`, sharing one diff function, write the rows. The `INSERT`
    half is load-bearing: `createProcessInstance` inserts a row whose
    `body` already carries start-form data and seeded `FieldDef.default`
    values, so an update-only trigger would leave every field's first
    value out of the log and record the second write as the first `set`.
    On insert `OLD` is null and the diff is every key in
    `NEW.body->'data'`. The triggers place the log below all six
    body-writing sites (`store.ts`'s own `createInstance`, `transition.ts`,
    `outbox.ts`, `subprocess.ts`, `migration.ts`, `retention.ts`) and below
    any future seventh, which is the completeness argument. The diff
    function runs with the invoking role's own privileges, never
    `SECURITY DEFINER`; the app role never receives `UPDATE` or `DELETE` on
    the table in the first place — there is nothing to revoke — so the
    application can only append.
  - Hash chain per instance: each row's `hash` covers the row's metadata,
    its `value_hash`, and `prev_hash`. Verification runs in SQL, as a
    `verify_instance_chain(instance_id)` function beside the trigger. The
    trigger hashes with the built-in `sha256()` over Postgres's own
    `jsonb` rendering of the value, which is deterministic but is not
    RFC 8785: `jsonb::text` emits `{"a": 1}` where
    `src/schema/canonical-json.ts` emits `{"a":1}`. A verifier written in
    TypeScript would have to reproduce a Postgres formatting detail exactly
    and would break silently on the first value shape nobody tried, so it
    calls the SQL function rather than recomputing the digest. The chain
    catches an edited row that is not also followed by a full chain
    recompute; it does not catch the recompute itself (see "Explicitly not
    the goal" below).
  - Every row's `value_hash` is `H(salt || value)` with a per-row salt,
    from the first row this change writes — not gated on a field flag.
    `salt` comes from `pgcrypto`'s `gen_random_bytes`, which `initSchema`
    installs. `FieldDef.redactable` (change 2) narrows which fields a
    redaction request offers, a pure authoring-time signal; it changes no
    hashing behavior, since every row is already salted. The name
    deliberately states the treatment, not a legal category: no
    `personal`, no `gdpr`, no `pii`.
  - Redaction = append one `redact` row per field the instance's audit log
    holds an entry for, naming who, when, and why, then null `value` and
    `salt` in every prior row of that field, across the whole instance.
    The fingerprints stay, so every hash still verifies. One narrower
    check stops, by design: a redacted row's `value_hash` can no longer be
    checked against its `value`, because the value is gone. The chain
    still proves that the row was not inserted, reordered or edited.
    Nulling a prior row is itself an `UPDATE` on a table the app role
    holds no `UPDATE` on, so redaction is a `SECURITY DEFINER` function
    that appends the `redact` rows and nulls the priors in one place. That
    function is the deliberate hole in the append-only property and the
    piece an auditor will ask about, so keep it short enough to read in
    one sitting. `redactInstance`'s existing `data`-to-`{}` wipe stays; the
    definer function runs alongside it, not in place of it. The
    `data-retention` spec's sentence "history carries no field values, so
    it needs no redaction" stays true of `history_entries` and
    `instance_events`, which is what the delta spec says — it is the
    audit log, a third relation, that now holds field values and needs the
    redaction the sentence used to rule out entirely.

  **Explicitly not the goal.**
  - Not tamper-*proof*, tamper-*evident*: a superuser can rewrite rows,
    silence the trigger (`session_replication_role = replica`), or drop
    the table. `verify_instance_chain()` catches an edit that leaves
    `prev_hash`/`hash` stale, but the same DB access that rewrites a row can
    also recompute every `hash` after it, so the chain alone does not catch
    that. A nightly, externally-signed checkpoint would have caught a
    recomputed chain too; it was proposed as change 3 and struck 2026-08-27,
    because the signing key and the checkpoint's own storage have to live
    outside the database to mean anything — the same actor able to rewrite
    `instance_audit` could otherwise just re-sign a fresh checkpoint over
    the tampered chain — and this repo has no key store or
    secret-management convention to hang that on. Revisit once one exists.
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
    `instance_drafts` stays outside too, for a second reason beside that
    one: a participant's in-progress form data never passes through
    `instances.body`, so the trigger never sees it, and an uncommitted
    draft is not a change to field data. It keeps its own
    delete-on-redaction handling as well.

  **Open, deliberately.** Whether actor identities (`actorId` in
  `history_entries`, claim records, comment authors) are themselves ever
  redactable is a separate decision with a different retention logic —
  removing them guts the audit trail's central question. And a redaction
  request arrives as "this person's data", not as an instance id; finding
  every instance holding that person needs the cross-instance query
  machinery of the aggregated-data-source / reporting topics, which were
  still under design when this entry was written.

  A field id an instance's audit log still holds, but the currently pinned
  version's catalog no longer declares, stays unredacted through
  `redact_instance_fields`. `redactable-field-flag`'s design.md accepted
  this 2026-08-27 rather than defaulting an unresolvable field id to
  redactable, to keep `redactable` an opt-in signal rather than inverting
  it for the one case an author's intent is least knowable. Revisit if a
  concrete "I deleted a field I needed to redact" case shows up; do not
  build a fix ahead of one.

  A readable admin view over the audit log was the one open gap here.
  `instance-audit-log-view` (change 3, above) closed it: `GET
  /admin/instances/:id/audit` reads the log itself, keyset-paginated,
  and `GET /admin/instances/:id/audit/verify` exposes
  `verifyInstanceChain` (`src/engine/admin-queries.ts:259`), which
  previously had no caller anywhere in `src/http` or `packages/web`. The
  instance screen's Audit Log section renders both, so an operator now
  reads the log and its verified state through the product, not only by
  querying the database directly.
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
  - The read this handler needs exists already in most respects, built for a
    different consumer since this entry was written. `instance-data-query`'s
    `queryInstances` (`src/runtime/api.ts:1512`, shipped 2026-08-27 as
    `instance-query-core`, now archived) filters instances by `processId`,
    `status`, `currentStepId`, `startedBy`, `claimedBy`, `excludeInstanceId`,
    `createdAfter`/`createdBefore` and a `dataWhere` list of field/operator/
    literal comparisons, and returns each match's `instanceId`, `version`,
    `data` and `redactedAt`. That covers every filter axis this design names
    but one: `dataWhere`'s right side is a scalar literal only
    (`instance-data-query`'s spec, "A right side SHALL be a scalar literal"),
    never a field of the reading instance. `instance.query`'s `resolve`
    substitutes the reading instance's field values into those comparisons
    itself, then calls `queryInstances` for the rest, rather than issuing its
    own SQL against `instances`.
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
    aggregate over its own process is never what a picker wants. `queryInstances`
    already carries an `excludeInstanceId` filter built for this same purpose in
    `instance-data-query`, so this rule costs `instance.query`'s handler nothing
    beyond passing its own reading-instance id through.
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

    The second half of that rested on a permission nothing carried yet.
    `Permission` (`src/auth/authorize.ts:77`) was `"publish" | "cancel" |
    "migrate"`, with no entry covering reading. A pass on 2026-08-25 priced
    a fourth one and found it additive rather than restrictive, because
    the bulk read was already closed: `src/http/routes.ts:449` ran
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

    That order did not hold on timing, though the sequence still landed.
    The shared query core landed 2026-08-27 as `instance-query-core`
    (archived; see `instance-data-query`'s spec) ahead of the `read`
    permission. `process-read-permission` has since applied:
    `Permission` (`src/auth/authorize.ts:77`) now admits `"read"`, mapped
    to `ADMIN_ROLE`, and `scope=all` routes through it when the request
    names a `processId`. The **report builder itself stays open** — this
    change ships only the process-scoped `read` gate on `GET /instances`,
    not the report/table feature this entry describes, and not the
    reporting-routes migration (`REPORTS_ROLE` → `read` on the three
    aggregate routes) `process-read-permission/proposal.md` scopes out as
    its own later change.

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
  `src/http/routes.ts:449` answers yes or no without one, and
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

  `openspec/changes/process-read-permission/` has applied the `read`
  permission piece above: `src/auth/authorize.ts:77`'s `Permission` type
  now admits `read`, mapped to `ADMIN_ROLE`.
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
- **The editor dock: three surviving decisions.** The dock itself shipped
  under `studio-editor-dock` (archived), and `docs/current-state.md` and
  `.claude/rules/ui-glossary.md` describe it as built. Three decisions from
  that design pass outlive the build log and still govern later dock work.
  - The Player was rejected for this band and stays rejected. A step form
    needs height, and the dock's whole premise is that it takes little.
    Docking the Player would either squeeze the canvas below its floor or
    show one field at a time. `screens/PlayerScreen.tsx` keeps its own
    route. Do not re-propose it as a tab without a design that answers the
    height.
  - Two candidate tabs are deferred, not rejected. A translation-coverage
    grid would map every `LocalizedText` against every locale and mark the
    gaps that the `baseLocale` invariant permits. A CEL scratchpad would
    evaluate an expression against the draft's field catalog through
    `cel/check`. Tabs are additive, so each one costs a single entry in a
    list once the dock exists.
  - The dock persists nothing, deliberately. Open state and active tab live
    in `EditorArea` component state, so they survive a selection change and
    reset on a reload. The dock claims no key in `saveState.layout` — that
    blob is per-draft, so one author's open dock would open for every author
    of the draft. A later "remember my dock" requirement needs a per-author
    preference store, which no area has today; it does not need a different
    dock.
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
