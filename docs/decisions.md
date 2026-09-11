<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons -->
# Decisions: open questions and deferrals

Forward-looking counterpart to `docs/current-state.md`, which describes what
exists. This file records what was decided and not yet built, what still
needs a decision, the reasoning behind decisions that have since shipped,
and the open findings of the 2026-08-18 code review. `ROADMAP.md` carries
stage-by-stage status.

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.
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
- An item list, the repeating sub-table an expense claim needs: five lines,
  each holding a date, an amount and a category. The flat `data` object keyed
  by `fieldId` cannot hold that, and the definition contract promises that
  flatness. Under a sub-table CEL sees `dyn` and the generated columns find
  nothing. An author who needs it today declares `pos1_betrag`, `pos2_betrag`
  and further keys by hand, so the ceiling is whatever number they pick in
  advance. `openspec/changes/archive/2026-08-30-field-model-type-format-control/field-model-redesign.md` records this as S1 and assigns it
  change 4, which depends on `field-model-type-format-control`. Nothing is
  designed yet, and the open question is what shape holds the rows without
  breaking CEL, the generated columns and instance migration at once.
- Which `instances.body` keys become real columns. The table holds
  `instance_id`, `transition_seq`, `body`, `resolve_state`,
  `resolve_claimed_at`, `cancel_sweep_state`, `next_timer_at`, `created_at`
  and `redacted_at`. Every other field of `Instance` lives inside the jsonb,
  and six indexes stand in for eight of those keys. Three are expression
  indexes over keys no column carries: `instances_claimed_by_idx` over
  `assignment.claimedBy`, `instances_candidates_idx` (GIN) over
  `assignment.candidates`, and `instances_parent_idx` over
  `parent.instanceId`. The other three are plain btrees over generated
  columns: `instances_selection_col_idx` over
  `process_id`/`version`/`status`, `instances_current_step_col_idx` over
  `current_step_id` and `instances_started_by_col_idx` over `started_by`.
  All six live in `initSchema` (`src/engine/store.ts`).

  Change 1 (2026-08-30) promoted six of those keys into generated columns and
  left the three indexes over them in expression form. Change 3
  (`rebuild-instance-expression-indexes`, 2026-09-01) rebuilt those three onto
  the columns and moved the reader predicates with them. The promotion entry
  below carries the numbers.

  Ten keys are standardized in the sense that matters here: the engine owns
  them, every instance carries them, and their shape never depends on a
  process version. Those are `processId`, `version`, `definitionHash`,
  `currentStepId`, `transitionSeq`, `status`, `startedAt`, `startedBy`,
  `currentStepEnteredAt` and `redactedAt`. Three of them have no index of any
  kind today: `definitionHash`, `startedAt` and `currentStepEnteredAt`.
  `currentStepId` was the urgent one when this entry was written, because the
  aggregated data source below filters on it on every form render, every
  submission, every timer fire and every automatic transition, and it is the
  only filter that whole feature has. `instance-query-core` closed that on
  2026-08-27 with the expression index above, so what remains here is the
  column question, not a missing index.

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
- Three more display-element shapes for the `view`: a chart, a read-only
  table and a markup block. `openspec/changes/archive/2026-08-30-field-model-type-format-control/field-model-redesign.md` records this
  as S2 and assigns it change 3, which shipped the first of five, the
  note (`field-model-view-note`, `ViewNote`/`ViewEntry` in
  `src/schema/definition.ts`). The remaining three wait on their own design:
  each is one more `ViewEntry` union member, and each needs its own decision
  of what config it carries (a table names which fields form its columns; a
  chart names a data source and an axis mapping; markup needs a decision on
  whether it accepts anything beyond plain text). Nothing is designed yet for
  any of the three.

  `field-model-redesign.md` also parked a fifth shape here, a tab panel.
  This change answers it with a view-level `tabs` list instead of the
  nesting `ViewEntry` member the record above described.
