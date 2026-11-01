<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons -->
# Decisions: open questions and deferrals

Forward-looking counterpart to `docs/current-state.md`, which describes what
exists. This file holds open questions, decisions not yet built, accepted
risks with nothing to build, the open findings of past code reviews and
design audits, and refused simplifications. The reasoning behind a decision
that has since shipped lives in `docs/decisions-archive.md`. A change that
builds a decided entry below moves that entry into the archive, word for
word. `ROADMAP.md` carries stage-by-stage status.

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
  `historyByInstance` and `selectInRange` (`src/engine/reporting.ts:125` and
  `:108`) fully materialize a date range into memory today before returning a
  JSON array. A range above 20000 instances answers 400, so the buffer has a
  ceiling. Worth building when stage 27's reporting-app (cycle time,
  bottlenecks, SLA) needs a downloadable or streamable export, or when a
  `selectInRange` result set gets large enough that the in-memory buffering
  is a measured problem, not speculatively before either happens. Needs its
  own `reporting-app` spec delta when it lands.

  The same buffer-then-return shape holds for `listOutbox`
  (`src/engine/admin-queries.ts:117`), an append-only delivery log the same
  way the history table is: one row per delivery attempt, no nested
  structure. An admin "download the outbox" debugging export is the same
  NDJSON shape as the history export above and would land in
  `admin-operations-api` when built, on the same trigger: a concrete
  downloadable-export ask, not a speculative one.

  `migrateInstances` (`src/engine/migration.ts:567`) is the weaker case.
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
  and seven indexes stand in for nine of those keys. Four are expression
  indexes over keys no column carries: `instances_claimed_by_idx` over
  `assignment.claimedBy`, `instances_candidates_idx` (GIN) over
  `assignment.candidates`, `instances_parent_idx` over
  `parent.instanceId`, and `instances_retention_idx` over
  `currentStepEnteredAt`. The other three are plain btrees over generated
  columns: `instances_selection_col_idx` over
  `process_id`/`version`/`status`, `instances_current_step_col_idx` over
  `current_step_id` and `instances_started_by_col_idx` over `started_by`.
  All seven live in `initSchema` (`src/engine/store.ts`).

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
  change: verified via the untouched JS in `panels/shared/confirmDialog.tsx`'s
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

  The removal dialog (`panels/RemoveFieldDialog.tsx`) is a third consumer of
  the same hook. It shows the identical escape: forward Tab from its focused
  Cancel lands on `<body>`. Shift+Tab wraps correctly inside the dialog. Only
  the forward-Tab transition from Cancel breaks.

  Second: `StartPickerDialog` and `PromotionPreviewDialog` (`+ New
  process`, "Import a promoted version") call `showModal()` on mount with
  no cleanup. Escape and Cancel both close the dialog and drop focus to
  `<body>` instead of returning it to the button that opened it.
  `useConfirmDialog`'s own cleanup effect is the fix these two dialogs
  lack; neither component uses that hook.

  No follow-up change tracks this yet. It belongs to `studio-publish` or
  `spa-accessibility`, not `web-styling`: a CSS migration cannot cause or
  fix either gap.
- **The studio's three confirmation dialogs (Publish, Discard draft, Remove
  field) share presentation gaps.**
  - The heading takes the global `h2` Title role
    (`packages/web/src/shell/global.css:94-100`: 13.6px, weight 800,
    uppercase, slate), the least prominent text in the dialog, and renders an
    author's own label in capitals.
  - Cancel prints in the accent (`rgb(212, 43, 17)`), beside the
    accent-outlined destructive confirm.
  - The fact counts print in the written face, where `DESIGN.md` puts a
    figure in a column in mono.
  - The Publish dialog's `<code>` falls back to the browser's `monospace`.
  - At 420px the dialog spans the viewport with no gutter: the compiled
    `maxWidth: "34rem"` replaces the browser's own modal width cap.
  - Discard's heading is a statement, and Remove's is a question.
  - Publish and Discard have no `aria-describedby`.

  The change `remove-field-takes-its-references` found these in its
  2026-09-13 critique and audit. Name the fix: one `DESIGN.md` "Dialogs"
  decision, applied to all three dialogs.
- `NotFoundError` is served as HTTP 500 where most APIs answer 404. The
  mapping sits at `src/http/errors.ts:97`, and the header comment at `:11-16`
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
  to 500, and `http-wrapper/spec.md:1770` the attachment requirement. Moving
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
  opaque today: `JS_TYPE` maps it to `"any"` at `src/schema/definition.ts:438`.
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
- The pre-trim `docs/current-state.md` said the Runtime API Layer "has no
  assignment/claim enforcement". `requireSubmitAuthority` in
  `src/runtime/instances.ts:309` enforces both today, called from
  `submitAndTransition` and its sibling at `:336` and `:410`. The line was
  wrong as a statement of the present. Fixing it settled a question the
  document had never answered: whether it describes the tree as it stands,
  or collects dated stage records that stay true of their stage. Several
  other passages read as stage records. The 2026-09-09 audit deferred the
  fix on that ground. The change `trim-docs-weight` closes it. It replaces
  `docs/current-state.md` with a per-subsystem index that names no stale
  symbol claim and describes the tree as it stands.
- `THIRDPARTY.md:36` lists `postgres:16` as the deployment's database image,
  and `:44` repeats "the deployment pins 16". No tracked file states that
  pin: the devcontainer's Pod spec runs `postgres:latest`, the deployment
  runbook names no image, and the stack that does pin it lives
  untracked under `tmp/`. `scripts/thirdparty.ts` does not generate the
  container tables. Either the pin gets a tracked source or the row says
  where it comes from.
- Whether actor identities in the audit log (`actorId` in `history_entries`,
  claims, comments) are ever redactable is undecided.
  `docs/decisions-archive.md`'s Instance audit log entry records the reasoning.
- A subprocess-callable child's fields should stay inside its own
  `inputFields`. `.claude/rules/authoring-invariants.md` once stated that
  rule, but the code does not enforce it. Three sites read `inputFields`:
  `src/engine/definitions.ts:595-599`, `src/schema/compile.ts:471-473` and
  `:1154-1155`. Live specs stay silent on the rule too. Building it takes its own
  definition contract change.
- An assignment resolver can outlive its deadline while the row lock stays
  held. The submit path and the subprocess return both resolve an assignment
  on the locked transaction's connection. A resolver past its deadline leaves
  its query running there. Nobody has measured whether the commit then waits
  for it with the row lock held. `resolveStepAssignment`
  (`src/engine/registry.ts`) and `commitTransition`
  (`src/engine/transition.ts`) point here.

## Decided, not yet built (each needs its own OpenSpec change)
- **A non-studio surface for a pure Owner, and write-time eligibility
  validation on a list entry.** `process-access-roles` (shipped) named
  both as Non-Goals rather than open questions. Each needs its own
  separate change. A `system:owner` holder with no studio access has no
  screen today: the Access surface sits inside Studio, and reaching
  Studio at all still needs `requireAuthoring`. Such an Owner needs a
  dedicated, non-studio surface to manage a Reader list. Separately,
  `addAccessPrincipal` writes a principal onto a list with no check that
  the principal can use it: adding a plain user id to the Developer list
  does not confirm that user holds `DEVELOPER_ROLE`, the same
  read-time-filter-only pattern a group's own membership already
  follows. `test/process-access.test.ts` pins this choice as intended,
  a deliberate design point the tests confirm.
- **Archivo as the written face.** The Type section of
  `.claude/rules/design-language.md` names Archivo. `tokens.css` sets both
  `--font-heading` and `--font-body` to `system-ui, sans-serif`, and neither an
  `@font-face` rule nor a font link exists anywhere in `packages/web`, so the
  reader's OS supplies the face today and it differs per platform. The
  two-weight rule holds either way: 800 for a heading and a button label, 400
  for everything else, nothing between. Ten sites already break that rule
  with an off-spec weight; this file's own entry below names each one.
  Deferred 2026-09-02 — we do not need Archivo yet. When it lands, self-host
  the woff2: the build-time CSP is `default-src 'self'` with no `font-src`
  (`packages/web/csp.ts:22`), so a self-hosted file needs no CSP change
  and no `frontend-security-headers` delta, while a Google Fonts link would
  need `style-src` and `font-src` additions plus that delta. It changes the
  type of every screen in all four areas, so it needs its own OpenSpec change,
  a browser check, and a `DESIGN.md` refresh.
- **Process-scoped permissions: the filter, the draft scope, and the
  `permissions` booleans.** A design pass on 2026-08-15 settled the shape;
  `ROADMAP.md` stage 40 carries it in full. The seam shipped 2026-08-15 as
  `process-scoped-permission-seam`, and the storage half shipped 2026-08-16
  as `process-scoped-permission-grants`. `can(actor, permission, processId,
  db)` and `requirePermission` sit in `src/auth/authorize.ts` over the
  `Permission` values the `authorization` spec lists: `publish`, `cancel`,
  `migrate`, `read` and `visibility`; `src/auth/grants.ts` holds the `permission_grants` table's SQL
  behind them, and three `system:admin`-gated routes administer a grant.
  Nobody was blocked by the seam alone, and no account gained or lost access
  the day storage landed: an installation that writes no grant row keeps
  every answer it had.

  Three pieces stayed open, each its own later OpenSpec change. Only the
  filter still is.

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
  `handleReportingSla`, `src/http/reporting-routes.ts:161`, `:165` and
  `:169`) each already take a `processId`, so `requireRole(actor,
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
  `src/http/routes.ts:479` answers yes or no without one, and
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
  table's own key, named from `PUT /drafts/:processId`'s first save. That
  piece closed through the `process-access-roles` Developer list.

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
  (`src/auth/jwt.ts:113`) passes an issuer's claim through verbatim, so
  `Actor.roles` needed no new shape. A grant maps a role string to a
  permission and a scope, `{ type: "process", config: { processId } }` the
  only type shipped. Encoding the scope into the grant's own name
  (`system:publish@proc_...`) was considered and dropped 2026-08-16: it would
  have inverted the split, making the directory admin the authority on this
  engine's own opaque ids, for an installation that never asked for it.
  `Actor.roles` stays a `string[]` of free text from either source;
  `auth_users.roles` stays a `TEXT[]`.

  `openspec/changes/archive/2026-08-27-process-read-permission/` has
  applied the `read` permission piece above: `src/auth/authorize.ts:85`'s
  `Permission` type now admits `read`, mapped to `ADMIN_ROLE`.
- **CEL-readable data-source results.** Runtime option-list resolution for
  `field.dataSource` is DONE (see `openspec/specs/data-source-resolution/`) — but `src/cel/check.ts`
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
  `openspec/specs/data-source-resolution/`). `"db.list"` reads two engine-owned tables;
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
  `openspec/specs/assignment-strategy-registry/`). None leaves the engine's own
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
- **The studio's six remaining `confirm()` prompts.**
  `studio-publish-gate-and-report` converted the two on the publish path to
  the application's own modal dialog, and the others stay:
  `packages/web/src/areas/studio/root.tsx:95`, `EditScreen.tsx`'s arrange gate,
  `ProcessesScreen.tsx`'s draft discard, `TemplatesScreen.tsx`'s template
  discard, and two in `FieldCatalogPanel.tsx`. Of these, `TemplatesScreen.tsx`'s template
  discard hardcodes English rather than reading the catalog. Its
  template-replace prompt (`TemplatesScreen.tsx:131`), outside the six, does
  too. The navigation prompt at `packages/web/src/areas/studio/root.tsx:95` is the odd one
  out: `studio-app` states the `confirm()`/`t()` pattern for it as a
  requirement, so converting it rewrites that requirement and every scenario
  under it. The other five belong to `studio-form-editor` and `studio-app`, and
  each carries its own facts, its own dialog copy and its own catalog keys.
  Deferred 2026-09-02, on capability ownership and effort, not on
  reversibility: two of the five discard server state and the studio carries no
  undo.
- **The process list's literal strings.** The process list's table and
  toolbar read the studio catalog. Its two dialogs, its import error and its
  import result line still print literals. The `ui-string-overrides` catalog
  rule stays unmet on that screen. Change 13 (`studio-one-dialog-form`) moves
  the dialog strings. No change covers the import error or the result line.
- **The Versions screen's dead end from the process list.** A process with no
  draft opens Versions from its name on the process list. The Versions heading
  never names the process. Its "Back to process" control opens the edit route,
  which then fails with "No draft exists for this process." The process list
  change left the Versions screen as it was. The old row's Versions button
  reached the same screen.
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
  (`src/auth/users.ts:163-164`), and
  `openspec/specs/admin-user-management/spec.md:18` pins it in the list body.
  The web client drops the field: the `UserSummary` mirror omits it
  (`packages/web/src/areas/admin/api/types.ts:113-120`) and `UsersScreen.tsx`
  renders five columns (`:394`).

  Three files change. The mirror gains `displayName: string`, the screen gains
  a `<th>`, a per-row `<td>` and an em-dash placeholder on the create row, and
  the password editor row's `colSpan` grows from 5 to 6
  (`packages/web/src/areas/admin/screens/UsersScreen.tsx:609`). One catalog
  key, `users.colName`, lands in the en and de maps of
  `packages/web/src/i18n/catalogs/admin.ts:120` and `:393`, both reading
  "Name". The delta belongs to `admin-app`, and `admin-operations-api` stays
  unchanged, since the API already ships the field. Editing a name stays on
  the profile page and `PATCH /admin/users/:userId/name`.

  Out of scope: in-place editing on this screen, names in the manager cells,
  and a name input on the create row. The browser check is `/admin/users` with
  two accounts, one with a stored name and one whose row falls back to its
  email. Building it waits on the owner's go-ahead.
- **The hand-rolled router in `src/http/server.ts` reimplements
  `Bun.serve({ routes })`.** Finding 11 of the ponytail audit, verified at the
  code on 2026-09-10. The `Route` type sits at `src/http/server.ts:234`, `seg`
  at `:307` and `match` at `:340`. The OPTIONS branch at `:849-852` collects the
  allowed methods by filtering the same table. `Bun.serve` takes
  `{ fetch, port, maxRequestBodySize }` at `src/http/server.ts:951`, with no
  `routes` key. Two facts make the cut risky. `createServer` at `:559`
  returns the `fetch` function itself, and the test suite drives that return
  value directly. The per-request tenant resolve runs inside the dispatch
  path, at `:859-862`. The rewrite needs an OpenSpec change of its own; this
  entry records the finding and leaves its shape open.
- **Three lines in `studio-canvas` still say "palette".** Lines 679,
  1827 and 1836, in "The canvas is keyboard-operable, and traversal follows
  the paths" and "The masthead's step key auto-derives from the step label".
  The `studio-canvas-bar` change of 2026-09-10 deleted
  that control and its component. Its delta declares "edit rail" the older
  word for the bar's add controls, and says nothing about "palette", so those
  three lines name something the spec no longer defines. The sync left them
  on purpose: the delta stated no rule change for either requirement, and
  rewording untouched prose would exceed the delta and put new text under the
  prose ratchet. A sweep of the stale word wants its own change, together
  with the six requirements that still say "edit rail".
- **Retired UI words still sit in live specs.**
  `openspec/specs/studio-app/spec.md:841` and
  `openspec/specs/studio-canvas/spec.md:1113`, `:3005` and `:3053` still
  read "panels screen", "ribbon", "bench", "steps register", "configuration
  pane" and "inspector". `studio-canvas/spec.md:2110` names an "edit rail"
  and a `canvas/EditRail.tsx` that no longer exists. The same spec still
  names the step page's "Path to" section at `:875`, `:1133`, `:3007`,
  `:3032`, `:3040` and `:3047`. `openspec/specs/studio-canvas/spec.md:3005-3020`
  still gives the way out's key the masthead's mono treatment inside the row.
  The key sits in the row's Developer view now, and the spec sweep covers that
  prose too. A spec sweep wants its own OpenSpec change.
- **Five literal `#726e6e` sites want the new `colors.dormant` role.**
  `changes-tab-entity-change-list` gave the dormant tone a token,
  `--color-dormant` in `tokens.css` and `colors.dormant` in
  `tokens.stylex.ts`. Five call sites still write the hex literal instead:
  `packages/web/src/areas/admin/screens/OutboxScreen.tsx`,
  `InstanceScreen.tsx` and `InstancesScreen.tsx`, and
  `packages/web/src/areas/app/screens/InvolvedScreen.tsx` and
  `StartedScreen.tsx`. None moved in that change; it only added the role.
  `.impeccable/config.json`'s `design-system-color` ignore for `#726e6e`
  stays until all five move to the role.

  The dormant stamp also misses AA on a hovered row. Measured 2026-09-13 on
  the Versions screen's change list, it reads 4.51:1 at rest. On the ledger
  hover wash, `rgb(234, 233, 233)`, it reads 4.16:1. Every register row that
  carries a dormant stamp and washes on hover shares that gap. `DESIGN.md`
  pins `#726e6e`, so retuning the tone is a design change of its own.
- **Two more components read a primitive directly instead of a role.**
  `packages/form-ui/src/FieldForm.tsx:205-206` sets a tab's issue stamp
  with `colors.refusal700` and `colors.paper50`, both primitives.
  `packages/web/src/areas/studio/canvas/CanvasView.tsx:304` and `:314` set
  the terminal/initial stamp circle and its text with `colors.neutral900`,
  also a primitive. Neither site moved in a design change yet. Each is
  separate from the `#726e6e` entry above.
- **Ten sites set an off-spec weight on the written face.**
  `.claude/rules/design-language.md` allows only 800 and 400 there. Three
  sites set 500:
  `packages/web/src/areas/reporting/screens/BottleneckScreen.tsx:40`,
  `CycleTimeScreen.tsx:70` and `SlaScreen.tsx:41`. Four table headers set
  600: `BottleneckScreen.tsx:36`, `CycleTimeScreen.tsx:66`,
  `SlaScreen.tsx:37` and `ReportTable.tsx:57`.

  Two picker labels set 600: `ProcessPickerScreen.tsx:55` and
  `ReportsListScreen.tsx:66`. So does
  `packages/web/src/areas/studio/screens/MigrationPlanScreen.tsx:108`
  (`surfaceToggleTabSelected`). None moved in a design change yet; a later
  UI change would fix all ten. The `#726e6e` entry above tracks the same
  kind of drift.
- **The studio stays a desktop tool at phone width.** The owner decided
  this on 2026-09-13, as pick G2 of `studio-narrow-widths`. This entry
  replaces FORMS-15.
  - Measured that day at 400x800, before `forms-card-legend`, the Forms tab
    grid scrolled a 394px box over 1740px of cards. That change's final
    review put its two-line legend there at about 52px. The box then shrinks
    to about 342px.
  - Measured the same day, the process list table keeps its width at 480px
    and below. The page scrolls sideways to its action column. The audit of
    `process-list-create-once` found it.
  - Both stay: the studio targets a desktop, and the canvas and field matrix
    need the edit screen's fixed frame. A touch audience would reopen both.
  - This entry does not decide FORMS-18 in the Forms tab audits section. A
    200% zoom on a desktop window is no phone width.
- **SEC-2: no password floor on any write path.** `requireNonBlank` is the
  whole check on `POST /admin/users/:userId/password`
  (`src/http/admin-routes.ts:259`), and the route comment states the position
  at `:248`. `createUser` (`src/auth/users.ts:74`), `setPassword` (`:151`) and
  `setPasswordById` (`:247`) apply nothing either. Risk: a one-character
  password reaches storage for an account that may hold `system:admin`. The
  review recommends a length-only floor in `src/auth/users.ts`, shared by both
  routes and the CLI.

  Decided 2026-09-23 (change `decide-security-findings-before-1-0`): build
  before 1.0. Shape: a length-only floor of 15 characters in
  `src/auth/users.ts`, on every write path. NIST SP 800-63B sets 15 for a
  password-only factor and forbids composition rules. Follow-up change:
  `password-floor-and-self-rotation`.
- **SEC-3: an account cannot rotate its own password.** `PATCH /account/me`
  accepts `displayName` and `locale` alone
  (`src/http/account-routes.ts:31`), and the file exposes two handlers,
  `handleGetAccount` (`:62`) and `handlePatchAccount` (`:113`). Every password
  write runs through `system:admin` or the recovery CLI. Risk: a holder who
  suspects their password is exposed must ask an operator, who then knows the
  new value. It shares SEC-2's validator, so one change covers both.

  Decided 2026-09-23 (change `decide-security-findings-before-1-0`): build
  before 1.0. Shape: `PATCH /account/me` takes the current and the new
  password. The account screen gets a field for it. Follow-up change:
  `password-floor-and-self-rotation`, shared with SEC-2.
- **SEC-5 (closed as `postgres-login-rate-limit`)**: see
  `docs/decisions-archive.md`.
- **SEC-6: no ceiling on an instance's total attachment bytes.**
  `MAX_ATTACHMENT_BYTES` bounds one upload, 5 MiB by default
  (`src/http/routes.ts:86`, enforced at `:369`). `uploadAttachment`
  (`src/runtime/attachments.ts:44`) inserts the row without an aggregate. Risk: one
  credentialed actor can grow an instance's stored bytes without bound. The
  review puts this storage bound ahead of a general rate limit: one aggregate
  query at the existing enforcement point.

  Decided 2026-09-23 (change `decide-security-findings-before-1-0`): build
  before 1.0. Shape: a new variable `MAX_INSTANCE_ATTACHMENT_BYTES`. One
  `SUM` inside `uploadAttachment`'s transaction, under the instance row
  lock, so two concurrent uploads cannot both pass. Over the limit answers
  the same status as the per-file limit, 400 today (`RequestShapeError`,
  `src/http/routes.ts:370`, mapped at `src/http/errors.ts:90`). Follow-up
  change: `instance-attachment-byte-ceiling`.
- **SEC-9: a role reduction waits for the issued token to expire.**
  `src/auth/jwt.ts:148-156` checks `isActiveAccount` on every locally issued
  token and reads roles from the token's own claim, and the comment there
  points at the `admin-user-management` spec. Disabling an account ends its
  session at the next request, while removing one role leaves the old set
  effective until expiry, up to eight hours. Risk (Low): an operator who
  revokes `system:admin` from an account that stays active waits for that
  expiry.

  The per-request check, `isActiveUser` (`src/auth/users.ts:127`), reads
  only the account's `disabled` flag. Re-enabling the account therefore
  revives the old token with its old roles. The zero-code method is to keep the account disabled
  until its last issued token expires, up to eight hours, and then re-enable
  it. The next login issues the reduced set. That method sits in no operator
  document today.

  Decided 2026-09-23 (change `decide-security-findings-before-1-0`): build
  before 1.0. Shape: for a token this engine issued, the per-request
  account read returns the roles too and replaces the token's claim; a
  token from an external issuer keeps its own. This reverses the
  `admin-user-management` rule "A role change does not reach an
  already-issued token." Follow-up change: `live-roles-for-local-tokens`.
- **`initSchema` takes no lock at startup.** `initSchema`
  (`src/engine/store.ts:76`) runs its `CREATE ... IF NOT EXISTS` statements
  with no lock, and the server calls it at startup
  (`src/http/server.ts:940`). Two processes that start together against a
  new or upgraded schema can race on those statements. One process that
  finishes startup first leaves the others no table to add. The runbook's
  "Running more than one engine process" section names the workaround
  today: start one process first, then start the rest only after it
  reports ready.

  Decided 2026-09-23 (change `decide-security-findings-before-1-0`): build
  before 1.0. Shape: an advisory lock around `initSchema`, which retires
  that runbook rule.

## Accepted risks (decided, nothing to build)

The owner accepted each finding below on 2026-09-23, with a reason and no
build.

- **SEC-4: the session token lives in `localStorage`.** `browserStorage` reads
  the global at `packages/web/src/shell/session.ts:39`, `loadSession` reads
  the key at `:44`, and `persistSession` writes it at `:65`. Risk: any script
  running on the origin can read the bearer token. The review treats this as a
  decision rather than a defect: keep `localStorage` and record why, or move
  to a `Secure; HttpOnly; SameSite=Strict` cookie and pay a CSRF token on
  every mutating route. Either outcome belongs in an OpenSpec change.

  Accepted 2026-09-23 (change `decide-security-findings-before-1-0`): the
  built `index.html` sets `script-src 'self'` (`packages/web/csp.ts:23`).
  That blocks inline script and script from another origin. It does not
  block script that the app's own origin serves, such as a compromised
  bundled dependency.

  A bearer header is immune to CSRF. An integration authenticates with a
  bearer token anyway, so a cookie would add a second authentication path.
  That path needs a CSRF token on every mutating route. CORS would then run
  in credentials mode, and `CORS_ALLOWED_ORIGINS` loses the `*` value.

  A script that runs on the origin can read the token from `localStorage`
  and send it away. The attacker can then replay it from anywhere until it
  expires, up to eight hours (`TOKEN_LIFETIME_HOURS`,
  `src/auth/login.ts:23`). An `HttpOnly` cookie would stop that theft. It
  would still let such a script misuse the open session. The owner accepted
  this residual risk on 2026-09-23.
- **SEC-8: attachment `contentType` is caller-supplied and echoed on
  download.** The upload schema at `src/http/routes.ts:113` constrains it to
  `MIME_TOKEN_PAIR` (`:112`), and the download handler at `:394` returns it
  as `Content-Type` through `toBinaryResponse` (`src/http/server.ts:201`).
  Every binary response carries `X-Content-Type-Options: nosniff`, and
  `BINARY_ROUTES` gives this route `Content-Disposition: attachment`, so a
  stored `text/html` downloads rather than renders. Risk (Low): a later change that drops one of those layers turns a
  stored file into rendered content. The review's optional fix is an
  allowlist of upload types in place of the shape regex.

  Accepted 2026-09-23 (change `decide-security-findings-before-1-0`): three
  layers stop a stored file from rendering, starting with the download
  route's own bearer-header requirement, so a plain link cannot open it.
  The API response carries `X-Content-Type-Options: nosniff` and
  `Content-Disposition: attachment` (`src/http/server.ts:201-214`), guarded
  by `test/http-disposition.test.ts`. The SPA fetches the file and saves it
  through `<a download>`
  (`packages/web/src/areas/app/screens/TaskScreen.tsx:404-410`) and revokes
  the blob URL right after the click. The SPA's own CSP does not reach the
  download response. An allowlist would turn each new file type into a
  configuration change instead. Residual risk: the
  saved blob carries the caller's type and the app's origin, and a later
  inline preview of it would render stored HTML there and reopen SEC-8.
- **SEC-10: development defaults.**
  The Pod spec `scripts/dev-pod.sh` generates sets `ALLOW_INSECURE_DEV_AUTH`
  to `"1"` and `POSTGRES_PASSWORD` to `postgres`. Both serve a disposable
  local stack, the server prints `AUTH DISABLED` at startup
  (`src/http/server.ts:409`) whenever the first applies, and the production
  image in `deploy/engine.Dockerfile` inherits neither. Risk (Informational): a pod
  played from the generated spec outside the devcontainer runs with auth
  disabled. The review recorded it for completeness and recommends nothing.

  Accepted 2026-09-23 (change `decide-security-findings-before-1-0`): the
  production image inherits neither default. The server prints
  `AUTH DISABLED` at startup whenever the first one applies. Nothing reports
  the second.

## Open from the 2026-08-18 code review (each needs its own OpenSpec change)

<!-- antislop: allow trailing-negation -->
<!-- "Decided, not yet built" quotes an existing section heading verbatim. -->
Four items on the Prioritized Action List of
[`openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW.md`](../openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW.md)
stood open. CQ-1, ARCH-1 and TEST-1 are resolved, and DEP-1 stays open.
SEC-1 closed 2026-09-23 as `add-publish-cycle-check-and-cel-deadline`; see
`docs/decisions-archive.md`.
Each was re-checked against the tree on 2026-09-09. That review holds the
reasoning and the recommended fix. The owner decided the other five on
2026-09-23. See "Decided, not yet built" and "Accepted risks" above. This
section records that nothing else tracks the one still open.

- **TEST-1 (resolved by `widen-test-guards`): nothing asserted that every route
  refuses an uncredentialed request.** `test/http-route-auth.test.ts` reads the
  route table from `src/http/server.ts` and sends each row a request with no
  credential. Each route answers 401. A named exemption set holds
  `POST /auth/login` and `GET /ui-strings`.