- Studio's native `<dialog>` confirm dialogs do not fully hold a keyboard
  user inside them. `stylex-phase-3-studio`'s own task 11.5 keyboard walk
  found two gaps, both pre-existing and unrelated to that phase's CSS-only
  change: verified via the untouched JS in `ProcessHeaderBar.tsx`'s
  `useConfirmDialog` and `ProcessesScreen.tsx`'s `StartPickerDialog`.

  First: Tab from the publish- and discard-confirm dialogs' focused Cancel
  button lands on `<body>`, not the Publish button before it in DOM order.
  `useConfirmDialog`'s own comment already names the cause candidate: three
  separate focus mechanisms race on open (an `autoFocus` prop, React 19's
  own commit-time `.focus()`, and `showModal()`'s native focusing steps),
  and the last of those three re-focuses the declining control after
  `showModal()` already ran. That late re-focus is the untested candidate
  cause: it may never register with the browser's own tab-order
  bookkeeping for the modal.

  Second: `StartPickerDialog` and `PromotionPreviewDialog` (`+ New
  process`, "Import a promoted version") call `showModal()` on mount with
  no cleanup. Escape and Cancel both close the dialog and drop focus to
  `<body>` instead of returning it to the button that opened it.
  `useConfirmDialog`'s own cleanup effect is the fix these two dialogs
  lack; neither component uses that hook.

  No follow-up change tracks this yet. It belongs to `studio-publish` or
  `spa-accessibility`, not `web-styling`: a CSS migration cannot cause or
  fix either gap.
- `NotFoundError` is served as HTTP 500 where most APIs answer 404. The
  mapping sits at `src/http/errors.ts:95`, and the header comment at `:10-16`
  calls it the one exception carved out of the message-free fallback. The
  2026-08-01 code review rated it Medium as its ARCH-1: a request for a
  nonexistent instance raises the 5xx rate, so an alert built on that rate
  fires on a client typo. The archived design
  `openspec/changes/archive/2026-07-29-correct-api-error-responses/design.md`
  kept the mapping on purpose and closed with "Recorded as an open question".
  This entry is that record.

  The live spec pins the mapping at three sites.
  `openspec/specs/http-wrapper/spec.md:215` holds the status-table row,
  `http-wrapper/spec.md:242` the scenario that maps a typed not-found error
  to 500, and `http-wrapper/spec.md:1665` the attachment requirement. Moving
  to 404 is a contract change for every consumer plus a spec change at all
  three sites, so it needs its own OpenSpec change. Nothing here decides it.
- The `richtext` format. A multiline string is still a string, and nothing
  validates it differently, so `multiline` is a control. A `richtext` value is
  markup instead. That is what puts it on the `format` axis: a
  `notification.email` handler must know before it escapes the value.

  The member waits for a change of its own, because markup raises storage,
  sanitizing and editor questions. Markdown storage is the cheaper answer to
  the first of those. D7 and D20 of the record archived beside
  `field-model-type-format-control` state this.
- The `image` and `signature` formats. Both refine a `file`, and a `file` is
  opaque today: `JS_TYPE` maps it to `"any"` at `src/schema/definition.ts:407`.
  A format over an unbuilt type buys nothing. Both wait until a file field
  carries a value the engine can read. D20 of the record archived beside
  `field-model-type-format-control` states this.
- The `slider` and `stars` controls. Neither is a native HTML control, so each
  needs its own keyboard and screen-reader work. Nobody has asked for either.
  D21 of the record archived beside `field-model-type-format-control` states
  this.
- An `items` key for a typed list. A `list` holds strings today, and a list of
  numbers would add an `items` key that types the members. This differs from
  S1 above: S1 is a repeating sub-table of rows and columns, while `items`
  types the members of one flat list. Do not add the key until a process needs
  a list of something other than strings. D3 of the record archived beside
  `field-model-type-format-control` states this.
- S3, catalog scope. Reuse of one field across several processes raises a
  scoping question, and the catalog is per-process today. The record left it
  out of scope, and nothing is designed.
  `openspec/changes/archive/2026-08-31-field-model-person-format/proposal.md:85`
  cites the label and states no content. S3 of the record archived beside
  `field-model-type-format-control` states it.
- S4, hierarchical option sets. The record settled this one as a placement,
  and it opens no shape. A choice tree belongs to the data source that
  supplies the options, and not to the field that binds to that source. A
  change that builds one starts at the data source, never at `FieldDef`. S4
  of the record archived beside `field-model-type-format-control` states it.
- `docs/current-state.md:482` says the Runtime API Layer "has no
  assignment/claim enforcement". `requireSubmitAuthority` in
  `src/runtime/api.ts:1294` enforces both today, called from
  `submitAndTransition` and its sibling at `:1354` and `:1389`. The line is
  wrong as a statement of the present. Fixing it settles a question the
  document has never answered: whether it describes the tree as it stands,
  or collects dated stage records that stay true of their stage. Several
  other passages read as stage records. The 2026-09-09 audit deferred the
  fix on that ground, and no change owns it yet.
- `THIRDPARTY.md:36` lists `postgres:16` as the deployment's database image,
  and `:44` repeats "the deployment pins 16". No tracked file states that
  pin: the devcontainer compose runs `postgres:latest`, the deployment
  runbook names no image, and the compose stack that does pin it lives
  untracked under `tmp/`. `scripts/thirdparty.ts` does not generate the
  container tables. Either the pin gets a tracked source or the row says
  where it comes from.

## Decided and built (kept for the reasoning, not for the work)
- **Instance audit log: a tamper-evident change record for field data.**
  Shipped in full. A design pass on 2026-08-25 settled the shape; the owner
  approved each piece in turn. All three changes landed and archived, in
  this order. Change 1 landed as `instance-audit-log-chain` — `89e4c70`
  implemented it, `9379091`/`f2631b6`/`7e003e8` corrected the design across
  review, `2b9b905`/`072b9e1` closed its verification gaps, and `591c6c4`
  archived it; its spec is `openspec/specs/instance-audit-log/spec.md`.
  The nightly checkpoint, once proposed as a third change, was struck
  2026-08-27 (see "Explicitly not the goal" below), vacating that slot.
  Change 2, `redactable-field-flag`
  (`openspec/changes/archive/2026-08-27-redactable-field-flag/`), shipped
  and archived 2026-08-27. Change 3, `instance-audit-log-view`
  (`openspec/changes/archive/2026-08-28-instance-audit-log-view/`), took
  the vacated slot and closed the readable-admin-view gap "Open,
  deliberately" named below: it adds the audit-entry read beside
  `verifyInstanceChain`, a `system:admin` route over each, and the instance
  screen's own Audit Log section. Shipped and archived 2026-08-28. Nothing
  in this topic is left to build; the two items under "Open, deliberately"
  below are accepted deferrals, not open work.

  1. The table, the two triggers sharing one diff function, the
     `set_config` call at all six write sites, the hash chain, and
     `verify_instance_chain()`. The chain belongs here rather than in a
     later change: a row written without `prev_hash` and `hash` needs its
     chain computed after the fact, and a chain computed after the fact
     proves nothing about the window before it existed. Either the log is
     chained from its first row, or the first rows are decoration. Built:
     the trigger function is defined at `src/engine/store.ts:652` and
     `verify_instance_chain()` at `:697`; `verifyInstanceChain`, the
     TypeScript wrapper over that SQL function, is
     `src/engine/admin-queries.ts:337`.
  2. `FieldDef.redactable`, narrowing `redact_instance_fields()`'s field
     selection to the fields a process author marks redactable. This is the
     only piece change 1 left out: the salted `value_hash`, the definer
     redaction function, and the `redactInstance` rework all landed already.
     This one touches `FieldDef`, so it is a definition-contract change and
     carries that ceremony: the spec delta, the `examples/` sweep,
     `docs/authoring-guide.md`, and a test that rejects a violating input.
     Implemented 2026-08-27 as `redactable-field-flag`
     (`openspec/changes/archive/2026-08-27-redactable-field-flag/`), whose
     design.md settles
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
  `verifyInstanceChain` (`src/engine/admin-queries.ts:337`), which
  previously had no caller anywhere in `src/http` or `packages/web`. The
  instance screen's Audit Log section renders both, so an operator now
  reads the log and its verified state through the product, not only by
  querying the database directly.
- **Aggregated data source: a field's options read from other instances.** A
  design pass on 2026-08-25 settled a shape, and a second pass the same day
  replaced it. Shipped 2026-08-29 as `instance-query-data-source`.

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
    `queryInstances` (`src/runtime/api.ts:1868`, shipped 2026-08-27 as
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
  - `DataSourceContext` gains the reading instance, `{ id, processId, data,
    baseLocale }` — not the sibling `AssignmentContext.instance`'s own shape:
    that one is `{ id, startedBy, data }`. Each carries what its own
    dimension needs and nothing the other one does. The comparisons need
    `data` for their right side, the self-exclusion rule below needs `id`
    and `processId`, and wrapping a resolved label as `LocalizedText` needs
    `baseLocale`.
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

  **The missing half — closed.** Nothing moved the laptop's own instance from
  the shelf step to the issued step when a participant picked it, because no
  action type transitioned an instance that already existed: `process.start`
  created a new one, and the subprocess pair drove a new child. Shipped
  2026-08-29 as its own change, `instance-transition-action`: a fourth
  author-visible handler, `instance.transition`, alongside `http.request`,
  `notification.email` and `process.start`. Its config names the target
  process, a field of the acting instance holding the picked instance's id,
  and a manual path on the target's current step. It drives the target along
  that path as the system actor, appending an `instance.transitioned-by-action`
  event on the target that doubles as the redelivery guard. See its own
  design.md for the collision, redelivery and permanent-failure rules.

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
  - `config-descriptor.ts` cannot generate this form — resolved by a
    hand-written form instead of teaching the module nested arrays. Its
    supported subset is flat — string, number, boolean, enum, string-array —
    and a nested object property falls back to the studio's raw JSON
    textarea. A list of field comparisons is exactly that shape, so
    `instance.query` ships its own form,
    `packages/web/src/areas/studio/panels/shared/InstanceQueryForm.tsx`, the
    second description beside the schema the module exists to prevent, taken
    deliberately.
  - A source instance the step filter excludes while a reader still holds it
    — resolved the same way `db.list` settled the analogous case: a value is
    deactivated, never deleted, so `heldValues` keeps resolving its label. A
    cancelled or retired source instance gets the same treatment:
    `src/engine/instance-query-source.ts:145-153` re-queries by
    `instanceIds` alone, with no step/status/comparison filter, and merges
    any held-only match after the offered list.
  - Two participants picking the same device — resolved by
    `instance-transition-action`. The collision surfaces where that change
    predicted: a second `instance.transition` delivery arriving at a target no
    longer on the path's source step, which the handler refuses permanently
    rather than retrying. A genuinely concurrent pair of deliveries that both
    find the target still on that step races inside the target's own
    optimistic-concurrency check instead; the loser is refused the same way.
    Either way one participant's device moves and the other's delivery
    dead-letters, naming the step the device stands on — a better failure than
    a silent duplicate, and still a post-commit one.
  - Per-instance visibility ("who may see instance 101") — decided 2026-09-01,
    after the options were written up and measured against a 200 000-instance
    fixture. Shipped as `instance-visibility-set`. The rule is an
    engine-maintained set of principals per instance, `instance_principals`,
    never a rule derived from the definition. The engine appends to it at four
    points: instance creation adds the starter, step entry adds the entered
    step's candidates, a claim or delegation adds the claimant, and a
    subprocess spawn copies the parent's set into the child. The definition
    contract gained nothing, so the `visibleTo` field sketched on 2026-08-25
    was not built.

    The set has three consumers. The first is a fourth scope value on the
    instance list, `GET /instances?scope=visible`. The second, since
    `instance-visibility-view` (2026-09-02), is the direct read:
    `loadInstanceForActor` admits a participant the set names unless a
    revocation stands, after the live-assignment test and never before it,
    so list and detail agree. The starter is not exempt from a revocation.
    The third, since `report-row-visibility` (2026-09-02), is the report
    builder: `executeReport` and `previewReportDraft` narrow per row through
    the same joined row set, and an `ADMIN_ROLE` caller skips the narrowing.
    A `read`-grant holder's `scope=all&processId` list stays process-wide,
    since that admission carries no result-set predicate; stage 40's open
    piece is where the list would follow. The
    aggregate views (cycle time, bottleneck, SLA) stay unfiltered permanently:
    an aggregate over a partly invisible population would either report a
    number the reader cannot reconcile or refuse to answer at all, and the
    process owner who reads them is not the audience the rule protects.

    An administrator revokes and grants per person per instance, gated by a
    fifth `Permission` value, `"visibility"`. A revocation names the person,
    never the principal they matched by, so revoking Anna leaves every other
    holder of her group untouched. A live assignment outranks a revocation at
    read time, so nobody is ever holding work they cannot open. No commit path
    ever clears a revocation, so a bulk migration cannot silently undo an
    operator's decision.

    The property that rested on the earlier answer survives untouched. Runtime
    resolution still needs no actor, because nothing in the engine reads the
    principal set. The timer, the outbox delivery, the automatic transition and
    the migration all commit exactly as before. Submission validation is
    unchanged: it still checks membership against the full resolved list, since
    the set narrows a query result and nothing else. A migration is the one
    step entry that appends nobody, because it carries the instance's existing
    assignment rather than resolving the target step's.
- **Instance data tables: a report builder over instance field values.** A
  design pass on 2026-08-25 settled the shape, in the same session as the
  two entries above. Shipped 2026-08-28 as `instance-data-tables`.

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
    `Permission` (`src/auth/authorize.ts:78`) was `"publish" | "cancel" |
    "migrate"`, with no entry covering reading. A pass on 2026-08-25 priced
    a fourth one and found it additive rather than restrictive, because
    the bulk read was already closed: `src/http/routes.ts:481` ran
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
    `Permission` (`src/auth/authorize.ts:78`) now admits `"read"`, mapped
    to `ADMIN_ROLE`, and `scope=all` routes through it when the request
    names a `processId`. `process-read-permission` shipped only the
    process-scoped `read` gate on `GET /instances`, not the report/table
    feature this entry describes; `instance-data-tables` closed that gap
    2026-08-28. The reporting-routes migration (`REPORTS_ROLE` → `read` on
    the three aggregate routes)
    `archive/2026-08-27-process-read-permission/proposal.md` scopes
    out stays its own later change — `instance-data-tables` did not fold it
    in either.

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
  as the entry above, which asked for it. Change 1, the six scalars below,
  landed as `promote-instance-scalar-columns` (2026-08-30). Change 2 (the
  assignment pair, `parent.instanceId`, `currentStepEnteredAt`,
  `chainedFrom`, and a rebuild of the five expression indexes those and the
  six scalars share) shipped in three commits, pushed and never merged. The
  annotated tag `change2-rejected` holds them. A benchmark on 2026-09-01 then
  rejected it. Change 3, the rebuild of the three expression indexes no
  Change 2 column replaces, shipped 2026-09-01 as
  `rebuild-instance-expression-indexes`.

  **Change 2: built, measured, rejected.** The five columns bought no
  runtime. Numbers from the 2026-09-01 benchmark, 200,000 rows, median of
  nine `EXPLAIN (ANALYZE, BUFFERS)` runs after a warm-up:

  - Inbox predicate, an actor with rows: 1.336 → 1.323 ms. An actor without
    rows: 1.264 → 1.287 ms.
  - Plans matched node for node, at identical buffer counts and identical
    index sizes.
  - Heap 104 → 116 MB, about 63 byte per row, +11.6%.
  - 200,000 inserts 1852 → 1960 ms, +5.8%.

  The tag `change2-rejected` is the evidence, and its annotation carries this
  verdict. A tag rather than a branch, for two reasons. Nobody can merge it by
  accident, and it survives a branch cleanup. Nobody needs to redo that work,
  and nobody should read the missing merge as work lost.

  **Change 3: measured, worth building.** The rebuild pays, and it needs no
  column Change 2 would add.

  - `liveVersionCounts` 1.549 → 0.343 ms, because the column form allows an
    index-only scan.
  - Orphan scan 5.990 → 2.816 ms. Migration population scan
    2.568 → 1.548 ms.
  - The selection index's write surcharge drops from +24.8% to +17.1%, at an
    unchanged 1456 kB index size.
  - Dropping the three indexes outright is no option. Every query falls to a
    seq scan, 18 to 21 ms.
  - Narrowing them is no option either. `process_id` alone triples the
    migration scan, 1.548 → 4.771 ms.

  **Change 3 needs only the Change 1 columns.** A two-world run confirmed
  that. It applied Change 3 once against `main` and once against the
  Change 2 branch. The difference between the two sets of deltas sits
  between −0.018 and +0.185 ms. Runtimes ran from 0.05 to 5.9 ms. That is
  noise, and it carries no sign.

  Two counter-probes came back negative as well.

  - Postgres rejects an expression in an included column, so `INCLUDE` is
    genuinely column-only. It pays nothing while `listInstances` selects
    `body`, which keeps an index-only scan out of reach for the hottest
    read.
  - A composite spans one Change 1 key and one Change 2 key. In expression
    form it runs just as fast, 1.127 against 1.156 ms.

  **What would make Change 2 due after all.** Four named triggers, in
  descending order of sharpness.

  - The sharpest is a narrow projection that leaves out `body`. Every
    instance query selects `body` today, so an index-only scan stays out of
    reach and `INCLUDE` buys nothing. A summary query over `instance_id`,
    `process_id`, `status` and `claimed_by` reverses that. A covering
    `INCLUDE` index carries such a query whole, and no expression index
    copies that. Whoever writes one measures this question again.
  - A real foreign key on `parent.instanceId` needs the column. An
    expression index cannot carry a foreign key. The engine enforces that
    reference in application code today.
  - Wide `candidates` lists make Change 2 more expensive, not more due. The
    benchmark gave every list two entries. A group of 200 members
    duplicates 200 entries per row, so 11.6% is a floor there.
  - A `data`-heavy body cuts the other way. The benchmark body carries no
    `data`, so the fixed ~63 byte per row weigh heaviest there. Against a
    real body, 11.6% is the pessimistic bound.

  **The method trap.** Do not measure this schema casually.

  Every `ORDER BY` plus `LIMIT` query over `instances` flips between an
  index-scan plan and a sort plan. Small cost shifts are enough. That
  pathology appeared three times during the benchmark. Once it looked like a
  28-fold regression and was a heap-width artefact.

  Hold heap width, `VACUUM` state and hit count constant. Otherwise you
  measure the pathology instead of your question.

  **The goal.** A predicate over an instance key reads a plain column
  through a plain index. Eight expression indexes stood in for that before
  Change 1 (`instances_selection_idx`, `instances_claimed_by_idx`,
  `instances_candidates_idx`, `instances_parent_idx`,
  `instances_current_step_idx`, `instances_started_by_idx` — the last two
  added 2026-08-27 by `instance-query-core`, covering `currentStepId` and
  `startedBy` for the first time — plus the two the scheduler and the
  retention sweep own), and `(body->>'startedAt')` carried none at all.
  Change 1 gave it `instances_started_idx`, over the new generated
  `started_at` column, and rewrote `selectInRange` to use it
  (`src/engine/reporting.ts:87-104`); none of the other seven indexes
  changed.

  **The test a key has to pass.** Its structure is fixed by the runtime
  schema for every process and every version, never by a process author.
  `instance` (`src/schema/definition.ts:1157`) splits four ways under it.

  - Already a column, and still written into `body` as well:
    `instanceId`, `transitionSeq`, `redactedAt`. `redacted_at` is the
    precedent worth copying — one value in both places, the body
    unchanged as what `parseInstance` reads.
  - The six the entry above named: `processId`, `version`, `status`,
    `currentStepId`, `startedAt`, `startedBy`. Each is a scalar and each
    is somebody's predicate today. All six are the generated columns
    Change 1 added.
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
  sorts correctly. Change 1 probed both claims directly against Postgres
  16.15: the `timestamptz` cast does raise "generation expression is not
  immutable", and the plain `text`/`integer` generation expressions do
  succeed.

  **The key stays in `body`.** Removing it would make `parseInstance`
  rebuild an `Instance` from a row plus a body at every read site in the
  engine, for no gain a promoted column does not already give.

  **Not a prerequisite for the report builder.** Its first shape filters
  by process and by date range, and the selection index plus
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
- **"Long text" was rejected as a type and shipped as a control.**
  `field-catalog-redesign` listed the ten `baseFieldType` values under
  friendly names and stopped there, because the contract carried no multiline
  string variant. `tmp/Field Catalog Redesign/`, the Claude Design template
  that change realizes, showed a "Long text" entry the definition contract
  could not back. The rejection named the one thing that would reverse it:
  rendered behavior a `string` field cannot already express. Adding a type
  member was never the way to supply it.
  `field-model-type-format-control` supplies it as `control: "multiline"`,
  which renders a `<textarea>` over an ordinary `{"type": "string"}` field.
  The type enum gains no member, and only the renderer reads the key.
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
- **StyleX adopted as `packages/web`'s and `packages/form-ui`'s styling
  model.** `stylex-phase-0-tooling` installed the compiler, settled the
  token home in `packages/form-ui/src/tokens.stylex.ts`, gave `bun test` a
  stub-preload story, and migrated the shell header and register tab as the
  pilot. Full reasoning sits in that change's `design.md`, whose Migration
  Plan names the six-phase path: phase 0 (this change), then form-ui,
  shell/app/admin/reporting, studio non-canvas, canvas, and a cleanup phase
  that deletes the remaining hand-written area stylesheets. Each later
  phase is its own OpenSpec change against `web-styling`.

  Reopen triggers: two consecutive StyleX releases that each cost a build
  fix reopen the compiler-version decision (design.md's Risks).
  `unstable_moduleResolution.rootDir` alone resolved the form-ui-exported
  token module from `packages/web`, closing D8's one open question without
  the `aliases` option.

  Whether phase 2 splits into two changes is resolved: it does not.
  `stylex-phase-2-areas`'s own design.md D8 weighed phase 1's paid
  propose-review-apply-verify-archive overhead against paying it four
  times, once per area, for no independent-review benefit. Each area
  keeps its own commit boundary instead, so a mid-flight split would
  still cost little if the change proved unwieldy.

  Phase 1 (`stylex-phase-1-form-ui`) is done: `packages/form-ui`'s field
  renderer and `PathButtons` compile from StyleX, `form-ui.css` and its
  package export are gone, and `PathButtons` gained a `style` prop so a
  caller can extend its wrapper. Its own design.md introduced a pattern
  `web-styling` now states generally — a layout choice with a fixed set of
  outcomes is chosen among named styles in code, never read from a `data-*`
  attribute by a stylesheet — for phase 2 to build on rather than
  re-derive. Phases 2 through 5 remain: shell/app/admin/reporting, studio
  non-canvas, the canvas, and the cleanup phase that deletes the remaining
  hand-written area stylesheets.

  Phase 2 (`stylex-phase-2-areas`) is done: the shell's remaining nav
  wrapper and all four areas' stylesheets compile from StyleX now.
  `shell.css`, `app/app.css`, `admin/app.css` and `reporting/app.css`
  each carry only their D10/D11 literal reset block. `InstanceStatus`
  and `statusTone`'s closed unions became exhaustive `badgeTone`/
  `stampTone` lookups; `OutboxRow.status`'s open-ended string became a
  `Partial<Record<string, ...>>` lookup with the same no-op fallback the
  pre-migration CSS gave an unmatched status. Phases 3 through 5 remain:
  studio non-canvas, the canvas, and the cleanup phase that deletes the
  remaining hand-written stylesheets.

  Phase 3 (`stylex-phase-3-studio`) is done: every studio screen
  outside `canvas/` compiles from StyleX now. `app.css` carries only
  its `canvas/`-owned rules, the reduced-motion block, and
  `.studio-dialog::backdrop`, which stays literal permanently: every
  dialog still composes the `studio-dialog` class for that one rule,
  since `::backdrop` fails a real `@stylexjs/unplugin` build (design.md
  D12). Its own cleanup pass found the `.canvas-*` prefix was never
  the true phase 4 boundary (D14): five prefixed rules belonged to
  this phase's own `EditScreen.tsx`, and ten unprefixed rules belonged
  to `canvas/EditRail.tsx`. Phases 4 and 5 remain: the canvas, and the
  cleanup phase that deletes the remaining hand-written stylesheets.

  Phase 0's own Migration Plan row claimed `:popover-open` would see
  its first use in phase 3. That claim was wrong: phase 0 already used
  it for the shell account menu, and phase 2 reused it. `::backdrop`
  is the pseudo-element that saw genuine first use in phase 3, and
  design.md D12 is where its real-build failure is recorded.

  Phase 4 (`stylex-phase-4-canvas`) is done: `canvas/CanvasView.tsx`
  and `canvas/EditRail.tsx` compile from StyleX now. `app.css` carries
  only the reduced-motion block and `.studio-dialog::backdrop`.

  Two class names stay literal, by the change's own mandate.
  `canvas-node` backs `elementFor()`'s keyboard-focus `querySelector`.
  `panzoom-exclude` backs Panzoom's own exclude-class contract.
  `elementFor()`'s other two selectors moved off class qualifiers
  instead. A new `data-kind="edge"` attribute replaces the
  `.canvas-edge-group` qualifier. `.canvas-group-disclosure` dropped
  its own qualifier, since `data-group-id` was already unique.

  The change also closed `stylex-phase-3-studio`'s D2 deferral on
  `.canvas-group-name`. `EditScreen.tsx`'s group-rename label now
  reads its own compiled style. Both consumers of that shared class
  converted together.

  Phase 5 (`stylex-phase-5-cleanup`) is done, closing the six-phase
  migration. `shell.css` and the four areas' `app.css` files are gone.
  `global.css` now carries every rule they still held: the shell's
  `.shell`/`.shell > *` flex frame, one `prefers-reduced-motion` block,
  and `.studio-dialog::backdrop`. The reduced-motion block used to be
  four near-identical copies; three used `transition`/`animation: none`
  and the fourth, reporting's, used `animation-duration`/
  `transition-duration: 0.01ms`. One block, using reporting's technique,
  replaces all four, since nothing in the repo depends on the
  difference and the near-zero-duration form still lets a value applied
  through `transitionend` take effect.

  `.btn`/`.app-back` stay literal in `tokens.css` permanently: phase 2's
  D1 deferred their conversion to whichever phase converted the last
  file still writing that literal string, and no such phase followed.
  `openspec/specs/web-styling/spec.md` does not say so yet: it names
  `.app-back` nowhere, and the phase-5 paragraph with its scenario is a
  capability delta still owed by a change of its own.
  A dispatched sweep also corrected every literal-class citation this
  migration left stale in `.claude/rules/design-language.md`,
  `.claude/rules/ui-glossary.md` and six passages of
  `docs/current-state.md`. `packages/web/test/boundaries.test.ts` lost
  its own class-collision test: a compiled StyleX class cannot collide
  across areas the way a hand-written one could, so the risk the test
  guarded is gone, not merely unchecked.

## Decided, not yet built (each needs its own OpenSpec change)
- **Archivo as the written face.** The Type section of
  `.claude/rules/design-language.md` names Archivo. `tokens.css` sets both
  `--font-heading` and `--font-body` to `system-ui, sans-serif`, and neither an
  `@font-face` rule nor a font link exists anywhere in `packages/web`, so the
  reader's OS supplies the face today and it differs per platform. The
  two-weight rule holds either way: 800 for a heading and a button label, 400
  for everything else, nothing between. Deferred 2026-09-02 — we do not need
  Archivo yet. When it lands, self-host the woff2: the build-time CSP is
  `default-src 'self'` with no `font-src`
  (`packages/web/vite.config.ts:26`), so a self-hosted file needs no CSP change
  and no `frontend-security-headers` delta, while a Google Fonts link would
  need `style-src` and `font-src` additions plus that delta. It changes the
  type of every screen in all four areas, so it needs its own OpenSpec change,
  a browser check, and a `DESIGN.md` refresh. The studio area's `app.css`
  reasons from the two weights in a comment; that comment now names the
  written face rather than Archivo.
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
  aggregates (`handleReportingCycleTime`, `handleReportingBottleneck` and
  `handleReportingSla`, `src/http/reporting-routes.ts:141`, `:145` and
  `:149`) each already take a `processId`, so `requireRole(actor,
  REPORTS_ROLE)` there becomes the role plus `read` on that process.

  That file has grown since this was written. `instance-data-tables` put
  the saved-report routes beside the aggregates, so twelve handlers now
  gate on `REPORTS_ROLE`, not three. The report routes carry their own
  per-report `viewers`/`editors` check plus the process `read` grant, so
  they need no part of this migration. It stays scoped to the three
  aggregates above.

  Landed 2026-08-30 as `reporting-aggregate-read-permission`. The three
  aggregate routes now share `requireReportingAccess`
  (`src/http/reporting-routes.ts`), which runs `requireRole(actor,
  REPORTS_ROLE)` then `requirePermission(actor, "read", processId, db)`.

  The work is not the default. It is that a process-scoped grant cannot
  gate a query naming no process: `requireRole(actor, ADMIN_ROLE)` at
  `src/http/routes.ts:481` answers yes or no without one, and
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

  `openspec/changes/archive/2026-08-27-process-read-permission/` has
  applied the `read` permission piece above: `src/auth/authorize.ts:78`'s
  `Permission` type now admits `read`, mapped to `ADMIN_ROLE`.
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
- **A data-source type whose resolution leaves the database.** Three types now
  ship: `"static"`, `"db.list"` and `"instance.query"` (see
  `docs/current-state.md`). `"db.list"` reads two engine-owned tables;
  `"instance.query"` reads another process's instances through
  `queryInstances`. None leaves the engine's own Postgres, so none exercises
  a resolution deadline of its own — both reading types inherit the `Bun.sql`
  connection timeout, and `DataSourceHandlerDef.resolve` carries no deadline
  seam. The first type that reaches an outside service (e.g. an
  HTTP-backed data source) owns the timeout, cache and error semantics, which
  stay open questions not worth deciding speculatively. A deadline would widen
  `DataSourceContext`, the same additive move `heldValues` already made, so
  this is a deferral rather than a door that closes.
- **An assignment strategy whose resolution leaves the database.** Four
  strategies now ship: `"static"`, `"org.manager-of-starter"`, reading
  `auth_users.manager_user_id`, `"org.group-members"`, reading the
  `groups` store, and `"org.actor-from-field"`, reading the instance's own
  `data` and, for a `group_` value, that same store (see
  `docs/current-state.md`). None leaves the engine's own
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
- **The editor dock: three decisions that outlived it.** The dock shipped
  under `studio-editor-dock` (archived), and `studio-step-bench` deleted it.
  The process surface then replaced the edit screen under
  `studio-guided-surface`, so no strip stands below the tab body to hold a
  dock. Three decisions from that design pass outlive both the build log and
  the dock itself.
  - The Player stays rejected. Its reason was height, and a step form still
    needs more than a band gives. `screens/PlayerScreen.tsx` keeps its own
    route. Do not re-propose it as a tab without a design that answers the
    height.
  - Two candidates stay deferred, not rejected. Each one would be a tab on
    the process surface now, not a dock tab. A translation-coverage grid
    would map every `LocalizedText` against every locale and mark the gaps
    that the `baseLocale` invariant permits. A CEL scratchpad would evaluate
    an expression against the draft's field catalog through `cel/check`. The
    tab row is that list now, so neither one grew cheaper or dearer.
  - The process surface persists no per-author view state, deliberately. The
    open tab stands in the address; everything else lives in
    `ProcessSurface` component state, so it survives a selection change and
    resets on a reload. No view state claims a key in `saveState.layout`,
    and that blob is per-draft. One author's stored state would open for
    every author of the draft. A later "remember my view" requirement needs
    a per-author preference store, which no area has today.
- **The studio's seven remaining `confirm()` prompts.**
  `studio-publish-gate-and-report` converted the two on the publish path to
  the application's own modal dialog. The others stay:
  `root.tsx:86`, `EditScreen.tsx`'s arrange gate,
  `ProcessesScreen.tsx`'s draft discard, `TemplatesScreen.tsx`'s template
  discard, and three in `FieldCatalogPanel.tsx`. Two hardcode English rather
  than reading the catalog, in `ProcessesScreen.tsx` and
  `TemplatesScreen.tsx`. The navigation prompt at `root.tsx:86` is the odd one
  out: `studio-app` states the `confirm()`/`t()` pattern for it as a
  requirement, so converting it rewrites that requirement and every scenario
  under it. The other six belong to `studio-form-editor` and `studio-app`, and
  each carries its own facts, its own dialog copy and its own catalog keys.
  Deferred 2026-09-02, on capability ownership and effort, not on
  reversibility: two of the six discard server state and the studio carries no
  undo.
- **The 22 failure renders outside the studio edit screen.**
  `packages/web/src` rendered 27 failure states with no alert role.
  `studio-publish-gate-and-report` fixed five, all in the edit screen's own
  chrome, and narrowed the `spa-error-reporting` requirement to that screen to
  match. The remaining 22 sit in the app, admin and reporting areas, on the
  studio's other screens, and in the panels the edit screen itself mounts. A
  later change sweeps them into the same `studio-error-banner` shape and widens
  that requirement back out. Deferred 2026-09-02: the sweep touches four areas
  and every one of their capability specs, and the measured defect sat on the
  publish path.
- **The header reads "Unsaved changes" after a `PUT` that answered 200.**
  Observed on the studio edit screen. The path looks correct on the page: a
  defined save result makes `doSave` call `onSavedBodyChange(draft)`,
  `EditScreen.tsx` clones that body into `savedBody`, and `dirtyNow` compares
  the two by serializing both. So either something re-dirties the draft after
  the save, or the save returned nothing, and both readings need a
  reproduction. It is a dirty-state failure in `ProcessSurface`, not a publish
  failure: it shares no cause with the three defects
  `studio-publish-gate-and-report` fixed, and no file with them but
  `EditScreen.tsx`. Deferred 2026-09-02, at a cost of one wasted `PUT`: a
  permanently dirty draft makes the publish dialog always state its
  unsaved-changes sentence and always save first, which gives no wrong
  result.
- **A Name column on the admin area's Users screen.** A brainstorming session
  settled the shape on 2026-08-23: a dedicated Name column before Email,
  display only, with no editor on the screen. The API side is already done.
  `GET /admin/users` returns the resolved `displayName`
  (`src/auth/users.ts:151-152`), and
  `openspec/specs/admin-user-management/spec.md:18` pins it in the list body.
  The web client drops the field: the `UserSummary` mirror omits it
  (`packages/web/src/areas/admin/api/types.ts:110`) and `UsersScreen.tsx`
  renders five columns (`:394`).

  Three files change. The mirror gains `displayName: string`, the screen gains
  a `<th>`, a per-row `<td>` and an em-dash placeholder on the create row, and
  the password editor row's `colSpan` grows from 5 to 6
  (`packages/web/src/areas/admin/screens/UsersScreen.tsx:606`). One catalog
  key, `users.colName`, lands in the en and de maps of
  `packages/web/src/i18n/catalogs/admin.ts:119` and `:384`, both reading
  "Name". The delta belongs to `admin-app`, and `admin-operations-api` stays
  unchanged, since the API already ships the field. Editing a name stays on
  the profile page and `PATCH /admin/users/:userId/name`.

  Out of scope: in-place editing on this screen, names in the manager cells,
  and a name input on the create row. The browser check is `/admin/users` with
  two accounts, one with a stored name and one whose row falls back to its
  email. Building it waits on the owner's go-ahead.
- **The hand-rolled router in `src/http/server.ts` reimplements
  `Bun.serve({ routes })`.** Finding 11 of the ponytail audit, verified at the
  code on 2026-09-10. The `Route` type sits at `src/http/server.ts:229`, `seg`
  at `:302` and `match` at `:335`. The OPTIONS branch at `:799` collects the
  allowed methods by filtering the same table. `Bun.serve` takes
  `{ fetch, port, maxRequestBodySize }` at `src/http/server.ts:884`, with no
  `routes` key. Two facts make the cut risky. `createServer` at `:522`
  returns the `fetch` function itself, and the test suite drives that return
  value directly. The per-request tenant resolve runs inside the dispatch
  path, at `:809-811`. The rewrite needs an OpenSpec change of its own; this
  entry records the finding and leaves its shape open.
- **Three requirements in `studio-canvas` still say "palette".** Lines 648,
  1772 and 1781, in "The traversal is a total function over a deep-partial
  draft" and "A step node prints the step's label, centred and resolved for
  the content locale". The `studio-canvas-bar` change of 2026-09-10 deleted
  that control and its component. Its delta declares "edit rail" the older
  word for the bar's add controls, and says nothing about "palette", so those
  three lines name something the spec no longer defines. The sync left them
  on purpose: the delta stated no rule change for either requirement, and
  rewording untouched prose would exceed the delta and put new text under the
  prose ratchet. A sweep of the stale word wants its own change, together
  with the six requirements that still say "edit rail".

## Open from the 2026-08-18 code review (each needs its own OpenSpec change)

All ten items on the Prioritized Action List of
[`openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW.md`](../openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW.md)
are open. Each was re-checked against the tree on 2026-09-09. That review
holds the reasoning and the recommended fix. This section records that
nothing else tracks them.

- **SEC-1: the subprocess and chaining graph has no cycle check.** Publish-time
  validation resolves each child and checks every `inputMapping` target
  (`src/engine/definitions.ts:468`). No walk over the reference graph runs.
  `validateProcessChaining` (`src/engine/definitions.ts:531`) repeats the
  shape, and the spawn handler (`src/engine/subprocess.ts:53`) counts no hops.
  Risk: a published reference cycle spawns instances until storage fills. The
  oldest of the ten, and the only one the review rates High.
- **SEC-2: no password floor on any write path.** `requireNonBlank` is the
  whole check on `POST /admin/users/:userId/password`
  (`src/http/admin-routes.ts:253`), and the route comment states the position
  at `:242`. `createUser` (`src/auth/users.ts:65`), `setPassword` (`:139`) and
  `setPasswordById` (`:235`) apply nothing either. Risk: a one-character
  password reaches storage for an account that may hold `system:admin`. The
  review recommends a length-only floor in `src/auth/users.ts`, shared by both
  routes and the CLI.
- **SEC-3: an account cannot rotate its own password.** `PATCH /account/me`
  accepts `displayName` and `locale` alone
  (`src/http/account-routes.ts:31`), and the file exposes two handlers,
  `handleGetAccount` (`:62`) and `handlePatchAccount` (`:113`). Every password
  write runs through `system:admin` or the recovery CLI. Risk: a holder who
  suspects their password is exposed must ask an operator, who then knows the
  new value. It shares SEC-2's validator, so one change covers both.
- **SEC-4: the session token lives in `localStorage`.** `browserStorage` reads
  the global at `packages/web/src/shell/session.ts:39`, `loadSession` reads
  the key at `:44`, and `persistSession` writes it at `:65`. Risk: any script
  running on the origin can read the bearer token. The review treats this as a
  decision rather than a defect: keep `localStorage` and record why, or move
  to a `Secure; HttpOnly; SameSite=Strict` cookie and pay a CSRF token on
  every mutating route. Either outcome belongs in an OpenSpec change.
- **SEC-5: login rate limiting is per-process and in-memory.** Both windows
  are `Map`s in process memory (`src/auth/login.ts:54` and `:61`), marked
  `ponytail:` at `src/auth/login.ts:49`. That marker is the whole record: it
  states the shortcut, its ceiling and its upgrade path, and no ledger file
  and no push gate stand behind it. Risk: two replicas double every
  threshold, and a restart clears both windows. The review names the constraint a Postgres
  replacement must keep: one statement doing the check and the increment
  together. The 2026-08-18 code review asks for the single-process assumption
  in `docs/runbooks/deployment.md` until the fix lands. That runbook stays
  silent on it, and the `deployment-runbook` capability governs the file, so
  that sentence needs a delta of its own.
- **SEC-6: no ceiling on an instance's total attachment bytes.**
  `MAX_ATTACHMENT_BYTES` bounds one upload, 5 MiB by default
  (`src/http/routes.ts:99`, enforced at `:359`). `uploadAttachment`
  (`src/runtime/api.ts:2583`) inserts the row without an aggregate. Risk: one
  credentialed actor can grow an instance's stored bytes without bound. The
  review puts this storage bound ahead of a general rate limit: one aggregate
  query at the existing enforcement point.
- **TEST-1: nothing asserts that every route refuses an uncredentialed
  request.** Each handler carries its own `requireRole` or `requirePermission`
  call, and the route table holds 86 entries (`src/http/server.ts:554`). No
  test iterates that table. Risk: a route added without a check ships
  silently, which is the first entry of the OWASP Top 10. The review's fix is
  a table-driven test plus a named exemption set.
- **DEP-1: CI runs no SAST and no secret scanning.**
  `.github/workflows/check.yml` is the only workflow, and it holds no CodeQL
  or `gitleaks` job. Dependabot covers version drift alone
  (`.github/dependabot.yml`). Risk: a committed credential or a code-level
  pattern reaches `main` unflagged. CodeQL is free for a public repository and
  adds one job.
- **CQ-1: 81 dead `eslint-disable` directives, and no linter.** The repository
  tracks no ESLint, Prettier or Biome configuration, so every directive
  suppresses nothing. `src/schema/compile.ts` holds 53 of the 81 and fourteen
  other files hold the rest; the review counted ten, all of them in that same
  file. Sixty-six name `@typescript-eslint/no-explicit-any`, thirteen name
  `react-hooks/exhaustive-deps`, and two name one rule each. Risk: the
  comments imply a tool that never runs. Delete them, or adopt a linter and
  give `bun run check` the style gate it lacks.
- **ARCH-1: `src/runtime/api.ts` has grown to 2,673 lines.** The review
  measured 1,384 on 2026-08-18, itself up from 1,269 the pass before. It is
  still the largest source file in the repository. Next come
  `packages/web/src/areas/studio/canvas/CanvasView.tsx` (1,791),
  `src/schema/definition.ts` (1,428) and
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx` (1,356). Two
  test files run longer: `test/runtime-api.test.ts` holds 3,128 lines and
  `test/http.test.ts` holds 2,562. Risk: a reviewer reading one operation
  carries the whole file, and two agents editing it contend. The review's fix
  is a split into sibling modules re-exported from `api.ts`, so no import site
  changes.
- **Not from that review: `src/schema/compile.ts:1218` miscounts its own
  list.** The doc comment on `structuralIssues` names five checks that read
  the body duck-typed, then calls the remainder four. The list returns twelve
  checks, so seven remain: `checkFieldTree`, `checkViewFieldPatterns`,
  `checkIdResolution`, `checkLengthBounds`, `checkRedactableFields`,
  `checkGroupReference` and `checkActorFromFieldReference`. The comment at
  `:1247`, inside `compileProcessBody`, already says twelve. Risk: a reader
  trusts the smaller number and misses three checks. The 2026-09-09 documentation
  audit found it; the next change inside that file carries the fix.

The nine findings below never reached the list above. Seven are Low and two
are Informational. Each was re-checked against the tree on 2026-09-10, and
each entry carries the anchor that holds today. All nine stay open.

- **SEC-7: CEL evaluation has no wall-clock bound.** `evaluate`
  runs inside `try`/`catch` at `src/cel/eval.ts:129` and `:166`, so a raise
  reads as no match while time stays unbounded. `MAX_EXPRESSION_LENGTH` at
  `src/schema/compile.ts:156` caps source at 4,000 characters, a bound on
  length rather than on cost. Risk (Low): a deeply nested comprehension holds its
  transaction's locks for the whole evaluation. Authoring needs
  `system:developer` or `system:author`, so this is defense in depth. The
  review prefers a publish-time complexity bound over a runtime timer.
- **SEC-8: attachment `contentType` is caller-supplied and echoed on
  download.** The upload schema at `src/http/routes.ts:111` constrains it to
  `MIME_TOKEN_PAIR` (`:108`), and the download handler at `:394` returns it
  as `Content-Type` through `toBinaryResponse` (`src/http/server.ts:196`).
  Every binary response carries `X-Content-Type-Options: nosniff`,
  `BINARY_ROUTES` gives this route `Content-Disposition: attachment`, and
  the CSP sets `object-src 'none'`, so a stored `text/html` downloads rather
  than renders. Risk (Low): a later change that drops one of those layers turns a
  stored file into rendered content. The review's optional fix is an
  allowlist of upload types in place of the shape regex.
- **SEC-9: a role reduction waits for the issued token to expire.**
  `src/auth/jwt.ts:115-124` checks `isActiveAccount` on every locally issued
  token and reads roles from the token's own claim, and the comment there
  points at the `admin-user-management` spec. Disabling an account ends its
  session at the next request, while removing one role leaves the old set
  effective until expiry, up to eight hours. Risk (Low): an operator who revokes
  `system:admin` from an account that stays active waits for that expiry.
  The zero-code method is to disable the account and re-enable it: the next
  request rejects the old token, and the next login issues the reduced set.
  That method sits in no operator document today. The alternative is a
  `rolesVersion` claim compared by `isActiveAccount`, a schema change that
  needs its own OpenSpec change; `grep -rl rolesVersion src openspec/specs`
  prints nothing.
- **SEC-10: development defaults.**
  `.devcontainer/docker-compose.yml` sets `ALLOW_INSECURE_DEV_AUTH: "1"` at
  `:47` and `POSTGRES_PASSWORD: postgres` at `:92`. Both serve a disposable
  local stack, the server prints `AUTH DISABLED` at startup
  (`src/http/server.ts:403`) whenever the first applies, and the production
  image in `docker/engine.Dockerfile` inherits neither. Risk (Informational): a stack
  started from the compose file outside the devcontainer runs with auth
  disabled. The review recorded it for completeness and recommends nothing.
- **ARCH-2: `BINARY_ROUTES` is a hand-kept ledger.** The
  list sits at `src/http/server.ts:268`, and `test/http-disposition.test.ts`
  drives every declared entry. TEST-1 above covers the review's second
  ledger, the per-handler role checks. Risk (Low, narrowed): a binary route added and never
  declared ships without `Content-Disposition`, and no test notices. That
  one case is all that remains of the finding.
- **CQ-2: doc comments duplicate facts held elsewhere.** The header of
  `src/auth/authorize.ts` states which role admits which route at `:28-44`,
  while the route table in `src/http/server.ts` and each handler's own check
  are where that is true. `docs/current-state.md` repeats the shape by
  listing exported symbols by hand. Risk (Low): a rename in one place leaves the
  other wrong, and no gate covers either. The review's fix is to name where
  a list lives instead of restating it.
- **DEP-2: the CI workflow runs no `bun audit` step.**
  `grep -rn "bun audit" .github/` returns nothing. Dependabot already covers
  version drift, and the review judges the pair unlikely to earn its
  maintenance. Risk (Informational): an advisory Dependabot misses waits for the next manual
  look. Recorded so the next audit skips re-deriving it.
- **PERF-1: fixed 500 ms polling per tenant.** `src/engine/host.ts:326`
  runs `pollForever` for the outbox drain on a 500 ms loop wrapped in
  `eachTenant`, with the resolution and timer sweeps beside it at `:327` and
  `:328`. Risk (Low): at many tenants each cycle issues work proportional to tenant
  count whether or not any tenant holds a pending row. The review names a
  Postgres `LISTEN`/`NOTIFY` wake-up or one cross-tenant claim query as the
  replacement, once tenancy grows past a handful.
- **PERF-2: one query per refused permission check.** `can()` at
  `src/auth/authorize.ts:118` short-circuits on the global role before any
  query, so the common paths cost nothing. Risk (Low): a burst of refused requests
  from one actor issues one grant query each. The review calls it documented
  and correctly bounded, and recommends nothing.

## Open from the 2026-09-11 steps rail review (each needs its own OpenSpec change)

Six findings from the critique and the audit that ran beside
`steps-rail-rows-drop-summary-line`. That change caused none of them and fixed
none of them. Each one was read off the tree at 432bb3aa. The tags below are
local to this section.

- **RAIL-1: a move control leaves a reachable row in place.** The rail orders
  reachable non-end steps by a breadth-first walk. That order comes from
  `registerOrder`, which reads the graph rather than the array. The move
  control swaps two entries in the draft's own steps array, which the canvas
  traversal and the serialized definition both read. An end step and an
  unreachable step follow the swap; a reachable step keeps its place.
  Risk (Medium): the control stands enabled on every row, and most clicks
  show no change.
- **RAIL-2: a move control is 26px wide.** The button pads an 18px icon by
  4px on each side, in the `move` style of `StepsRail.tsx`. Its height
  follows the row. Risk (Low): that width clears the 24px minimum target and
  misses the 44px enhanced one.
- **RAIL-3: the rail clips its own focus ring.** The rail scrolls on its
  block axis, and a scroll container on one axis clips the other. The shell
  draws a 2px ring at a 2px offset, in `global.css`. Risk (Low): the ring's
  leading edge falls outside the rail's box and disappears.
- **RAIL-4: a move control names no step.** Each one carries the icon alone,
  labelled "Move earlier" or "Move later". Every row repeats that pair.
  Risk (Low): a screen reader reads one identical pair per row, and
  `design-language.md` asks a label to sit beside an icon.
- **RAIL-5: the issue badge marks severity by colour alone.** A blocker takes
  the refusal ink and an advisory the muted ink, in `StepsRail.tsx`. The
  label behind the count omits the severity. Risk (Medium): colour is the
  only carrier, which WCAG 1.4.1 refuses.
- **RAIL-6: the desktop rail is narrower than the phone rail.** The Steps tab
  gives the rail 18rem beside the step page, in `EditScreen.tsx`. Below 64rem
  the rail takes the full width and caps its height at 20rem.
  Risk (Informational): a long label wraps on a wide screen and fits on a
  narrow one.

## Refused simplifications (kept so the next sweep does not re-propose them)

Each entry below names a cut somebody proposed, the reason a reviewer refused
it, and the measurement or citation that refused it. The record exists so the
next over-engineering sweep does not price the same cut twice. It came out of
the ponytail audits of 2026-07-26 through 2026-08-18. Every path was re-checked
against the tree on 2026-09-10. A line number appears only where no symbol
identifies the site: gate script lines, test assertions and spec lines. A dated
count is history and stays as measured.

Entries 1 to 9 come from the 2026-08-16 survey. Entries 10 to 46 are the
deliberate refusals, all of them. Entries 47 to 51 come from the library
audit of 2026-09-10.

1. Five dependencies each earn their place. `@dagrejs/dagre` drives a layered
   layout with group-collapse. `@panzoom/panzoom` backs the canvas transform.
   The `lucide-react` imports named 17 icons on 2026-08-16, and the package
   tree-shakes. `jose` covers remote JWKS. Both `zod` and
   `@marcbachmann/cel-js` are load-bearing. `immer` already left the tree.
2. Extracting `packages/form-ui` further stayed refused. Its `react-dom` and
   `zod` peers are both real. The call `renderToStaticMarkup` runs in its
   tests, and `resolveLocalizedText` pulls zod transitively through
   `packages/form-ui/src/locale.ts`. The package measured 535 lines over eight
   files on 2026-08-16, with two consumers. That is still no shared-package
   proposal.
3. Hand-rolls that a platform feature would replace were checked and found
   absent. `crypto.randomUUID`, `Intl.NumberFormat` and `<dialog>` with
   `showModal()` already sit where a hand-roll would.
4. Collapsing `src/tenancy/` was refused. It is 360 lines over four files, and
   each of `connections.ts`'s four injected dependencies has a test passing
   something else. Its pool map carries the `ponytail:` marker naming the
   missing eviction.
5. Shortening the gate scripts was refused. Their length is comments recording
   measured traps.
6. Deleting an unused example was refused. On 2026-08-16 the directory held
   four `examples/*.json` files, referenced 176, 44, 25 and 23 times across
   docs, seed, specs and compose. It holds nine today.
7. Deleting unreferenced CSS classes was refused. On 2026-08-16 template
   literals built the `admin-badge-*`, `app-stamp-*` and `studio-diff-*`
   names, so a selector grep missed them on purpose. Those literals have since
   left the tree, and the reasoning stays: a class a grep cannot find is a
   class to check by hand.
8. Replacing `packages/web/src/areas/studio/canvas/` with a graph library was
   refused. The directory stays hand-rolled SVG.
9. The route table in `src/http/server.ts` holds four `req.method ===`
   comparisons today. Finding 11, recorded under
   "Decided, not yet built" above, is the one open question over it, and it
   asks about a platform feature rather than duplication.
10. **Finding 2, an all-or-nothing recipient rule over `nodemailer`.** Declined
    2026-08-18. Its only public send entry bundles the RCPT check with the
    message transfer. The library proceeds to `DATA` once it accepts any
    recipient. No configuration restores the rule the spec requires.
    [`src/handlers/notification-email.ts`; the requirement "Every recipient
    is accepted before the message is sent" in
    `openspec/specs/notification-email-action-handler/spec.md`]
11. **Finding 5, merge `RuleInput` into `ConditionInput`.** Rejected
    2026-08-16. A `git diff --no-index` run that day reported 51 insertions
    and 84 deletions over the two files, then 267 combined lines. The default
    operand and the field-against-field comparison have no counterpart on a
    path guard. [`packages/web/src/areas/studio/panels/shared/RuleInput.tsx`
    and `ConditionInput.tsx` beside it]
12. **Finding 28, drop `ConditionInput`'s `toggleVariant` prop.** Rejected
    2026-08-16. Each variant has a live caller. `panels/PathsPanel.tsx` passes
    `"disclosure"`, `panels/FieldCatalogPanel.tsx` passes `"link"`, and
    `panels/shared/BooleanOrExpressionInput.tsx` takes the `"link"` default.
    Dropping the prop changes what one of those sites renders.
    [`packages/web/src/areas/studio/panels/shared/ConditionInput.tsx`, the
    `toggleVariant` prop]
13. **Finding 22, `Intl.NumberFormat` for `formatDuration`.** Rejected
    2026-08-16. The test file
    `packages/web/test/reporting-reportingLogic.test.ts:90-110` pins 13
    strings across `en` and `de`, among them `"4.5 s"` and `"5,5 Std"`. The
    formatter renders `"4.5 sec"` and `"5,5 Std."` instead.
    [`packages/web/src/areas/reporting/screens/reportingLogic.ts`,
    `formatDuration`]
14. **`Intl.RelativeTimeFormat` for `waitingLabel`.** Rejected 2026-08-05, after
    surviving five scans as a finding. Four tests in
    `packages/web/test/inboxLogic.test.ts` pin `"5m"`, `"3h"`, `"2d"` and
    `"just now"`. Narrow style renders `"5 min. ago"`, and no style renders
    `"5m"`. Re-file it as a design change, never as a standard-library swap.
    [`packages/web/src/areas/app/screens/inboxLogic.ts`, `waitingLabel`]
15. **A shared changed-file collector for `prose.sh` and `whitespace.sh`.**
    Rejected 2026-08-05. Only `prose.sh` runs `git diff --name-status -M`, and
    it does so to read a renamed file's baseline at its old path.
    [`scripts/gates/prose.sh:74`, `scripts/gates/whitespace.sh:44`]
16. **Delete the unused registry seams.** Rejected. That set is
    `devHeaderResolver`, the action `Registry`, the `DataSourceRegistry`, the
    `AssignmentRegistry`'s multi-strategy handlers, `exampleRegistry.ts` with
    `RegistryPanel.tsx`, and `Action.execution`'s reserved enum. `CLAUDE.md`
    records the reserved enum and the dev-header seam as v1 boundaries, and
    the registries as the plugin seam. The two studio files have
    since left the tree on their own change, on 2026-08-18; the rest stand.
17. **Delete `Action.execution` specifically.** Rejected on a second ground. It
    sits inside `ProcessBody`, so removing it moves the `definitionHash` of
    every stored body carrying it. The field `definitionStatus` sits outside the
    body, so it does not.
18. **Replace the `migrateInstances` and `findOrphanKeys` keyset loop.**
    Declined 2026-07-26. [`src/engine/migration.ts`]
19. **Collapse `requireRole` and the role constants.** Rejected. The call sites
    ask about genuinely different roles. [`src/auth/authorize.ts`,
    `requireRole`]
20. **Reduce `checkAndRecordAttempt`'s parameters.** Rejected. Tests exercise
    each with different values. The signature read `(map, email, now)` when
    the cut was proposed; it has since grown a `maxAttempts` and a `capacity`
    parameter. [`src/auth/login.ts`, `checkAndRecordAttempt`]
21. **Collapse the two `ActorResolver` implementations.** Rejected. Both
    `src/auth/jwt.ts` and `src/auth/resolve.ts` are real implementations.
22. **Collapse the i18n catalogs into one.** Rejected. The JSON contract is
    multi-locale by construction, and the app area ships a real `de` in
    `packages/web/src/i18n/catalogs/app.ts`. Finding 20 cuts unused keys
    instead.
23. **Drop `optionText`'s `if (!attributes) return label` guard.** Rejected
    2026-08-16. The `attributes` parameter types as `Record<...> | undefined`,
    and `Object.values(undefined)` throws a `TypeError`. Only the guard's
    sibling was dead, the `parts.length === 0` branch, and that branch is cut.
    [`packages/form-ui/src/FieldForm.tsx`, `optionText`]
24. **Finding 39, merge `isGroup` and `isGroupField`.** Rejected 2026-08-16.
    Both bodies read `field.field.type === "group"`. The only module both call
    sites import at runtime is `types.ts`, which emits no JavaScript and
    reaches them through `import type`. Hosting the predicate there turns a
    type-only module into a runtime one, for three duplicated lines.
    [`packages/form-ui/src/FieldForm.tsx`, `isGroup`;
    `packages/form-ui/src/submit.ts`, `isGroupField`]
25. **Finding 9, delete `parseJsonb` as dead.** Rejected. A separate
    `parseJsonb` exports from `src/engine/host.ts`. `src/http/admin-routes.ts`
    names it on six lines, and `test/data-list-columns.test.ts` imports it. It
    returns `undefined` on a parse error, where the `src/engine/drafts.ts`
    export the `templates.ts` mapper shares lets that error throw.
26. **Finding 9, merge `toTemplate` and `toDraft`.** Rejected. The two map
    different columns. One question stays filed and unresolved: does `Bun.sql`
    ever hand back raw text on the `drafts` and `templates` columns? A negative
    answer kills the string guard and ten further inline sites.
    [`src/engine/templates.ts`, `toTemplate`; `src/engine/drafts.ts`,
    `toDraft`]
27. **Finding 26, a shared `requireAnyRole(actor, ...roles)`.** Rejected
    2026-08-16. The comment above `requireAuthoring` in
    `src/http/studio-routes.ts` rejects it and names one specific pair on
    purpose. `requireStudioRead`, in the same file, binds to the same rule by
    reference. The three helpers also raise three different messages, each
    naming its own role set. [`src/http/admin-routes.ts`,
    `requireDataListRead`]
28. **Finding 39, merge `requireNonBlank` and `requireString`.** Rejected
    2026-08-16. They differ three ways. `requireNonBlank` rejects
    `!value.trim()` and returns the untrimmed value, because trimming a password
    would store a secret the operator never typed. `requireString` rejects
    `raw.length === 0` and bounds the result at `MAX_KEY_LENGTH`. The messages
    differ too, `must not be empty` against `is required`. The input `"   "`
    passes `requireString` today and would fail a merged rule.
    [`src/http/admin-routes.ts`, `requireNonBlank` and `requireString`]
29. **Finding 54, inline `resolveBaseLocaleChange`.** Declined 2026-08-18. It
    exports on purpose: `studio-processHeaderLogic.test.ts` drives it as a pure
    function, and `ProcessHeaderBar` has no DOM test harness. The extraction is
    the only way to reach the base-locale sync regression it guards.
    [`packages/web/src/areas/studio/screens/processHeaderLogic.ts`]
30. **Finding 39, inline `resolveActor(req, resolver, db)`.** Rejected
    2026-08-16. Its body is one line, `resolver(req.headers, db)`. The command
    `git grep -o 'resolveActor(' -- src | wc -l` prints 22, the declaration
    among them. The archived change `2026-08-05-dedup-server-helpers` created
    the helper by collapsing four copies, and the doc comment above it says
    so. Inlining would reverse that change to save three lines.
    [`src/http/routes.ts`, `resolveActor`]
31. **Finding 39, inline `accountName.ts` into `Chrome.tsx`.** Rejected
    2026-08-16. The file is 15 lines with one call site, and it carries its own
    three-case test. Inlining moves the logic into a React component, so those
    three cases need a render to reach. The test then dies or grows a renderer.
    The change `2026-08-16-ponytail-cleanup-fetch-hooks-and-imports` declined
    finding 37 on this same ground. [`packages/web/src/shell/accountName.ts`]
32. **Finding 39, derive `onGoToArea` and `onGoToProfile` from the `go` prop.**
    Rejected 2026-08-16. Two derivations exist, not one. Each of the four area
    roots builds its own href as `/${a}`. The file `shell/App.tsx` passes
    `areaHref(a, "/")` at both of its `onGoToArea` sites, and `Chrome` serves
    both callers. [`packages/web/src/shell/App.tsx`]
33. **Finding 39, merge `listComments` and `listAttachments`.** Rejected
    2026-08-16. The two differ in path segment and in return type, a comment
    page against an attachment page. A merged function needs a type parameter
    and a segment argument, and would run longer than the pair it replaces.
    [`packages/web/src/areas/app/screens/TaskScreen.tsx`, the two `await`
    call sites]
34. **Finding 8, cut the 45-line comment above `armStepTimers`.** Rejected
    2026-08-16. The block states facts: totality, the CEL evaluation contract,
    and a magnitude bound from a real overflow analysis. None of it is process
    history, which is what the comment rule targets.
    [`src/engine/duration.ts`, the doc comment above `armStepTimers`]
35. **Finding 24, a generic `NamedError` base class.** Rejected 2026-08-16.
    Only `RequestShapeError` and `NotFoundError` are name-only.
    `InstanceNotRunningError` and `InstanceRunningError` each carry
    `instanceId` and `status` as readable state, and a caller distinguishes
    outcomes on it. A shared base would drop that state.
    [`src/errors.ts`, the four classes named]
36. **Finding 27, delete `BINARY_ROUTES`.** Rejected 2026-08-16. The
    requirement "`BINARY_ROUTES` declares every route that returns stored
    bytes" in `openspec/specs/http-wrapper/spec.md` names it. Its own comment
    says a person keeps the list in sync by hand, since no static walk of
    `routes` can derive it. Deleting it deletes a spec requirement written
    after a measured `/admin/*` route collision.
    [`src/http/server.ts`, `BINARY_ROUTES`]
37. **Finding 29, cut four thin delegates in `src/cel/eval.ts`.** Rejected
    2026-08-16 for two of the four. The function `buildTransformContext`
    re-keys the context against the source catalog rather than delegating. The
    comment on `buildOutputContext` explains why its namespace stays separate
    from the guard context. The other two, `evalTransforms` and `evalFieldMap`,
    are genuine delegates and stay a finding.
    [`src/cel/eval.ts`, the four functions named]
38. **Finding 34, dedupe the two pagination helper sets.** Rejected 2026-08-16
    as a whole. The comments above `MAX_LIST_LIMIT` in `src/runtime/api.ts`
    and in `src/engine/admin-queries.ts` both call the duplication deliberate.
    The first reads "the numbers agree today by coincidence, not by contract."
    Only `Page<T>` is an unexplained duplicate, and it stays a possible future
    finding.
39. **Finding 35, `Map.groupBy` for `groupMs`.** Rejected 2026-08-16. It would
    replace nine lines, and it needs `tsconfig.json`'s `lib` raised from
    `ES2022` to `ES2024` repo-wide. That blast radius is disproportionate.
    [`src/engine/reporting.ts`, `groupMs`]
40. **Finding 40, drop `JwtResolverConfig.localRolesClaim`.** Rejected
    2026-08-16. A call at `test/auth-jwt.test.ts:109` passes
    `localRolesClaim: "groups"`. The `?? "roles"` fallback inside
    `jwtResolver` is a default rather than dead code. [`src/auth/jwt.ts`,
    `JwtResolverConfig.localRolesClaim`]
41. **Finding 41, drop ten `src/` exports whose only importer is a test.**
    Rejected 2026-08-16. A test importer is an importer, and `export` is how the
    test reaches the symbol. The ten are `singleTenantSource`,
    `parseExpression`, `projectInstance`, `managerOfStarterStrategyDef`, the
    pair `InvalidTenantKey` and `TenantKeyTaken`, `checkDbReady`,
    `clientAddressOf`, `parseAuthIssuers`, `MAX_OVERRIDE_VALUE_LENGTH` and
    `countUiStringOverrides`. Two symbols with no importer at all,
    `checkTemplateKey` and `SUPPORTED_LOCALES`, lost their `export` instead.
42. **Finding 14, a copy-pasted `tFill`.** Rejected 2026-08-16. Only
    `areas/admin/catalog.ts` declares `tFill`, and only
    `areas/reporting/catalog.ts` declares `tCount`. The bodies differ: `tFill`
    walks `Object.entries(values)` with `replaceAll`, and `tCount` runs one
    `replace` on `{n}`. Each has one declaration, so neither is duplication.
43. **Finding 17, four area clients declare `listProcesses`.** Rejected
    2026-08-16 as a dedup. Three of the four agree exactly. The reporting
    area's version reads a different route, `/reporting/processes`, and
    unwraps `{processes}` from the body. It stayed its own function.
    [`packages/web/src/areas/reporting/api/client.ts`]
44. **Finding 17, `getInstanceRecord` is byte-identical.** Not a refusal: a
    correction, kept because the claim recurs. The two bodies differed by one
    local name, `query` against `params`, so "byte-identical" did not hold.
    The merge still landed, in the archived change
    `2026-08-17-ponytail-web-client-catalog-dedup`.
45. **Finding 17, route three types through the engine's exports map.**
    Rejected 2026-08-16. `HistoryEntry` reaches `packages/web` through the
    `./schema` entry. Of the three types named, `VersionSummary` lives in
    `src/engine/definitions.ts` and `InstanceRecordElement` in
    `src/runtime/api.ts`, files that map does not publish, and
    `InstanceRecordPage` has no engine declaration at all. Widening the engine
    package's public surface is an engine decision, and a `packages/web`
    refactor does not get to make it. The three moved to
    `packages/web/src/api/types.ts` instead.
46. **Finding 13, the `useFail(onUnauthorized, setError, describe)` signature.**
    Rejected 2026-08-16. That shape misses `shell/ProfilePage.tsx`, whose two
    sites answer with `setLoadFailed(true)` and `setSaveFailed(true)`. The
    shipped shape is `useFail(onUnauthorized, onError)`, taking the failure
    handler itself. Further sites, `TaskScreen.tsx` and `PlayerScreen.tsx`
    among them, kept their own ladder and share only the `is401` predicate.
    [`packages/web/src/shell/useFail.ts`]
47. **Replace the SMTP client with nodemailer.** Rejected 2026-09-10.
    `nodemailer` 10.0.3 runs under Bun 1.3.11 and delivers to Mailpit. It
    still cannot serve here. Its connection sends `DATA` once any recipient
    is accepted, and reports the rest as rejected. No option turns that off.
    The spec forbids a partial delivery, because a transient retry would then
    send a second copy to every accepted address. That rule stays. The wire
    code stays with it. [`src/handlers/notification-email.ts`,
    `openspec/specs/notification-email-action-handler/spec.md`, "Every
    recipient is accepted before the message is sent"]
48. **Route through `Bun.serve({ routes })`.** Rejected 2026-09-10. The
    hand router is `seg`, `match` and one loop, about 25 lines. The rest of
    the dispatch stays under either router: the navigation check before the
    match, the tenant handle per request, the preflight derived from the
    table, and the binary exit. Bun's router derives no preflight. It also
    answers only through a listening server, so the 16 suites that call
    `createServer` with a bare `Request` would each need a port.
    [`src/http/server.ts`]
49. **Parse CLI arguments with `node:util.parseArgs`.** Rejected 2026-09-10.
    Both CLIs take positionals only, and `parseArgs` hands the same array
    back under `positionals`. The four scripts read one `process.argv` entry
    each. Nothing shrinks. [`src/auth/cli.ts`, `src/tenancy/cli.ts`]
50. **Format durations with `Intl.DurationFormat`.** Rejected 2026-09-10.
    The formatter renders every non-zero field. It cannot print `5.5 h`, and
    German comes out as `Std.`, against the catalog's `Std`. The largest-unit
    selection stays hand-written either way. [`formatDuration`,
    `packages/web/src/areas/reporting/screens/reportingLogic.ts`]
51. **Move the web area's fetching onto TanStack Query.** Deferred
    2026-09-10, undecided. The tree holds 88 `useEffect` fetches and 49
    loading flags across the four areas. A query cache would earn its place
    only through invalidation after a mutation. That is the stale-UI defect
    class the browser check exists for. Revisit when that class recurs.
    Until then the hand-written clients stay.