- **DEP-1: CI runs no SAST and no secret scanning.**
  `.github/workflows/check.yml` is the only workflow, and it holds no CodeQL
  or `gitleaks` job. Dependabot covers version drift alone
  (`.github/dependabot.yml`). Risk: a committed credential or a code-level
  pattern reaches `main` unflagged. CodeQL is free for a public repository and
  adds one job.
- **CQ-1 (resolved by `add-ci-audit-and-linter`): 81 dead `eslint-disable`
  directives, and no linter.** oxlint 1.85.0 now runs in `bun run check`,
  pinned as a dev dependency. The original count of 81 undercounted the
  total. oxlint found 92 dead directive lines, and all 92 are deleted.
  `--report-unused-disable-directives` fails the script on any new one.
- **ARCH-1 (resolved by `split-runtime-api`): `src/runtime/api.ts` has grown
  to 2,673 lines.** The review
  measured 1,384 on 2026-08-18, itself up from 1,269 the pass before. It is
  still the largest source file in the repository. Next come
  `packages/web/src/areas/studio/canvas/CanvasView.tsx` (1,791),
  `src/schema/definition.ts` (1,428) and
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx` (1,356). Two
  test files run longer: `test/runtime-api.test.ts` holds 3,128 lines and
  `test/http.test.ts` holds 2,562. Risk: a reviewer reading one operation
  carries the whole file, and two agents editing it contend. The review's fix
  is a split into sibling modules re-exported from `api.ts`, so no import site
  changes. `api.ts` is now a 117-line barrel; `src/runtime/queries.ts`, the
  new largest module, holds 651 lines.

<!-- antislop: allow trailing-negation -->
<!-- "Decided, not yet built" quotes an existing section heading verbatim. -->
The five findings below never reached the list above. Four are Low and one
was Informational, DEP-2, now resolved. SEC-7 closed 2026-09-23 as
`add-publish-cycle-check-and-cel-deadline`; see `docs/decisions-archive.md`.
Each was re-checked against the tree on 2026-09-10, and each entry carries
the anchor that holds today. The owner decided the other three on
2026-09-23. See "Decided, not yet built" and "Accepted risks" above. The
four Low ones stay open.
- **ARCH-2: `BINARY_ROUTES` is a hand-kept ledger.** The
  list sits at `src/http/server.ts:273`, and `test/http-disposition.test.ts`
  drives every declared entry. TEST-1 above covers the review's second
  ledger, the per-handler role checks. Risk (Low, narrowed): a binary route added and never
  declared ships without `Content-Disposition`, and no test notices. That
  one case is all that remains of the finding.
- **CQ-2: doc comments duplicate facts held elsewhere.** The header of
  `src/auth/authorize.ts` states which role admits which route at `:30-61`,
  while the route table in `src/http/server.ts` and each handler's own check
  are where that is true. Risk (Low): a rename in `src/http/server.ts` leaves
  the header wrong, and no gate covers it. The review's fix is to name where
  the route table lives instead of restating it.

  The `docs/current-state.md` half of this finding is closed. It used to
  repeat the same shape by listing exported symbols by hand. The change
  `trim-docs-weight` closes it: the file is now an index that names no
  exported symbol, so a rename breaks nothing there.
- **DEP-2 (resolved by `add-ci-audit-and-linter`): the CI workflow runs no
  `bun audit` step.** The `check` job now runs `bun audit
  --audit-level=high` right after `bun install`. A high or critical
  advisory fails the job. Dependabot still covers version drift alone.
- **PERF-1: fixed 500 ms polling per tenant.** `src/engine/host.ts:384`
  runs `pollForever` for the outbox drain on a 500 ms loop wrapped in
  `eachTenant`, with the resolution and timer sweeps beside it at `:385` and
  `:386`. Risk (Low): at many tenants each cycle issues work proportional to tenant
  count whether or not any tenant holds a pending row. The review names a
  Postgres `LISTEN`/`NOTIFY` wake-up or one cross-tenant claim query as the
  replacement, once tenancy grows past a handful.
- **PERF-2: one query per refused permission check.** `can()` at
  `src/auth/authorize.ts:126` short-circuits on the global role before any
  query, so the common paths cost nothing. Risk (Low): a burst of refused requests
  from one actor issues one grant query each. The review calls it documented
  and correctly bounded, and recommends nothing.

## Open from the 2026-09-11 design audits (one OpenSpec change per screen)

Three changes ran `/impeccable critique` and `/impeccable audit` on 2026-09-11.
They are `steps-rail-rows-drop-summary-line` on the Studio Steps tab,
`destructive-buttons-show-the-accent` on the admin instance screen, and
`tighter-canvas-bar` on the Studio Canvas tab. Their browser walks found the
rest. Every item below sits outside the change that found it, and each was
recorded rather than fixed. The RAIL tags are local to this section.

- **RAIL-2: the reorder control is 26px wide.** `studio-steps-rail-drag-reorder`
  replaced the move buttons with one drag grip, in the `grip` style of
  `StepsRail.tsx`. That style pads an 18px icon by 4px on each side, the
  same sum the old `move` style used, and its declared 24px `minWidth`/
  `minHeight` floor never binds against that larger sum. Risk (Low), carried
  over unchanged: that width clears the 24px minimum target and misses the
  44px enhanced one.
- **RAIL-3 (resolved by `studio-focus-ring-clipping`): the rail clips its own
  focus ring.** The rail scrolls on its
  block axis, and a scroll container on one axis clips the other. The shell
  draws a 2px ring at a 2px offset, in `global.css`. Risk (Low): the ring's
  leading edge falls outside the rail's box and disappears.
- **RAIL-4 (resolved by `studio-steps-rail-drag-reorder`): a move control
  named no step.** Each one carried the icon alone, labelled "Move earlier"
  or "Move later", and every row repeated that pair. The grip that replaced
  both now carries an `aria-label` naming the step
  (`stepsRail.dragHandle`: "Reorder {step label}. Alt+Up or Alt+Down moves
  it."), so a screen reader reads a distinct name per row.
- **RAIL-5: the issue badge marks severity by colour alone.** A blocker takes
  the refusal ink and an advisory the muted ink, in `StepsRail.tsx`. The
  label behind the count omits the severity. Risk (Medium): colour is the
  only carrier, which WCAG 1.4.1 refuses.
- **RAIL-6: the desktop rail is narrower than the phone rail.** The Steps tab
  gives the rail 18rem beside the step page, in `EditScreen.tsx`. Below 64rem
  the rail takes the full width and caps its height at 20rem.
- **RAIL-7: below 64rem the Steps tab nests three scroll boxes.** The rail
  stands over the step page, and the step page scrolls on its own
  (`panels/StepPage.tsx:45`). The tab body scrolls around both. Measured
  2026-09-24 at 400x800: the tab body scrolls 161px and the rail 352px. The
  step page scrolls 2698px inside a box 244px tall. Risk (Medium): a wheel
  or a swipe moves whichever box sits under it, and the step page shows
  244px at a time.
- **DRAFT-1 (behaviour bug, own OpenSpec change): the header bar's Discard
  draft does nothing.** Choose it on a
  draft's process surface, then choose the dialog's own Discard draft: the
  dialog stays open, the draft survives, and the process list still lists it.
  The console reports no error. Measured 2026-09-12 at 1440px and at 420px,
  during a browser check for another change. The process list's own Discard
  button does work, through a native browser confirm. Risk (High): the studio
  has no undo, so an author who means to drop a draft keeps it, and the next
  session reads that draft as current work.
  Risk (Informational): a long label wraps on a wide screen and fits on a
  narrow one.

  A re-check on 2026-10-30 did not reproduce it. The entry stays open until a
  second check or a found cause closes it.
- **A canvas removal drops keyboard focus, and nothing announces it.**
  `deleteSelection` (`packages/web/src/areas/studio/screens/EditScreen.tsx:678`)
  clears the selection. The pressed control unmounts with it, so focus lands on
  `<body>` and the next Tab reaches Fit to view. Remove steps behaved this way
  before Remove step joined it. Risk: a keyboard or screen-reader user loses
  their place after every removal (WCAG 2.4.3, and 4.1.3 for the silence). The
  fix moves focus to the canvas's own tab stop, which
  `packages/web/src/areas/studio/canvas/CanvasView.tsx:768-776` already reassigns,
  and announces the removal in a polite live region.
- **The canvas bar's caret menu ignores the arrow keys.** The panel carries
  `role="menu"` (`packages/web/src/areas/studio/canvas/CanvasBar.tsx:376`), and
  ArrowDown leaves focus on its trigger. Risk: a screen reader announces a menu
  whose keys answer nothing (WCAG 4.1.2).
- **No key takes a selected step out of the draft.** Delete and Backspace on a
  selected node do nothing (`canvas/CanvasView.tsx`). A removal needs the
  pointer, or a Tab back to the canvas bar's own control.
- **CANVAS-1: at 400px the canvas clips the Arrange ring by 2px.** The
  canvas's own toolbar sits 8px inside the canvas, in one row that never
  wraps (`canvas/CanvasView.tsx:80`). The canvas clips at its padding edge,
  with `overflow: hidden` (`:70`). Measured 2026-09-24 at 400x800: Fit to
  view, Rounded corners and Arrange fill the row, and Arrange's ring runs
  2px past the right edge. The canvas scrolls nothing, so the scroll-box
  rule of `studio-focus-ring-clipping` does not reach it. Risk (Low): the
  ring loses 2px on one side and still meets WCAG 2.4.7.
- **A field's border reads 1.32:1 in light and 1.64:1 in dark.** The 1px
  hairline sits at `packages/web/src/shell/global.css:70`. WCAG 1.4.11 asks 3:1
  of a boundary that identifies a control. `DESIGN.md`'s Inputs / Fields entry
  sets that hairline, so the call belongs to the design language.
- **Every `.btn` stands 36 to 37px tall, under the 44px touch target.** Its
  padding sits at `packages/web/src/shell/tokens.css:158`. The studio serves a
  desktop audience, so this one waits on a touch one.
- **`createStep.ts` calls the canvas add controls "the palette".** The retired
  word sits at `packages/web/src/areas/studio/draft/createStep.ts:8` and `:15`.
  `.claude/rules/ui-glossary.md` keeps *palette* for the form editor's field
  list alone.
- **Cancel instance commits on one press, touches Refresh, and drops focus.**
  `doCancel` (`packages/web/src/areas/admin/screens/InstanceScreen.tsx:250`)
  asks nothing, while `doRedact` at `:262` confirms first. Cancel instance also
  ends where Refresh begins, a 0px gap that reads as one segmented control. The
  press disables the focused button, which the refresh then unmounts (`:357`),
  so focus drops to the document. Risk: one stray press cancels a running case.
- **The accent carries two meanings on the instance screen.** The RUNNING
  stamp's 2px outline and Cancel instance's 1px outline sit about 110px apart.
  `DESIGN.md`'s Stamp Rule and its Destructive entry each ask for theirs, so
  the tension sits in `DESIGN.md` itself.
- **`.btn-ghost` text falls under 4.5:1 on its own washes.** The draft
  confirmation dialog's Cancel carries it
  (`packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx:588`). Its accent
  text reads 3.90:1 hovered and 3.44:1 pressed in light, and 4.15:1 pressed in
  dark. `destructive-buttons-show-the-accent` cleared the same shortfall for
  `.btn-destructive` with `--color-accent-on-muted`, and this one wants the
  same treatment. The removal dialog's Cancel
  (`packages/web/src/areas/studio/panels/RemoveFieldDialog.tsx:204`) and the
  field catalog's Remove field trigger
  (`packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx:973`) carry the
  same class. Both read 4.53:1 at rest, 3.90:1 hovered and 3.45:1 pressed, in
  light.
- **Remove step and the field catalog's Remove field trigger have no
  destructive treatment.** `packages/web/src/areas/studio/panels/StepPage.tsx:776`
  renders `btn btn-secondary` and commits at once.
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx:973` renders
  `btn btn-ghost` and opens `RemoveFieldDialog` instead. `DESIGN.md` asks that
  a destructive action stay outlined in the accent. The field catalog's
  trigger also reads "Remove field" on every entity, group included; its own
  dialog a moment later reads "Remove group".
- **A span-1 card's label collapses to zero width in a two-column form.**
  Measured at 1440x900 on the form editor canvas: `cost_center` draws eleven
  letters down one column. The member row spends about 315px on Move up, Move
  down and Remove, which leaves the card 51px. Any span-1 card in a two-column
  form collapses, inside a group or not.
- **Creating a draft takes tens of seconds and shows no progress.** One
  measurement read 56.9s on the seeded `purchase_requisition` v3. Another
  watched eight `GET /drafts/<id>` polls answer 404 over 7.5s. The button
  disables for that whole wait, but nothing signals how much longer it runs.
- **Browser-check entries name retired UI.** Twelve lines of
  `docs/browser-checks.md`, from `:152` to `:3144`, still name the
  configuration pane or the ribbon bar.
  `.claude/rules/ui-glossary.md` retired both words with the process surface.
- **STEP-1: at 1280px a condition row runs under the next section.** The
  critique of `authoring-command-ink-advisory-role` measured it on
  2026-09-14. The IT Offboarding draft's first path had a condition row.
  - The "Only when" fieldset keeps the default `min-inline-size: min-content`
    (`panels/PathsPanel.tsx:332`). The row's field select takes its longest
    option's width, 647px (`panels/shared/ConditionBuilder.tsx:209`). The
    fieldset then ends at x=1028, past the Path to section's edge at x=863.
  - The On exit section covers the row's last 107px, its remove control
    included. At 1600px the row fits.
  - Risk (Medium): a pointer cannot reach the row's remove control at 1280px,
    and the dashed box runs under another section.
- **STEP-2: the guard's label wraps the whole condition builder.** One
  `<label>` holds the guard text and the builder (`panels/PathsPanel.tsx:348`).
  - Before a row exists, "+ Add row" is that label's first labelable control
    (`panels/shared/ConditionBuilder.tsx:176`). Measured 2026-09-14, a click on
    the label's own text added a row. The button's accessible name then reads
    every word inside the label, from "guard" to "Developer view".
  - An empty row's hint links to no control. The value input has no
    `aria-describedby` pointing at it (`:134`).
  - Risk (Medium): a stray click adds a row, and a screen reader hears a name
    without the visible words (WCAG 2.5.3 and 1.3.1).
- **STEP-3: three literal sizes sit off the type ramp.** The detector flagged
  them on 2026-09-14. The step page's `hint` sets written text at 0.8rem
  (`panels/StepPage.tsx:164`). A condition row's remove glyph sets 1.1rem
  (`panels/shared/ConditionBuilder.tsx:63`). The header bar's name sets 1rem,
  where the Headline role asks 1.25rem (`panels/ProcessHeaderBar.tsx:39`).
  - Four more flags on the step page mark mono machine values at 0.8rem.
    The Hierarchy in `DESIGN.md` allows that size for them.
  - Risk (Low): type drifts outside the roles `DESIGN.md` names.
- **STEP-5: a step's description takes a one-line input.** The masthead's
  description uses `LocalizedTextInput` (`panels/StepPage.tsx:808`), which
  renders an `<input>`. Measured 2026-09-24 at 1300x900, IT Offboarding's
  first step holds an 857-character description. The 944px input shows
  about a sixth of it. Risk (Low): the author edits a paragraph through a
  slot one line tall.

## Open from the 2026-09-13 Fields tab audits (one OpenSpec change per screen)

The change `group-child-own-editor` ran a final code review, browser walks,
`/impeccable critique` and `/impeccable audit` on the Studio Fields tab on
2026-09-13. They found FIELDS-2 to FIELDS-14, and the change
`visually-hidden-text-page-bounds` fixed FIELDS-2. The change
`remove-field-takes-its-references` added FIELDS-15 to FIELDS-24 on the same
day, from its design, reviews, browser walks and audits. Every item below
sits outside the change that found it, and this section records it in place
of a fix. The `FIELDS-n` tags are local to this section; paths under
`panels/`, `draft/` and `screens/` start at `packages/web/src/areas/studio/`.

- **FIELDS-3: below 64rem a short window leaves the editor a strip.** The
  rail stacks above the editor, capped at 20rem (`panels/EntityTabs.tsx:90`).
  Measured 2026-09-13: the editor pane stands 105px tall at 900x720, and 18px
  at 420x720 with its heading cut off. Measured 2026-09-26 at 400x800, "+ Add
  field" raises the FIELDS-8 banner, and the pane shrinks to 8px. The new
  label input and its ring, 42px, then clip at both edges. No 2px rule
  separates the two scroll regions: the rail drops its right-hand border
  there (`:87`). Risk (Medium): the rail keeps its 20rem and the editor gets
  what remains.
- **FIELDS-4 (resolved by `studio-focus-ring-clipping`): the entity rail and
  the editor pane clip the focus ring.** This
  is RAIL-3 on the Fields tab. The shell's 2px ring at a 2px offset
  (`packages/web/src/shell/global.css:37`) loses its edge against both scroll
  boxes (`panels/EntityTabs.tsx:73`, `:86`). On the chosen entry the ring and
  the 3px current mark (`:128`) share one accent. Risk (Low): the ring still
  meets WCAG 2.4.7.
- **FIELDS-5: the Validation disclosure takes its count as its name.** Its
  `<summary>` prints `({carried.length})` alone
  (`panels/shared/FieldValidationEditor.tsx:77`). With no validation key
  carried, its accessible name reads "(0)". Risk (Low): a screen reader hears
  a bare count (WCAG 2.4.6).
- **FIELDS-6: the entity rail is a flat list of tab stops.** IT Offboarding's
  rail holds 51 entries plus "+ Add field". That makes 52 tab stops, with no
  arrow keys and no filter. Its landmark is a `nav` named "Editors"
  (`panelsScreen.railLabel`, `packages/web/src/i18n/catalogs/studio.ts:534`).
  An entry's check badge reads "1 issues" for one check
  (`panels/EntityTabs.tsx:326`), from the key `panelsScreen.issueMark`
  (`packages/web/src/i18n/catalogs/studio.ts:537`). Risk (Low): a keyboard
  user presses Tab up to 52 times to cross the rail.
- **FIELDS-7: the Fields tab's headings and checks lack structure.** The
  outline jumps from the header bar's `h1` to the field's `h3`. They sit at
  `panels/ProcessHeaderBar.tsx:793` and `panels/FieldCatalogPanel.tsx:1205`,
  with zone headings at `h4` (`:599`). A zone's check list (`:602`) sits above
  its controls, and neither `aria-invalid` nor `aria-describedby` ties a check
  to its control. The zone heading marks a check by colour alone (`:267`,
  `:599`). Risk (Medium): the heading levels skip, a check names no control,
  and colour alone marks a zone (WCAG 1.3.1 and 1.4.1).

  Since `forms-card-legend`, the Forms tab's card labels stand at `h2` under
  the header bar's `h1`. The repair matches that level or moves them with it.
- **FIELDS-8: check messages speak the engine's layers.** Measured 2026-09-13,
  the Fields tab showed `ZOD missing baseLocale ('en') entry` and
  `field key must match /^[a-z_][a-z0-9_]*$/ to be a valid CEL identifier`.
  A view entry naming an id no field carries — the shape an unfixed field
  removal left then, and a JSON-view edit can still write today — showed
  `view ref does not resolve: field_0fb5a2c4-0022-…`, an id the author can no
  longer look up. Adding an empty field raises the banner at
  `screens/EditScreen.tsx:967` before the author types. The banner reads
  `Draft is not yet structurally valid — CEL, registry, duration, and cross-process checks are held back until it is (see the Zod issues below)`,
  and it pushes the page down 35px at 1400px and 99px at 900px. The messages
  come from `src/schema/definition.ts:1014`, `src/schema/compile.ts:612` and
  `src/schema/definition.ts:1095`, and the "ZOD" label from
  `panels/shared/IssueList.tsx:44`. Risk (Medium): an author reads Zod, CEL
  grammar and raw ids where a plain sentence belongs.

  Since `studio-fresh-draft-starts-clean` the process-name message reads a
  sentence, and the field-label part stays open.
- **FIELDS-9: a group's editor leads with zones a group cannot use.** Its
  definition half shows "Where values come from"
  (`panels/FieldCatalogPanel.tsx:882`). It also shows a disabled "Default
  value" (`:933`), "Validation" (`:937`) and a disabled Technical checkbox
  (`:863`). Its effect half shows "A participant must fill this in" (`:1076`)
  and up to 12 "Show on the canvas" buttons. Each button's accessible name
  omits its step (`:1008`). The group's one action, the zone "Fields inside
  this group" (`:948`), comes after "Validation". Measured 2026-09-13 at
  1400x900, its heading sits at y=1078, 200px below the pane's bottom.

  The zone's body looks the same for 18 fields and for none, and its button
  (`:949`) names no group. A screen reader also reads the "+" leading its
  label. A nested field's editor names its group only in the move control's
  value (`:556`). Risk (Medium): the group's one action sits out of view,
  behind controls a group cannot use.

  This item needs the owner's call before any change. The zone's place after
  "Validation" is a `studio-app` requirement
  (`openspec/specs/studio-app/spec.md:3146`). The Non-Goals of
  `group-child-own-editor` keep "Where values come from" and "Validation" on a
  group's editor
  (`openspec/changes/archive/2026-09-13-group-child-own-editor/design.md:94`).
  That design also records the owner's own anti-goal "no breadcrumb in the
  heading" (`:69`).
- **FIELDS-10: the field editor's type drifts from `DESIGN.md`.** Measured
  2026-09-13, the field's `h3` computes weight 700, where `DESIGN.md:324`
  allows 800 and 400. Its `panelHeading` style
  (`panels/FieldCatalogPanel.tsx:87`) sets no weight. Field labels compute
  14.4px, sentence case, in ink (`:102`), where the Label role is 11px
  uppercase tracked slate (`DESIGN.md:339`). Zone headings compute 14.4px at
  800 in ink (`panels/FieldCatalogPanel.tsx:257`), and none takes the Title
  role (`DESIGN.md:333`). The Remove field button
  (`panels/FieldCatalogPanel.tsx:973`) is an accent ghost
  (`packages/web/src/shell/tokens.css:221`), and its text starts 5px right of
  the column's flush-left edge. Risk (Low): the field editor sets type outside
  the roles `DESIGN.md` names.
- **FIELDS-11: a nested plugin-typed field's length check lands on another field.**
  The engine's `collectPluginTypeSites` (`src/schema/compile.ts:715`) locates
  it as `fields[i].type.type`. There `i` is the flat `collectFieldsDeep` index
  (`:727`, over `src/schema/definition.ts:379`). The studio's `resolveLoc`
  (`draft/issues.ts:87`) reads `fields[i]` as a top-level index and follows
  `fields[i].fields[j]` chains (`:121`). The compile pass's other field-tree
  checks write that chain through `walkFieldsIndexed`
  (`src/schema/compile.ts:223`). Risk (Low): the check shows on an unrelated
  field or on the process. The fix touches `src/`.
- **FIELDS-12: the Checks tab opens the Fields tab without the field.** A
  check row calls `openTabFromRow(tabForIssue(issue.entityType))`
  (`screens/EditScreen.tsx:1166`). That function takes a tab alone (`:891`),
  and `FieldsTab` accepts no selected field (`:1104`). The spec
  `studio-process-tabs` asks for that field to open selected
  (`openspec/specs/studio-process-tabs/spec.md:263-264`). Risk (Medium): the
  author lands on the Fields tab and must find the field in the entity rail.
- **FIELDS-13 (narrowed): two `docs/browser-checks.md` passages still walk
  a Values tab.** `.claude/rules/ui-glossary.md` already dropped the "field
  tabs" row this finding once named, since the field editor now has two
  halves and no tab set (`panels/FieldCatalogPanel.tsx:632-634`,
  `openspec/specs/studio-app/spec.md:3136-3138`), and it edits a field at any
  depth. `docs/browser-checks.md:2201-2213` and `:2928` still describe a
  Values tab that does not exist. Risk (Low): a browser check walks a
  control that is not there. The next change that touches this screen must
  rewrite both passages.
- **FIELDS-14: `FieldsTab` walks the field tree once per rail entry.** Each
  call of `FieldsTab` walks the whole tree twice, in `flattenRailFields` and
  `flattenDraftFields` (`panels/EntityTabs.tsx:367`, `:368`). Each rail entry
  then walks it once more through `parentIdOf` (`:609`,
  `panels/fieldCatalogLogic.ts:330`), top-level entries included. Each entry
  also scans the whole check list for its badge count
  (`panels/EntityTabs.tsx:599`, `draft/panel-rail.ts:98-99`). For N entries
  that makes N + 2 tree walks and N scans of the check list. Risk
  (Informational): the cost grows with the square of the catalog's size and
  stays harmless at 51 entries.
- **FIELDS-16: two check messages call a removed field present.** A removal
  leaves a kept `org.actor-from-field` assignment setting that names the
  removed id, since `fieldRemovalReach` only counts a plugin setting
  (`draft/field-removal.ts`, the `pluginSettings` kind).
  `checkActorFromFieldReference` (`src/schema/compile.ts:524`) then reports
  the field as one that `does not declare format: "person"` (`:540`),
  wording that still assumes the field exists. A stored dangling view entry
  — the shape an unfixed field removal once left — reaches
  `checkViewGroupReferences`'s third clause (`src/schema/compile.ts:1015`)
  the same way. With no catalog parent left for the id, the check reports
  `the catalog holds this field at the top level` (`:1031`), naming a field
  the catalog no longer holds. Risk (Medium): both messages read as a field
  to fix, when the field is already gone.
- **FIELDS-17: two kept settings fail no check the draft ever runs.** A
  removal leaves a `valueFromField` or `instanceIdField` value that names a
  removed id, since both are plugin-config settings `fieldRemovalReach` only
  counts. `checkInstanceQueryValueFromField` (`src/engine/definitions.ts:228`)
  and `validateInstanceTransitionReferences` (`:424`) reject an unresolved
  one, but only `publishBody` calls them. The studio's own checks rail,
  `draft/validation.ts::runValidation` (`:82`), calls `validateStructure` and
  `validateReferences` alone, so neither check runs before publish. Risk
  (Medium): an author sees no warning from the checks rail before publish.
- **FIELDS-18: a reused key rebinds an old expression with no message.** A
  removal leaves every CEL expression that reads a removed field's key,
  since `fieldRemovalReach`'s `celReads` count and `removeFieldAndReferences`
  both stop at counting and keeping them. The checks rail then reports each
  one's key as unknown, the same way it reports any other guard reading a
  key no field holds. A field the author later adds with that same key
  resolves every such expression again: `data.<key>` becomes valid CEL,
  against a different field than the one that wrote it. No check compares a
  field's id across that gap, so the checks rail falls silent, and the
  rebind has no message of its own. Risk (Medium): an old guard or
  `validation.rule` reads a new field's value under an identity change
  nobody marked.
- **FIELDS-19: a label holding a `$` pattern breaks a sentence that fills
  it.** A string replacement to `String.prototype.replace` expands `$&`, `$$`,
  `$'` and `` $` `` instead of inserting the label as literal text. A label
  reading `Cost $&` turns into the literal text `Cost {field}` inside the
  rendered sentence. This change fixed the removal sentences. Both
  `removalAnnouncement` (`panels/fieldCatalogLogic.ts:425`) and the removal
  dialog's heading (`panels/RemoveFieldDialog.tsx:116`) pass a replacer
  function, `() => label`.

  The `packages/form-ui` site now passes a replacer too, in one pass:
  `tabSwitchAnnouncement` (`packages/form-ui/src/tabs.ts`), fixed by
  `fix-form-ui-empty-values`. The count below covers `packages/web/src` alone.

  Measured 2026-09-13, `packages/web/src` holds 54 `.replace("{` calls in 15
  files. Twelve pass a replacer function: the five removal fills, and seven in
  `panels/ChangeList.tsx`, `panels/ChangesView.tsx` and
  `screens/VersionsScreen.tsx`. The other 42 pass a string, in 10 files. Six
  calls split across lines, and two lines carry two calls each:
  `EntityTabs.tsx`'s move sentences (`:570`, `:571`). The grep
  `git grep -n '\.replace("{' -- packages/web/src` therefore matches 46 lines.

  Two helpers build the placeholder in a template literal, which that grep
  misses. The admin area's `tFill`
  (`packages/web/src/areas/admin/catalog.ts:17`) passes a string to
  `replaceAll`. The helper `fill` (`draft/changeSet.ts:172`) passes a replacer
  function. Risk (Low): one replacer function closes every site that still
  passes a string: `.replace("{field}", () => label)`.
- **FIELDS-20: a second identical move announces nothing.** `moveField`
  (`panels/EntityTabs.tsx:550`) writes its sentence straight into the shared
  live region (`:568`), a pattern that predates this change. `removeField`
  (`:524`) empties the region first and writes on the next animation frame
  instead. That step matters when one removal sentence repeats, since two
  different sentences announce without it. Two unnamed fields moved into the
  same group, one after another, still produce one sentence twice: the live
  region's text never changes, so a screen reader announces the first move
  and stays silent on the second. Risk (Low): one shared writer, emptying the
  region first, closes the gap for both sentences.
- **FIELDS-21: the live `studio-publish` requirement names a backdrop
  dismissal no dialog has.** Its "Publishing confirms in a modal dialog that
  names the version and its immutability" requirement names "a backdrop
  dismissal" among the close routes that return focus
  (`openspec/specs/studio-publish/spec.md:350`). A native modal has no such
  route. Measured on 2026-09-13: a backdrop click leaves the Publish and the
  Discard draft dialogs open. Risk (Low): the requirement asks for a route
  no dialog offers.

  Two fixes exist, each a change of its own: drop the route from that
  sentence, or add a deliberate backdrop dismissal (`closedby="any"`) to
  every studio confirmation dialog, with its focus return.
- **FIELDS-22: the kept-reference note names no location.** When a removal
  keeps a CEL read or a plugin setting, the dialog adds "CEL expressions and
  plugin settings keep their text." and "Check each one before you publish."
  (`panels/RemoveFieldDialog.tsx:192-193`). It names no expression and no
  setting, and no later screen lists them all
  (`openspec/specs/studio-app/spec.md:4527-4529`).
  A kept CEL read, or a kept `process.start` mapping value, surfaces later as
  an unknown-key result on the Checks tab.
  A kept `valueFromField` or `instanceIdField` setting fails the way FIELDS-17
  already describes.

  The step list the note leans on, "Used in", sits out of view when the
  author presses Remove field. Measured: its heading sat at -59px on one
  field and -190px on another, and the pane behind the open dialog stayed
  inert. The always-shown note's "step entry" is an internal word. The copy
  table of `remove-field-takes-its-references` fixed that wording
  (`openspec/changes/archive/2026-09-13-remove-field-takes-its-references/design.md:99`),
  so a rewrite needs the owner's sign-off too. Risk (Medium): the note tells
  the author to check references the dialog never lists.

  Name the routes: an advisory "kept reference" check, a
  `studio-checks-rail` change, or naming locations in the dialog directly,
  which reopens the owner's "counts only" choice from 2026-09-13.
- **FIELDS-23: removing a group's last field leaves an empty group card.**
  Removing "Access Excel updated or prepared" on IT Offboarding left its
  group, "Permissions", with no field on 4 step forms. Its "How it will
  look" preview is an empty box, the Forms tab shows the same empty card,
  and Checks reads 0. Neither the dialog nor the announcement mentions the
  group. Risk (Medium): a participant meets an empty section after publish,
  with no signal to the author beforehand.

  Name the routes: count the emptied group as reach, with its own row and
  note, or add an advisory check for a step that shows a group with no
  field. Either needs a `studio-app` change.
- **FIELDS-24: Remove field sits flush against "+ Add field".** Measured at
  1440x900: Remove field `[344, 802, 101×37]`, "+ Add field"
  `[344, 839, 109×37]`, 0px apart; `panels/FieldCatalogPanel.tsx:283-293`
  draws the 2px rule above Remove field only. A field with no reach leaves
  on one press (`panels/EntityTabs.tsx:482-485`), and a freshly added field
  always has no reach. A double click removes a field, then opens the
  neighbour field's Data source select. Risk (Medium): a press meant for
  "+ Add field" can remove the field just configured, with no undo.

  Name the fix: separate the two commands, with spacing and a rule between
  them, or move Remove field into the field's own heading row.
- **FIELDS-25: the effect half prints one step list twice.** "Only ask this
  when" and "Ask for this" each open with "Writes to:" and the full step list
  (`panels/FieldCatalogPanel.tsx:1023`, `:1061`). Measured 2026-09-24 at
  1300x900 on the group "Personal details": each list names all 12 steps and
  wraps to five lines. Risk (Low): each zone's own control sits below five
  lines of the same names.
- **FIELDS-26: a changed option value leaves CEL comparisons on the old
  string.** A change or deletion of an option `value` on a field leaves every
  CEL comparison such as `data.priority == "high"` on the old string. The
  type check raises no error and the studio shows no message.
  The key-rename guard (audit finding E2-7) locks the key against label
  changes and counts the readers of a key. It leaves this gap open on purpose, since
  finding a comparison needs a heuristic over CEL string literals, and that
  heuristic gives false positives. Risk (Medium): a guard stops matching after
  an option rename, and the path parks.

  Upgrade entry: extend the reader walk in
  `packages/web/src/areas/studio/draft/key-readers.ts` to report a string
  literal compared with the field.
- **FIELDS-27: a key notice names no reader and a rename leaves them
  dangling.** The notice counts the expressions that read a key, names none
  and offers no jump to them. The "Used in" column beside it has a "Show on
  the canvas" pattern to copy. After a committed rename, the notice recomputes
  for the new key and drops to no readers. An expression that now reads a key
  no field has gets no message beyond the checks rail's unknown-variable
  result. The key input has no Escape revert and no pending hint while the
  typed text differs from the key. Risk (Medium): a rename silently strands
  every guard that read the old key.

  Upgrade entry: a "rename and rewrite readers" command can close all three
  gaps. A rewrite would reuse the traversal of `removeFieldAndReferences`.
- **FIELDS-28: the lock shows no notice while the base version loads or
  fails.** Until the base version body has loaded, a field with a non-empty
  key counts as published, so the label no longer sets its key. The notice
  needs a confirmed publication, so it shows nothing. A failed fetch keeps
  that state, and the error is swallowed. A new field in a draft with a base
  version then derives `a` from the first letter and freezes. The empty-key
  case still derives. Risk (Low): the key stops following the label with no
  message.

  Upgrade entry: surface the fetch state from
  `packages/web/src/areas/studio/draft/publishedFields.tsx` and show a loading
  or error sentence.

## Open from the 2026-09-13 Changes tab audit (one OpenSpec change per screen)

The change `changes-tab-entity-change-list` ran browser walks,
`/impeccable critique`, `/impeccable audit` and `web-design-guidelines` on
the Studio Changes tab and the Versions screen on 2026-09-13. Every item
below predates that change or belongs to another component. The `CHANGES-n`
tags are local to this section; paths under `panels/` and `screens/` start at
`packages/web/src/areas/studio/`.

- **CHANGES-2 (resolved by `studio-focus-ring-clipping`): every tab body
  clips the edge of a focus ring.** The tab body
  scrolls and sets no inline padding (`screens/EditScreen.tsx:237`). The
  shell's 2px ring at a 2px offset (`packages/web/src/shell/global.css:37`)
  loses its edge against either side of that box. On the Changes tab it cuts
  the Expand all command's right edge, and at 400px the open command's left
  edge. The change list's row summary insets its own ring instead.
  This is RAIL-3 and FIELDS-4 on the tab body itself. Risk (Low): the ring
  still meets WCAG 2.4.7.
- **CHANGES-3: the Versions screen scrolls sideways at 400px.** Its six-column
  table sits in no scroll box of its own (`screens/VersionsScreen.tsx`).
  Measured 2026-09-13 at 400px, the table reached x=441 and the page scrolled
  41px.

  The hash column prints a machine value in the written face. Most of
  the screen's text skips the studio catalog. That covers the heading, the
  back link, the column headers and the three commands under the table. It
  also covers Export and the loading, empty and no-difference lines. Risk
  (Medium): the page scrolls sideways, and a UI-string override cannot reach
  those strings.
- **CHANGES-4: no studio waiting line reaches a screen reader.** Each one is a
  plain paragraph with no live region. The Changes tab's line sits at
  `panels/ChangesView.tsx:146`, and the Versions screen's two at
  `screens/VersionsScreen.tsx:277` and `:358`. The process surface, the
  Processes screen, the Tools screen and the migration plan screen draw
  theirs the same way. Risk (Low): a screen reader hears nothing while a
  body loads (WCAG 4.1.3).
- **CHANGES-5: the header bar's open `⋮` menu panel loses hit points to
  tab-body content.** Its panel sets `zIndex: 1`
  (`panels/ProcessHeaderBar.tsx:199`). The review measured this
  2026-09-13, identical with and without `visually-hidden-text-page-bounds`:
  at 1280x720 on the Field matrix tab, an `elementFromPoint` sweep lost 15
  of 36 hit points to the grid's sticky headers, which set `zIndex: 2` and
  `zIndex: 3` (`panels/FieldMatrixGrid.tsx:82`, `:97`). At 400x800 on the
  Canvas tab, the same sweep lost 5 of 30 hit points to the canvas toolbar,
  which sets `zIndex: 1` later in tree order (`canvas/CanvasView.tsx:84`).
  Neither element stood confirmed as the cause. Risk (Medium): a click
  meant for the open menu can land on tab-body content instead.
- **CHANGES-6: the participant Task screen scrolls sideways at 400px.** The
  `visually-hidden-text-page-bounds` audit met it on the app area's Task
  screen. Its claim row sets `display: "flex"` with no `flexWrap`
  (`packages/web/src/areas/app/screens/TaskScreen.tsx:113`,
  `styles.taskActions`). A claimed step fills that row with Release, the
  delegate input, Delegate to, Save and Discard case.

  Measured 2026-09-13 at 400x800 on `purchase_requisition`'s Finance Review,
  Save ended at x=463 and Discard case at x=554. The page scrolled 154px
  sideways. Risk (Medium): a participant on a phone scrolls sideways to reach
  Save and Discard case.

## Open from the field-matrix-fill-height browser check (one OpenSpec change per screen)

The browser check for `field-matrix-fill-height` found two pre-existing
defects. That check is task group 3 in the change's archived `tasks.md`, and
`docs/browser-checks.md` keeps its steps. Neither defect is caused or worsened
by that change. The MATRIX tags are local to this section.

- **MATRIX-1: a short window traps the wheel below the tab body's end.**
  Measured 2026-09-13 at 1440x600, with the tab body scrolled to its end at
  scrollTop 156. Four wheel-ups over the grid's centre left the tab body at
  scrollTop 156. The grid's `overscroll-behavior: contain` stops the chain
  there, and no tab body area is left to wheel on. Shift+Tab still reaches
  the toolbar.
  - Not caused by `field-matrix-fill-height`. The old 32rem cap already
    trapped the tab body below a 753.5px window. The 24rem floor lowers
    that threshold to about 625.5px, narrowing the trap window instead of
    widening it.
  - A grid shorter than the floor has left blank tab body under its frame
    since `field-matrix-short-grid-frame`. A wheel there scrolls the tab
    body. On 2026-09-13, `laptop_inventory` at 1440x600 had the tab body at
    scrollTop 156. One wheel-up of 300 below its frame took scrollTop to 0,
    and three more held it there. A grid of 24rem or more still traps the
    wheel: `it_offboarding` held scrollTop 156 through four wheel-ups.
  - The same run used headed Chrome with classic 15px scrollbars. The tab
    body's own scrollbar stays a wheel and drag target there. On
    `it_offboarding` at 1440x600, two wheel-ups of 60 over it took scrollTop
    from 156 to 96, then 36. An 80px drag of its thumb took scrollTop from
    156 to 29.
  - A grid under 384px that also overflows sideways stays unmeasured, since
    `overscroll-behavior: contain` covers both axes.
  - Risk (Low): a keyboard user recovers with Shift+Tab. A mouse-only user
    under a 626px window needs the tab body's own scrollbar instead.
  - Fix: its own `/impeccable adapt` change.
- **MATRIX-2: the sticky field header column lets cell content show
  through on a sideways scroll.** Measured 2026-09-13 at 1280x900,
  scrollLeft 87. Letters of the first step header show at the corner's
  right edge. A first-cell checkbox paints over the `access_exc...` row
  header.
  - Not caused by this change. The row header computes `z-index: auto`
    against the corner's `zIndex: 3`. This change touched no width or
    stacking rule.
  - Risk (Low): a sideways scroll briefly shows a cell's content through a
    sticky header.

## Open from the 2026-09-13 Forms tab audits (one OpenSpec change per screen)

The change `forms-tab-form-strip` (PR #109) ran a final code review, a browser
check, `/impeccable critique` and `/impeccable audit` on the Studio Forms tab
on 2026-09-13. The browser check ran on the IT Offboarding draft at 1100x876.
Every item below sits outside that change, and this section records it in
place of a fix. The `FORMS-n` tags are local to this section; paths under
`panels/` and `screens/` start at `packages/web/src/areas/studio/`.

The owner answered three questions on 2026-09-13, on a mockup built from
IT Offboarding's real rows (`forms-tab-card-clarity`). Each card's open
control now carries `aria-labelledby`, joining its own id to the card's
heading's. Its accessible name therefore states the step. An empty card's
foot holds the control alone, and "No fields yet" stands once, in the
miniature's place. The card's count now excludes a group entry, stating
only the marks the miniature draws. The required count stands beside it.

- **FORMS-18: at 200% zoom the grid shows less than one card.** A 1100x876
  window at 200% zoom lays out at 550x438 CSS px. Measured 2026-09-13 at that
  size, the tab body stood 118px tall and the grid 94px. The header bar takes
  three rows above it, and the legend keeps 24px. Risk (Low): a reader with
  low vision scrolls a box shorter than one card. The fix belongs to the fixed
  frame every tab of the process surface shares.
- **FORMS-19: ten buttons lose their `.btn` classes.** Each one sets a literal
  `className` and then spreads `stylex.props`, whose own `className` replaces
  it. Measured 2026-09-14, "← Back to processes" computes three compiled
  classes and no `btn`. Its ground reads `rgb(240, 240, 240)` in light and
  `rgb(107, 107, 107)` in dark, the browser's own button face. The form
  editor's pressed column option loses its box and weight the same way.
  - The sites are `screens/EditScreen.tsx:963`, `:1220` and `:1236`, and
    `screens/FormEditorScreen.tsx:1332`, `:1402` and `:1418-1419`. The rest sit at
    `screens/VersionsScreen.tsx:263`, `screens/ToolsScreen.tsx:199`,
    `screens/PlayerScreen.tsx:349` and `screens/MigrationPlanScreen.tsx:281`.
  - Risk (Medium): the back link draws a gray box on every dark studio
    screen. The unpressed column option looks pressed. The fix joins the
    literal classes into the spread, as the strip's `ghost` helper does.
- **FORMS-20: at 400px the form editor squeezes its canvas to 118px.** The
  field list keeps its column beside the canvas
  (`screens/FormEditorScreen.tsx`). Measured 2026-09-24 at 400x800 on
  "Submit the Exit Notification": the canvas pane scrolls 70px sideways. The
  form tab strip inside it stands 86px wide and shows about one tab. Risk (Medium): an author on a narrow window edits a form through a
  slot 118px wide.
- **FORMS-21: the form tab strip's open-tab mark sits clear of its own
  divider.** `FormTabStrip.tsx`'s `tabSelected` draws an inset shadow, `inset
  0 -2px 0` in the accent (`:80-83`). The strip's own `row` pads its block
  axis by `focus.reach`, 4px (`:36`, `studio-focus-ring-clipping`), so the
  mark sits 4px clear of the row's 2px bottom divider (`:41-43`) rather than
  flush on it. `studio-focus-ring-clipping` moved the process tab row's own
  open-tab mark to a `::after` bar flush on its divider (`ROW-1`), so the
  studio's two tab strips now draw the open-tab mark two different ways.
  This is a code reading; no browser run has confirmed it. Risk (Low): an
  author sees one selection mark on the tab row and a different one on the
  form tab strip below it.

## Open from the authoring-command-ink-advisory-role review (one OpenSpec change per screen)

The change `authoring-command-ink-advisory-role` ran its review on 2026-09-13,
and this section records what that review found outside the change. The TONE
tags are local to this section. Paths under `panels/` and `screens/` start at
`packages/web/src/areas/studio/`.

- **TONE-1: the missing-translation message takes two looks.** The step page
  draws `missingTranslationWarning` beside a 2px refusal rule, its `warning`
  block (`panels/StepPage.tsx:149`). Three other sites draw the same message
  beside the 3px advisory rule. Those are the header bar's `warning` block
  (`panels/ProcessHeaderBar.tsx:63`) and the field catalog's `studioWarning`
  (`panels/FieldCatalogPanel.tsx:334`). The form editor's `studioWarning`
  (`screens/FormEditorScreen.tsx:122`) is the third.
  - Two more 3px rules mix refusal at 55%. The checks rail draws one in
    `checksGroupHeldBack` (`panels/ChecksRail.tsx:52`). The timers panel draws
    the other in `refusal` (`panels/TimersPanel.tsx:56`).
  - Risk (Low): an author meets one message in two tones on one process
    surface, so the tone stops telling a warning from a refusal.
- **TONE-2: the advisory role sits close to two neighbours.** The change's
  critique measured it on 2026-09-14, on the Fields tab with `de` added.
  - In light, a field's callout rule (`#e25a40`) reads 1.39:1 against the
    entity rail's current mark (`#d42b11`). Their OKLab distance is 0.082.
    At 400px the header bar's callout rule and that mark share one left edge.
  - In dark, the advisory, refusal and accent on muted roles all resolve to
    `#ff9783`. A callout's rule and its refusal text then read 1.00:1. The
    empty form card's box matches the required mark's fill.
  - Risk (Low): the advisory tone reads as the accent in light and as refusal
    in dark. Shape, place and the callout's own sentence still tell the marks
    apart.

## Open from the studio-narrow-widths review (one OpenSpec change per screen)

The first review of `studio-narrow-widths` measured the shell header on a
replica in Chrome 152, on 2026-09-13. That change wraps the header and keeps
each area nav's buttons on one line. Its browser check, critique and audit
ran on 2026-09-14. The NAV, ROW and BAR tags are local to this section.
Paths under `panels/` and `screens/` start at `packages/web/src/areas/studio/`.

- **NAV-1: an area nav wider than its line still overflows the header.** The
  shared `nav` style never wraps its buttons
  (`packages/web/src/shell/navStyles.ts:13`).
  - On the replica, the English admin nav overflowed below about 900px. At
    600px the admin header overflowed by 297px, down from 610px before that
    change.
  - On the replica at 400px, the English app nav overflowed its own line by
    22px, as it did before. German labels widen both navs.
  - The browser check measured the real headers in 5px steps. The English
    admin nav overflowed from 895px, and the German one from 1090px. The
    reporting nav overflowed from 505px in English and 540px in German. The
    German app nav overflowed from 475px, and the English one fit at 400px.
  - A wrap of the nav's buttons restyles the app, admin and reporting
    headers. The owner picks its look on a mockup first.
  - Risk (Low): an actor in a narrow window scrolls the page sideways to
    reach a nav button.
- **ROW-1 (resolved by `studio-focus-ring-clipping`): the tab row clips a
  tab's focus ring at its top and bottom.** The
  row scrolls sideways (`panels/ProcessTabRow.tsx:44`), so it clips outside
  its padding box. Measured at 400px, the Forms tab's ring ran from y=288 to
  335.5. The row's padding box ran from 292 to 332. Both sides of the ring
  stay, 32px clear of the edge fade. This is CHANGES-2 on the tab row. Risk
  (Low): the ring still meets WCAG 2.4.7.
- **BAR-1: the process name input takes its placeholder as its name.** The
  input has no label (`panels/ProcessHeaderBar.tsx:794-796`). Its accessible name
  read "(untitled process)" while it held IT Offboarding. Risk (Medium): a
  screen reader announces an untitled process on every draft (WCAG 4.1.2).

## Open from test-instance-claim-bypass (needs its own OpenSpec change)

The design review for `test-instance-claim-bypass` (2026-09-14) surfaced one
gap outside that change's own scope. The CLAIM tag is local to this section.

- **CLAIM-1: a candidate can claim a test instance it cannot open.** The
  function `loadInstanceForActor` (`src/runtime/internal.ts`) refuses a
  non-administrative candidate who did not start a test instance. The
  function `claimStep` (`src/engine/transition.ts`) admits any eligible
  candidate regardless. Both `authorization` and `instance-visibility-set`
  state that the engine never hands an actor a task it cannot open. This gap
  predates `test-instance-claim-bypass`, which neither widens nor closes it.
  One direction refuses such a claim; the other admits such a read.
  A delegate carries the same gap. `delegateClaim` never checks the
  target's candidacy. `loadInstanceForActor` admits that target only as the
  test instance's own starter or a `system:admin` holder.

  Since `close-instance-reads-on-write-paths`, a candidate who claimed such an
  instance and lost a double submission gets the opaque 403. A participant in
  the same race gets 409 `instance-not-running`. The reader rule asks
  `loadInstanceForActor`, which refuses that candidate.

## Open from close-instance-reads-on-write-paths (needs its own OpenSpec change)

The design for `close-instance-reads-on-write-paths` (2026-10-11) left three
gaps outside that change's own scope. The tags WRITE and SUBMIT are local to
this section.

- **WRITE-1: the write routes still answer a caller who may not read with the
  instance's existence.** Claim, release and delegate answer 409
  `instance-not-running` for a finished instance. They answer 403
  `authorization` for an unknown instance id to a caller without `system:admin`,
  as the next paragraphs state. On a
  running instance, claim answers the typed 403
  `not-assigned`, `not-a-candidate` or `already-claimed`. Release and delegate
  answer `not-claimant`. Submit and form-draft save answer `not-claimed` or
  `not-claimant`.

  Each of those 403 types separates a running instance from a finished one.
  Claim, release and delegate check status before authority. The `runtime-api`
  requirement "An operation targeting a non-running instance is rejected at
  the boundary" sets that order. The owner ruled on 2026-10-11 to keep it.

  The task screen and the studio Player both read `not-claimed` and
  `not-claimant`. Closing those two types needs a web change in the app area
  and the studio area.

  The change `harden-http-error-surface` (audit finding C-17) shipped the
  answer for an unknown id. A caller without `system:admin` gets the opaque 403
  `authorization`, never a 404. That matches the answer submit, form-draft save
  and the visibility routes give an unknown id. A `system:admin` holder gets
  the `NotFoundError` answer. The typed refusals above still tell a caller that
  an instance exists, and WRITE-1 keeps that gap open.

  One difference stays by design. On a running instance, a revoked starter's
  cancel or assignment-less submit succeeds. The same call on a finished
  instance answers 403. The pair of answers tells the caller whether the
  instance runs. It never tells the caller the status.

  A revoked starter's refused cancel carries one of two texts. The text says
  "may not read" when the instance has finished. It says "may not cancel" when
  the running step is not cancellable. The refusal text therefore separates
  those two cases.
- **WRITE-2: a terminal step's leftover assignment still counts as live.** The
  function `liveAssignmentFragment` (`src/runtime/queries.ts`) and the function
  `loadInstanceForActor` (`src/runtime/internal.ts`) do not check the instance
  status. The function `toWriteResult` filters on a running instance, because a
  completed instance can keep an assignment. A revoked starter who is a
  candidate in a completed instance's leftover assignment therefore keeps the
  started-scope row and the record read.

  This predates `close-instance-reads-on-write-paths`. The direct read and
  `scope=visible` behave the same. That change spreads the behavior to the
  started scope and the record read. It makes no fix.
- **SUBMIT-1: the submit route's body goes to a writer who may not read.** The
  route `POST /instances/:id/submit` answers the full `Instance`. On
  2026-10-11 the owner ruled that body out of scope for
  `close-instance-reads-on-write-paths`. No follow-up change is planned yet.

## Open from type-data-comparison-literals (needs its own OpenSpec change)

The final review of `type-data-comparison-literals` (2026-10-12) found two gaps
that come from how two owner rulings meet. The tags LITERAL-1 and LITERAL-2
are local to this section.

- **LITERAL-1: the form writes a literal that publish rejects for a field with
  a format.** `TargetRef` carries the declared `type` and no `format`.
  `literalType` reads `type` alone, but `typeMatches` also checks the format.
  The studio form therefore writes `1.5` on an `integer` field. It writes free
  text on a `date`, `datetime`, `email` or `person` field. Publish rejects each
  with a located message that names the declared type, so the author meets the
  error at publish and not in the row. A later change could carry `format`
  into `TargetRef` and check it in the row. The report builder has no publish
  gate, by owner ruling. A format mismatch there matches nothing and reports
  nothing.

- **LITERAL-2: the form and the publish check read different versions.** The
  form takes the type from the newest published version that declares the
  field. Publish accepts a literal when any target version that holds a
  running instance admits it. Take a field declared `string` in version 1,
  which has running instances, and `number` in version 2, which has none yet.
  The form shows a number input and writes `5`. Publish rejects `5` with
  `(declared: string)`. The form cannot write `"5"`, so the author uses the
  JSON surface. Each half follows its own spec. A real fix needs an OpenSpec
  change that decides which version set the form reads.

- **LITERAL-3: the studio data source editor scrolls sideways at 390 px.** The
  browser check of the same change measured an inner `overflow-x: auto` box
  with a content width of 494 px against a client width of 358 px. The widest
  leaf is the target process select, whose options read
  `key (proc_<uuid>)`. `main` has the same option text, so the overflow
  predates the change. The rows the change added wrap at 494 px, not at the
  viewport, so a reason sentence and the comma hint sit off screen until the
  author scrolls the box. Capping the select and zeroing the fieldset
  `min-inline-size` in the live DOM did not narrow it, so the cause sits higher
  in the editor's layout. The fix belongs to a screen change under
  `studio-app`, with `/impeccable adapt`.

## Open from harden-studio-json-surface (needs its own OpenSpec change)

The final review and the browser check of `harden-studio-json-surface`
(2026-10-12) found three gaps that the change leaves open on purpose. The tags
LEAF-1, LOAD-1 and REFUSE-1 are local to this section.

- **LEAF-1: the guard checks containers only.** An object where a string
  belongs passes Apply and unmounts the studio on render. Take a
  `contract.outcomes` element that holds an object. `ContractPanel` renders it
  in `<span>{o}</span>`, and React throws. A `fields[].key` and a
  `LocalizedText` value that hold an object fail the same way. The `Shape`
  table skips the elements of a `"strings"` list and checks no leaf. A later
  change could add a checked-string kind and a union/leaf kind to `Shape`,
  then add rows. Anchors: the `Shape` table and its `ponytail:` comment in
  `packages/web/src/areas/studio/draft/load-guard.ts`,
  `packages/web/src/areas/studio/panels/ContractPanel.tsx`,
  `packages/web/src/areas/studio/draft/localized-text.ts`.

- **LOAD-1: three paths load a body with no guard, and the server stores one
  unchecked.** The guard runs only at Apply in the JSON surface. The reload in
  `useDraftToolbarActions` (`panels/DraftToolbar.tsx`) calls `replace` with the
  fetched body. The initial load in `EditScreen` (`screens/EditScreen.tsx`)
  reads `getDraft` and hands the record to the store. The stash restore in the
  same file, `restoreStash`, calls `replace` with the stored body. On the
  server, `saveDraft` (`src/engine/drafts.ts`) checks the envelope and keeps
  the body unparsed. A draft saved over HTTP with `"steps": {}` therefore
  crashes the studio when an author opens it. A later change could run
  `checkDraftShape` on each of the three paths and show the refusal in place of
  the crash. Whether the server should refuse such a body is a separate call.

- **REFUSE-1: the refusal reads poorly in the JSON surface.** The impeccable
  critique and audit ran on the production build. The error `<p>` in
  `panels/JsonView.tsx` sits below a 24-row textarea and the Apply row. At 1280
  by 720 its top is 14 pixels inside the viewport, and at 375 by 667 none of it
  shows. Apply looks like a no-op, and focus stays on Apply. The `<p>` has no
  `role="alert"` and the textarea has no `aria-invalid` or `aria-describedby`,
  so a screen reader hears nothing. `MigrationSpecEditor` sets both attributes,
  and `MigrationPlanScreen` uses `role="alert"`. A path longer than the box
  does not wrap at 320 pixels. Each line prints its path twice, as in
  `workflow.steps: 'workflow.steps' must be an array if present`. `DESIGN.md`
  asks for a mono list at 12 pixels, which needs `parseDraftText` to return an
  array. A stale error also stays after an edit. One change per screen should
  take these together. The owner ruled that this change makes no layout change.

## Open from fix-condition-and-path-builders (needs its own OpenSpec change)

The final review of `fix-condition-and-path-builders` (2026-10-12) found one
gap that the change leaves open. The tag HOLD-1 is local to this section.

- **HOLD-1: an unfinished row in a condition of several rows writes a weaker
  condition.** Take a stored guard `A && B`, and let the author pick another
  operand for row A. `toCel` leaves the unfinished row out and writes `B` at
  once. The saved guard now admits more cases and can reroute an automatic
  path. The spec text "leave that row out" allows this, so the change kept
  it. A later change could hold the whole condition while any row is
  incomplete. Anchors: `commitDecision` and
  `toCel` in `packages/web/src/areas/studio/panels/shared/conditionLogic.ts`.

## Open from fix-form-ui-empty-values (needs its own OpenSpec change)

The final review of `fix-form-ui-empty-values` surfaced one gap outside that
change's scope. The CLAIMVIEW tag is local to this section.

- **CLAIMVIEW-1: a viewer who cannot claim sees inputs that accept typing.**
  A viewer who is no candidate, or whose step another actor claimed, sees
  editable inputs. The Task screen shows neither Save nor a path button.
  `formIsReadonly` ignores claim state on purpose. The `end-user-app` spec
  makes field editability independent of claim state, and finding F-8 kept
  that rule. Covering the case needs a spec change and a third note cause.

## Open from cut-studio-render-cost (needs its own OpenSpec change)

The change cut the Fields-tab keystroke from 17.0 to 19.5 ms down to 6.6 to
9.3 ms. The owner's budget was 4 ms, and it is unmet. The RENDER tag is local
to this section.

- **RENDER-1: validation runs synchronously on every keystroke.** It costs
  about 3.4 ms of the sync commit, in `DraftProvider`'s `useMemo`. The budget
  cannot hold while that stays. Deferring it with `useDeferredValue` lets the
  check results, the Checks badge and the publish gate read a draft one render
  old. A change needs a `studio-app` delta and a test that Publish never reads
  stale results.
- **RENDER-2: two more bodies could take the same hold.** `ContractPanel`
  takes no props and `PathsView` takes `draft` as a prop. Neither has a
  measured cost. Profile them before adding the hold.
- **RENDER-3: the new load paths read thin.** The Arrange failure banner says
  "Something went wrong" and offers no retry. Arrange shows nothing while its
  library loads. The loading line has no `role="status"`, names no screen, and
  the form editor's loading line sits 16 px left of the editor. All five are polish
  from the `/impeccable audit`, and none loses work.

## Open from studio-fresh-draft-starts-clean (needs its own OpenSpec change)

The change's final review parked three findings. The START tag is local to
this section.

- **START-1: the name input is not tied to the name sentence.** The input has
  no `aria-describedby` and no `aria-invalid`. Its accessible name is its
  placeholder. Change 12 maps each message to its subject, so it should bind
  each message to its input.
- **START-2: an unavailable Publish shows a dim focus ring.** The shared
  `.btn` rule sets 0.45 opacity on `aria-disabled`, so the ring drops to about
  2:1 contrast. Every fresh draft now shows it. The fix belongs in the shared
  `.btn` rule.
- **START-3: the name sentence names no locale.** It misleads when
  `baseLocale` is not `en`. An author who typed an English name still reads
  "The process needs a name". Change 12's message map should carry the locale.

## Open from studio-six-tabs (needs its own OpenSpec change)

- **Live specs still name the retired tabs.** The sync of `studio-six-tabs`
  rewrites only the requirements its delta names. The others still say
  "Canvas tab", "Field matrix tab" or "Paths tab". The line numbers below
  hold before that sync, and the sync shifts them. A spec sweep wants its own
  OpenSpec change.
  - In `openspec/specs/studio-app/spec.md`, five field matrix requirements
    say "Field matrix tab". They are the bulk toggles at `:2255` and the
    toolbar at `:2395`. The legend stands at `:2464` and `:2483`, and the
    empty result at `:4266`. The height stands at `:4338`, `:4353`,
    `:4358`, `:4365` and `:4371`.
  - In the same spec, the form editor's load requirement says "Canvas tab"
    at `:4965`.
  - In `openspec/specs/studio-canvas/spec.md`, "Canvas tab" stands at
    `:1115`, `:1146`, `:1154`, `:1161`, `:1172`, `:1179` and `:1190`. It
    also stands at `:1201`, `:1204`, `:1206`, `:1218`, `:1227`, `:1233` and
    `:1237`. The last seven sites are `:1276`, `:1357`, `:1436`, `:1623`,
    `:3055`, `:3066` and `:3160`.
  - In the same spec, "Paths tab" stands at `:273`, `:1623` and `:3030`.

- **The Settings tab's inherited bodies still speak the engine's words.** The
  `/impeccable critique` of `studio-six-tabs` (2026-10-31) found the sub-row
  in the author's words and three bodies under it in the engine's. Where
  values come from opens on the heading "Data sources", a mono key, a plugin
  row with labels beside the controls, and a "Settings (JSON)" text area.
  What it takes in and gives back opens on "Contract", then `inputFields`
  and `outputFields` as a wall of checkboxes. Access asks for `user_xxx or
  group_xxx`. Change 11 (`studio-field-card`) moves the sources into the
  Fields sub-row. No change in stage 64 owns the contract editor or the
  access lists. The critique's sketch: one checkbox sentence "Another
  process can call this one", two fieldsets in the entity-rail row style,
  outcomes as ruled rows; a picker over users and groups by display name.
- **The add-locale input has no label.** `panels/shared/ContentLocaleSwitcher.tsx`
  gives it a placeholder alone, "add locale (e.g. de)". `studio-six-tabs`
  moved it onto the Settings tab's Process view without changing it. The
  `/impeccable audit` of 2026-10-31 rates it P2. The critique proposes one
  "Languages" fieldset: "Written first in" as a select of language names,
  the added languages as ruled rows, "Add a language" as a labelled select.
- **Forced colors drop the open mark on every tab strip.** Under
  `forced-colors: active` the sub-row's inset `box-shadow` and the tab
  row's `::after` bar both vanish, and weight 800 stays the only cue. The
  audit of 2026-10-31 counts eight sites with the same technique. A fix
  draws the mark with a border or an outline, which forced colors keep.
- **"Show on the canvas" names the Map tab's surface.** The field catalog's
  "Used in" rows read "Show on the canvas" (`fieldCatalog.showOnCanvas`),
  and the spec names the control by that string. The tab reads Map since
  `studio-six-tabs`. Change 5 (`studio-map-labels`) owns the Map's words
  and takes the rename, with the spec sentence in `studio-app`. The matrix
  row headers still print keys alone beside the Catalog's labels; change 11
  owns the matrix's words.

## Open from studio-condition-sentence (needs its own OpenSpec change)

The change made the condition builder read as a sentence. It left eleven
points to later changes. Its critique and audit of 2026-10-31 raised the
last six. The SENTENCE tag is local to this section.

- **SENTENCE-1: the rule builder keeps its CEL readout and toggle.**
  `panels/shared/RuleInput.tsx` still prints its "Writes" line and its CEL
  toggle. The Fields tab then holds two builders that read differently.
  Change 11 owns the rule builder and brings it to the sentence.
- **SENTENCE-2: a list clause is not good grammar.** It reads "The person's
  roles contains “manager”". The clause cannot know whether a label is
  plural. Change 16 revisits the phrasing of list clauses.
- **SENTENCE-3: the canvas edge label keeps a raw fragment's CEL text.** The
  form preview's path note does the same. Both read the shared clause keys
  for every other row. Change 5 owns the canvas and decides their wording.
- **SENTENCE-4: the rule builder's other-field picker shows labels alone.**
  The shared `fieldOperand` drops the key, and it adds none of the condition
  picker's duplicate numbering. Two fields with one label then read the same
  there. Change 11 can number them, or show the field card's names.
- **SENTENCE-5: a boolean `!=` row reads "Approved is not yes".** The `ne`
  clause takes the value word "yes" or "no" from the value select. The phrase
  is stiff but exact. A later wording pass can give booleans their own pair
  of clauses.
- **SENTENCE-6: the divergent "Only ask this when" names no condition.**
  When the steps disagree, the zone names the steps and nothing else. The
  Developer view's CEL box stands empty. An author who builds a row then
  replaces conditions they cannot read. Change 11's field card can list
  each step's condition as a sentence.
- **SENTENCE-7: a row wraps at 1440px.** The field select sizes to its
  longest label, so the value drops to a second line in the two-column step
  page. The joiner also indents every row after the first. Change 10's
  single column gives the row its width back.
- **SENTENCE-8: the unparseable notice does not name the fault.** It says
  the condition cannot show as rows and points to the Developer view. The
  parse message itself never shows, and "+ Add row" goes with the rows.
- **SENTENCE-9: the joiner explains itself in a tooltip alone.** Its flip
  changes every row at once, and a screen reader hears only "and" or "or".
  Each row's controls take the names "field", "operator" and "value", the
  same in every row. The status notice mounts with its text already in
  place, so a screen reader may skip it.
- **SENTENCE-10: "+ Add row" keeps the focus after the press.** The new
  row's field select would be the next thing an author sets.
- **SENTENCE-11: the Ways out hint repeats the empty sentence.** "Leave it
  empty to always offer this way out" stands above "No condition yet: this
  always matches." One of the two can go.

## Open from studio-form-editor-names-fields (needs its own OpenSpec change)

The change named fields on the form editor's cards and stood the editor under
the tab row. It left seven points to later changes. The NAMES tag is local to
this section.

- **NAMES-1: the Forms tab's legend says "Section" and the palette says
  "Group".** The form editor's palette names the kind "Group", as the Fields
  tab does. The Forms tab's legend still reads "Section" for the same group
  break. Change 11 owns the wording across the Fields tab and can settle which
  word wins.
- **NAMES-2: an unnamed card offers no selection beside its input.** A card
  with an empty label keeps its name input and offers no strip. The input says
  what to do, and the Fields tab still edits the field. Change 11's field card
  may answer whether such a card can take a selection.
- **NAMES-4: a minted key can stay its kind's name.** The key lock counts a
  base version that has not loaded as published, and a failed fetch never
  loads. On such a process, naming a new field "Amount" keeps the key
  `number`. The Fields tab's own add mints an empty key and still derives one.
- **NAMES-5: naming in a non-base content locale leaves the base label.** A
  name typed in German lands in `de` alone. The base-locale label keeps the
  kind's name, so an English participant reads "Date". No translation warning
  fires, since the base entry has text.
- **NAMES-6: three screens still lose their `.btn` look.** Tools, Player and
  Versions write a literal `.btn` class beside `stylex.props`. The compiled
  class replaces it, so their back controls differ from the process surface's.
- **NAMES-7: "Put this field on a step" leaves the editor onto Steps.** The
  form editor opens on the Steps tab, and leaving it lands on the step page.
  The author reaches the Fields tab's open field again only by hand.
- **NAMES-8: browser Back out of the form editor drops the focus.** The
  breadcrumb and a tab press move the focus. The browser's own Back moves
  none, so the focus falls to the page body. The archived NAMES-3 fix covers
  only the first two exits.

## Open from studio-selects-show-labels (needs its own OpenSpec change)

The change made the step page's selects print labels and made derived keys
transliterate umlauts. It left six points to later changes. The SELECTS tag is
local to this section.

- **SELECTS-1: the steps rail still falls back to a step key.** An unnamed
  step reads its key in the rail. The step selects read "(unnamed step)".
  Change 10 (`studio-step-accordion`) owns the rail.
- **SELECTS-2: the Previous and Next labels still fall back to a step key.**
  The step page foot prints the key of an unnamed neighbor. The Checks
  narrowing label does the same. Both live in `EditScreen.tsx`. Change 10 owns
  the page foot. Change 12 (`studio-checks-by-subject`) owns the Checks label.
- **SELECTS-3: the Fields tab's data source select prints `ds.key ?? ds.id`.**
  The select shows a key where the step selects show a label. Change 11 owns
  the Sources view and can settle the wording.
- **SELECTS-4: the canvas node's accessible name carries the step key.** A
  screen reader hears the key and not the label. Change 5 owns the canvas
  words.
- **SELECTS-5: the migration plan form keeps its key and label choices.** No
  change is planned. A migration maps instance data by key, so its spec asks
  for both.
- **SELECTS-6: a key derived before this change stops following its label.**
  A draft keyed `pr_fung` no longer counts as derived. A rename of "Prüfung"
  leaves that key alone. The change accepts this, since nothing is deployed.

## Refused simplifications (kept so the next sweep does not re-propose them)

Each entry below names a cut somebody proposed, the reason a reviewer refused
it, and the measurement or citation that refused it. The record exists so the
next over-engineering sweep does not price the same cut twice. It came out of
the ponytail audits of 2026-07-26 through 2026-08-18. Every path was re-checked
against the tree on 2026-09-10. A line number appears only where no symbol
identifies the site: gate script lines, test assertions and spec lines. A dated
count is history and stays as measured.

Entries 1 to 9 come from the 2026-08-16 survey. Entries 10 to 45 are the
deliberate refusals, all of them. Entries 46 to 50 come from the library
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
12. **Finding 22, `Intl.NumberFormat` for `formatDuration`.** Rejected
    2026-08-16. The test file
    `packages/web/test/reporting-reportingLogic.test.ts:90-110` pins 13
    strings across `en` and `de`, among them `"4.5 s"` and `"5,5 Std"`. The
    formatter renders `"4.5 sec"` and `"5,5 Std."` instead.
    [`packages/web/src/areas/reporting/screens/reportingLogic.ts`,
    `formatDuration`]
13. **`Intl.RelativeTimeFormat` for `waitingLabel`.** Rejected 2026-08-05, after
    surviving five scans as a finding. Four tests in
    `packages/web/test/inboxLogic.test.ts` pin `"5m"`, `"3h"`, `"2d"` and
    `"just now"`. Narrow style renders `"5 min. ago"`, and no style renders
    `"5m"`. Re-file it as a design change, never as a standard-library swap.
    [`packages/web/src/areas/app/screens/inboxLogic.ts`, `waitingLabel`]
14. **A shared changed-file collector for `prose.sh` and `whitespace.sh`.**
    Rejected 2026-08-05. Only `prose.sh` runs `git diff --name-status -M`, and
    it does so to read a renamed file's baseline at its old path.
    [`scripts/gates/prose.sh:90`, `scripts/gates/whitespace.sh:55`]
15. **Delete the unused registry seams.** Rejected. That set is
    `devHeaderResolver`, the action `Registry`, the `DataSourceRegistry`, the
    `AssignmentRegistry`'s multi-strategy handlers, `exampleRegistry.ts` with
    `RegistryPanel.tsx`, and `Action.execution`'s reserved enum. The enum has
    since narrowed to `async` (`tighten-publish-contract-checks`). `CLAUDE.md`
    records the reserved enum and the dev-header seam as v1 boundaries, and
    the registries as the plugin seam. The two studio files have
    since left the tree on their own change, on 2026-08-18; the rest stand.
16. **Delete `Action.execution` specifically.** Rejected on a second ground. It
    sits inside `ProcessBody`, so removing it moves the `definitionHash` of
    every stored body carrying it. The field `definitionStatus` sits outside the
    body, so it does not.
17. **Replace the `migrateInstances` and `findOrphanKeys` keyset loop.**
    Declined 2026-07-26. [`src/engine/migration.ts`]
18. **Collapse `requireRole` and the role constants.** Rejected. The call sites
    ask about genuinely different roles. [`src/auth/authorize.ts`,
    `requireRole`]
19. **Reduce `checkAndRecordAttempt`'s parameters.** Rejected. Tests exercise
    each with different values. The signature read `(map, email, now)` when
    the cut was proposed; it has since grown a `maxAttempts` and a `capacity`
    parameter. [`src/auth/login.ts`, `checkAndRecordAttempt`]
20. **Collapse the two `ActorResolver` implementations.** Rejected. Both
    `src/auth/jwt.ts` and `src/auth/resolve.ts` are real implementations.
21. **Collapse the i18n catalogs into one.** Rejected. The JSON contract is
    multi-locale by construction, and the app area ships a real `de` in
    `packages/web/src/i18n/catalogs/app.ts`. Finding 20 cuts unused keys
    instead.
22. **Drop `optionText`'s `if (!attributes) return label` guard.** Rejected
    2026-08-16. The `attributes` parameter types as `Record<...> | undefined`,
    and `Object.values(undefined)` throws a `TypeError`. Only the guard's
    sibling was dead, the `parts.length === 0` branch, and that branch is cut.
    [`packages/form-ui/src/FieldForm.tsx`, `optionText`]
23. **Finding 39, merge `isGroup` and `isGroupField`.** Rejected 2026-08-16.
    Both bodies read `field.field.type === "group"`. The only module both call
    sites import at runtime is `types.ts`, which emits no JavaScript and
    reaches them through `import type`. Hosting the predicate there turns a
    type-only module into a runtime one, for three duplicated lines.
    [`packages/form-ui/src/FieldForm.tsx`, `isGroup`;
    `packages/form-ui/src/submit.ts`, `isGroupField`]
24. **Finding 9, delete `parseJsonb` as dead.** Rejected. A separate
    `parseJsonb` exports from `src/engine/host.ts`. `src/http/admin-routes.ts`
    names it on six lines, and `test/data-list-columns.test.ts` imports it. It
    returns `undefined` on a parse error, where the `src/engine/drafts.ts`
    export the `templates.ts` mapper shares lets that error throw.
25. **Finding 9, merge `toTemplate` and `toDraft`.** Rejected. The two map
    different columns. One question stays filed and unresolved: does `Bun.sql`
    ever hand back raw text on the `drafts` and `templates` columns? A negative
    answer kills the string guard and ten further inline sites.
    [`src/engine/templates.ts`, `toTemplate`; `src/engine/drafts.ts`,
    `toDraft`]
26. **Finding 26, a shared `requireAnyRole(actor, ...roles)`.** Rejected
    2026-08-16. The comment above `requireAuthoring` in
    `src/http/studio-routes.ts` rejects it and names one specific pair on
    purpose. `requireStudioRead`, in the same file, binds to the same rule by
    reference. The three helpers also raise three different messages, each
    naming its own role set. [`src/http/admin-routes.ts`,
    `requireDataListRead`]
27. **Finding 39, merge `requireNonBlank` and `requireString`.** Rejected
    2026-08-16. They differ three ways. `requireNonBlank` rejects
    `!value.trim()` and returns the untrimmed value, because trimming a password
    would store a secret the operator never typed. `requireString` rejects
    `raw.length === 0` and bounds the result at `MAX_KEY_LENGTH`. The messages
    differ too, `must not be empty` against `is required`. The input `"   "`
    passes `requireString` today and would fail a merged rule.
    [`src/http/admin-routes.ts`, `requireNonBlank` and `requireString`]
28. **Finding 54, inline `resolveBaseLocaleChange`.** Declined 2026-08-18. It
    exports on purpose: `studio-processHeaderLogic.test.ts` drives it as a pure
    function, and `ProcessHeaderBar` has no DOM test harness. The extraction is
    the only way to reach the base-locale sync regression it guards.
    [`packages/web/src/areas/studio/screens/processHeaderLogic.ts`]
29. **Finding 39, inline `resolveActor(req, resolver, db)`.** Rejected
    2026-08-16. Its body is one line, `resolver(req.headers, db)`. The command
    `git grep -o 'resolveActor(' -- src | wc -l` prints 22, the declaration
    among them. The archived change `2026-08-05-dedup-server-helpers` created
    the helper by collapsing four copies, and the doc comment above it says
    so. Inlining would reverse that change to save three lines.
    [`src/http/routes.ts`, `resolveActor`]
30. **Finding 39, inline `accountName.ts` into `Chrome.tsx`.** Rejected
    2026-08-16. The file is 15 lines with one call site, and it carries its own
    three-case test. Inlining moves the logic into a React component, so those
    three cases need a render to reach. The test then dies or grows a renderer.
    The change `2026-08-16-ponytail-cleanup-fetch-hooks-and-imports` declined
    finding 37 on this same ground. [`packages/web/src/shell/accountName.ts`]
31. **Finding 39, derive `onGoToArea` and `onGoToProfile` from the `go` prop.**
    Rejected 2026-08-16. Two derivations exist, not one. Each of the four area
    roots builds its own href as `/${a}`. The file `shell/App.tsx` passes
    `areaHref(a, "/")` at both of its `onGoToArea` sites, and `Chrome` serves
    both callers. [`packages/web/src/shell/App.tsx`]
32. **Finding 39, merge `listComments` and `listAttachments`.** Rejected
    2026-08-16. The two differ in path segment and in return type, a comment
    page against an attachment page. A merged function needs a type parameter
    and a segment argument, and would run longer than the pair it replaces.
    [`packages/web/src/areas/app/screens/TaskScreen.tsx`, the two `await`
    call sites]
33. **Finding 8, cut the 45-line comment above `armStepTimers`.** Rejected
    2026-08-16. The block states facts: totality, the CEL evaluation contract,
    and a magnitude bound from a real overflow analysis. None of it is process
    history, which is what the comment rule targets.
    [`src/engine/duration.ts`, the doc comment above `armStepTimers`]
34. **Finding 24, a generic `NamedError` base class.** Rejected 2026-08-16.
    Only `RequestShapeError` and `NotFoundError` are name-only.
    `InstanceNotRunningError` and `InstanceRunningError` each carry
    `instanceId` and `status` as readable state, and a caller distinguishes
    outcomes on it. A shared base would drop that state.
    [`src/errors.ts`, the four classes named]
35. **Finding 27, delete `BINARY_ROUTES`.** Rejected 2026-08-16. The
    requirement "`BINARY_ROUTES` declares every route that returns stored
    bytes" in `openspec/specs/http-wrapper/spec.md` names it. Its own comment
    says a person keeps the list in sync by hand, since no static walk of
    `routes` can derive it. Deleting it deletes a spec requirement written
    after a measured `/admin/*` route collision.
    [`src/http/server.ts`, `BINARY_ROUTES`]
36. **Finding 29, cut four thin delegates in `src/cel/eval.ts`.** Rejected
    2026-08-16 for two of the four. The function `buildTransformContext`
    re-keys the context against the source catalog rather than delegating. The
    comment on `buildOutputContext` explains why its namespace stays separate
    from the guard context. The other two, `evalTransforms` and `evalFieldMap`,
    are genuine delegates and stay a finding.
    [`src/cel/eval.ts`, the four functions named]
37. **Finding 34, dedupe the two pagination helper sets.** Rejected 2026-08-16
    as a whole. The comments above `MAX_LIST_LIMIT` in `src/runtime/internal.ts`
    and in `src/engine/admin-queries.ts` both call the duplication deliberate.
    The first reads "the numbers agree today by coincidence, not by contract."
    Only `Page<T>` is an unexplained duplicate, and it stays a possible future
    finding.
38. **Finding 35, `Map.groupBy` for `groupMs`.** Rejected 2026-08-16. It would
    replace nine lines, and it needs `tsconfig.json`'s `lib` raised from
    `ES2022` to `ES2024` repo-wide. That blast radius is disproportionate.
    [`src/engine/reporting.ts`, `groupMs`]
39. **Finding 40, drop `JwtResolverConfig.localRolesClaim`.** Rejected
    2026-08-16. A call at `test/auth-jwt.test.ts:121` passes
    `localRolesClaim: "groups"`. The `?? "roles"` fallback inside
    `jwtResolver` is a default rather than dead code. [`src/auth/jwt.ts`,
    `JwtResolverConfig.localRolesClaim`]
40. **Finding 41, drop ten `src/` exports whose only importer is a test.**
    Rejected 2026-08-16. A test importer is an importer, and `export` is how the
    test reaches the symbol. The ten are `singleTenantSource`,
    `parseExpression`, `projectInstance`, `managerOfStarterStrategyDef`, the
    pair `InvalidTenantKey` and `TenantKeyTaken`, `checkDbReady`,
    `clientAddressOf`, `parseAuthIssuers`, `MAX_OVERRIDE_VALUE_LENGTH` and
    `countUiStringOverrides`. Two symbols with no importer at all,
    `checkTemplateKey` and `SUPPORTED_LOCALES`, lost their `export` instead.
41. **Finding 14, a copy-pasted `tFill`.** Rejected 2026-08-16. Only
    `areas/admin/catalog.ts` declares `tFill`, and only
    `areas/reporting/catalog.ts` declares `tCount`. The bodies differ: `tFill`
    walks `Object.entries(values)` with `replaceAll`, and `tCount` runs one
    `replace` on `{n}`. Each has one declaration, so neither is duplication.
42. **Finding 17, four area clients declare `listProcesses`.** Rejected
    2026-08-16 as a dedup. Three of the four agree exactly. The reporting
    area's version reads a different route, `/reporting/processes`, and
    unwraps `{processes}` from the body. It stayed its own function.
    [`packages/web/src/areas/reporting/api/client.ts`]
43. **Finding 17, `getInstanceRecord` is byte-identical.** Not a refusal: a
    correction, kept because the claim recurs. The two bodies differed by one
    local name, `query` against `params`, so "byte-identical" did not hold.
    The merge still landed, in the archived change
    `2026-08-17-ponytail-web-client-catalog-dedup`.
44. **Finding 17, route three types through the engine's exports map.**
    Rejected 2026-08-16. `HistoryEntry` reaches `packages/web` through the
    `./schema` entry. Of the three types named, `VersionSummary` lives in
    `src/engine/definitions.ts` and `InstanceRecordElement` in
    `src/runtime/record.ts`, files that map does not publish, and
    `InstanceRecordPage` has no engine declaration at all. Widening the engine
    package's public surface is an engine decision, and a `packages/web`
    refactor does not get to make it. The three moved to
    `packages/web/src/api/types.ts` instead.
45. **Finding 13, the `useFail(onUnauthorized, setError, describe)` signature.**
    Rejected 2026-08-16. That shape misses `shell/ProfilePage.tsx`, whose two
    sites answer with `setLoadFailed(true)` and `setSaveFailed(true)`. The
    shipped shape is `useFail(onUnauthorized, onError)`, taking the failure
    handler itself. Further sites, `TaskScreen.tsx` and `PlayerScreen.tsx`
    among them, kept their own ladder and share only the `is401` predicate.
    [`packages/web/src/shell/useFail.ts`]
46. **Replace the SMTP client with nodemailer.** Rejected 2026-09-10.
    `nodemailer` 10.0.3 runs under Bun 1.3.11 and delivers to Mailpit. It
    still cannot serve here. Its connection sends `DATA` once any recipient
    is accepted, and reports the rest as rejected. No option turns that off.
    The spec forbids a partial delivery, because a transient retry would then
    send a second copy to every accepted address. That rule stays. The wire
    code stays with it. [`src/handlers/notification-email.ts`,
    `openspec/specs/notification-email-action-handler/spec.md`, "Every
    recipient is accepted before the message is sent"]
47. **Route through `Bun.serve({ routes })`.** Rejected 2026-09-10. The
    hand router is `seg`, `match` and one loop, about 25 lines. The rest of
    the dispatch stays under either router: the navigation check before the
    match, the tenant handle per request, the preflight derived from the
    table, and the binary exit. Bun's router derives no preflight. It also
    answers only through a listening server, so the 16 suites that call
    `createServer` with a bare `Request` would each need a port.
    [`src/http/server.ts`]
48. **Parse CLI arguments with `node:util.parseArgs`.** Rejected 2026-09-10.
    Both CLIs take positionals only, and `parseArgs` hands the same array
    back under `positionals`. The four scripts read one `process.argv` entry
    each. Nothing shrinks. [`src/auth/cli.ts`, `src/tenancy/cli.ts`]
49. **Format durations with `Intl.DurationFormat`.** Rejected 2026-09-10.
    The formatter renders every non-zero field. It cannot print `5.5 h`, and
    German comes out as `Std.`, against the catalog's `Std`. The largest-unit
    selection stays hand-written either way. [`formatDuration`,
    `packages/web/src/areas/reporting/screens/reportingLogic.ts`]
50. **Move the web area's fetching onto TanStack Query.** Deferred
    2026-09-10, undecided. The tree holds 88 `useEffect` fetches and 49
    loading flags across the four areas. A query cache would earn its place
    only through invalidation after a mutation. That is the stale-UI defect
    class the browser check exists for. Revisit when that class recurs.
    Until then the hand-written clients stay.
