# Roadmap

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: this file names four distinct audiences the product serves:
     participant (end user), operator, developer, process owner. They are four
     different people, not one concept under rotating names, so the rule reports
     a false positive on every stage that contrasts them. No other rule is
     silenced here. -->

Stage-by-stage status. Open stages stand here in full. A finished stage keeps
one row in the table below, and `docs/roadmap-history.md` holds what it was,
under the same number.

A row names the OpenSpec change that built the stage and the capability spec
that carries its rules. Each change name drops its date prefix; the archive
holds it at `openspec/changes/archive/<date>-<name>/`. Specs live in
`openspec/specs/<name>/`. `docs/current-state.md` describes each subsystem.

CI: DONE. A local push gate, by the owner's decision. GitHub Actions now
also gates every push and pull request. That reverses part of the same
decision, on purpose. It costs nothing. GitHub hosts it for free, since
this repository is public.

`.githooks/pre-push` runs `bun run check` in the dev container. It runs on
every push. A non-zero exit blocks the push.

`.github/workflows/check.yml` runs the same checks again, plus a
`pull_request` run for a fork's PR. Not a numbered stage: it gates every
stage below instead of adding a capability.

A preflight now runs first. It names which of six ordered devcontainer
preconditions is missing, instead of the push failing on a symptom.

Change: `add-ci-and-dependency-hygiene`, `specify-the-real-push-gate`,
`add-devcontainer-preflight`, `add-ci-workflow`.
Specs: `development-toolchain`, `devcontainer-preflight`.

## Open stages

31. **Custom and floating canvas edges: ANCHORS DONE, EDGE AFFORDANCES NOT
    STARTED.** Raised 2026-08-10 in
    conversation, alongside stage 30. The anchors were fixed then: every Path
    left a step's right-middle and entered the target's left-middle, even when
    the target sat above, below, or left of the source. React Flow's
    "floating edges" example computes the anchor from the angle between the
    two node centers instead, so each node's border point actually faces the
    other node. React Flow's "custom edges" example renders arbitrary content
    along an edge, not only a stroke; here that could mean a delete or insert
    affordance on the edge itself, beyond today's guard-label and priority
    badges. Designed 2026-08-13, in `canvas-edge-routing-styles`'s
    `design.md`, and not yet built. The anchor snaps to the midpoint of the
    side facing the target. The larger of the two centre offsets picks that
    side. A free-angle border point suits a straight edge and fights an
    orthogonal one, because a segment leaving at 37 degrees has no clean turn.
    `routeEdge` gains the axis each anchor leaves on, and the routing itself
    does not change. This design defers the stage's second half, the
    affordances drawn on the edge. The inspector deletes a path already, and a
    control on the edge is a second way to do one thing.
    One premise did not survive the design pass. Stage 30's library choice was
    held to decide this stage's cost. These anchors are trigonometry between
    two centres, and no router reaches them.
    The anchors shipped 2026-08-13 as `canvas-floating-anchors`.
    `anchorsForEdge` in `canvas/geometry.ts` reads `|dx| >= |dy|` between two
    node positions, and both anchors take that one comparison, so they always
    sit on opposing sides and every segment stays on one axis. A tie takes the
    horizontal. A zero offset takes the right side, which two steps stacked on
    one position reach.
    The vertical and backward cases run through a transform rather than a
    second copy of the routing arithmetic. `routeEdge` gains a leaving
    direction, maps both anchors into the canonical "leaves rightward" space,
    runs unchanged, and maps every returned point back. The four transforms are
    identity, negate x, swap, and swap-then-negate-both. Each composes with
    itself to the identity, which is what lets one table serve both ways.
    The review earned its place on that table. The design named the up case as
    swap-then-negate-x. That reaches the canonical space and composes to a
    180-degree rotation, so every upward edge would have returned drawn on the
    far side of the canvas.
    A backward path is now short rather than a detour. A target to the left
    that does not overlap its source is ahead along the leaving axis, so it
    takes one segment or three. The five-segment route survives only for nodes
    that overlap along that axis.
    The connect handle stays at the right-middle and the drag preview stays a
    straight line from it. A control that moved under the pointer is harder to
    press, and a drag in flight has no target to face.

40. **Permission model rework: SEAM AND STORAGE DONE, FILTER AND DRAFT SCOPE
    NOT BUILT.** Raised 2026-08-15 in conversation. A design pass ran the
    same day and took the decisions below. Nobody was blocked by the seam
    alone, and the storage half landed 2026-08-16 as
    `process-scoped-permission-grants`. A `permission_grants` table holds one
    row per grant; `src/auth/grants.ts` carries its SQL, and three operator
    routes administer it — `GET /admin/permission-grants`, `POST
    /admin/permission-grants` and `POST /admin/permission-grants/revoke`,
    behind `system:admin`. `can` answers true on either of two tests: the
    global role, then a stored grant. No account gained or lost access on the
    day this landed; an installation that writes no grant row keeps every
    answer it had.

    Three pieces stay open, and each is its own later change. The `scope=all`
    filter and the reporting aggregates turn a gate into a query predicate,
    which reaches `instance-query` rather than `authorization`. A
    draft-scoped `"author"` permission would let a multi-team installation
    limit who sees and edits which draft — today every author reaches every
    draft. And the web areas read `actor.roles` directly, so a grant holder
    reaches a permission over HTTP alone until the resource views carry
    server-computed `permissions` booleans. `tmp/open-work-priority.md`
    tracks these three.

    The seam shipped 2026-08-15 as `process-scoped-permission-seam`, ahead of
    that trigger, because it was the one piece carrying no storage question.
    `can(actor, permission, processId)` and `requirePermission` sit in
    `src/auth/authorize.ts`, over three permissions: `"publish"`, `"cancel"`
    and `"migrate"`. A private `PERMISSION_ROLE` map answers each one with the
    global role that gates it today, so no actor gained or lost access.

    Six call sites now ask through the seam. Four swapped one call for another.
    Two did not, and each taught something the design had not stated.

    The publish route reads its target `processId` out of the request body, so
    its gate moved behind the parse and the shape check. A pre-parse global
    floor is not a cheap extra: it refuses the exact caller a scoped grant
    exists to admit, so it is what a later change has to delete. Moving it now
    costs one response code. A caller lacking the role who sends a malformed
    body reads 400 where it read 403, an answer about that caller's own body.
    `openspec/specs/http-wrapper/spec.md` carries the ordering and both cases.

    `cancelInstance` keeps its load-free fast path and asks `can` in the branch
    that already holds the loaded instance, beside the `startedBy` test. A
    scoped grant names a process, and the process id only arrives with the
    instance, which is why a `system:cancel-any` holder pays no instance load
    and a grant holder does. The two tests stay independent so neither masks
    the other.

    One gap is deliberate, not a defect. A scoped grant names an existing
    process id, and the publish route mints a new process where that id is
    fresh. A first publish therefore stays a global question under the
    shipped storage. The gap is narrower than it first read. A draft carries
    its `proc_` id from its first save, since `drafts.process_id` is the
    table's key and `PUT /drafts/:processId` names it. An operator reads the
    id off the draft and writes the grant before anybody publishes. Only a
    first publish nobody prepared for stays global.

    A second review ran 2026-08-16 and corrected four things below. Two of
    them are marked in place. The `@` fallback is dropped. The draft surface
    is scopeable, which reverses what the two-authoring-roles paragraph said.
    Two more join the constraints at the end: a scope type must enumerate to
    a process-id set, and the web areas read role strings.

    Every role today is global. `src/auth/authorize.ts` declares eight
    constants and `requireRole` reads one line: does `Actor.roles` contain the
    string. No role implies another, by decision. So an author who may publish
    the expense process holds `system:publish`, and that role admits every
    other process too. `system:cancel-any` cancels any instance of any process.
    A grant for one process cannot be written down.

    **The eight `system:*` roles keep their exact meaning.** They serve the
    cases that are genuinely installation-wide. User administration, the outbox
    and the timer views belong to the installation, and `system:admin` keeps
    them. A scoped grant is a second and narrower thing beside them. It never
    replaces one, and no migration rewrites a grant anybody already holds.

    **One function answers every process-scoped question.** `can(actor,
    permission, processId, db)` takes over from the bare `requireRole` at the
    call sites that hold a process. Its body runs two tests: `Actor.roles`
    against the global role, then `hasGrant` against the store. Storage lives
    in `src/auth/grants.ts` alone, behind that seam, so this stage's storage
    half moved one file rather than the six call sites.

    **A directory group name is a principal, not a permission.** The identity
    provider is the authority on who someone is and which groups they hold. The
    installation is the authority on what a group may do inside it.
    `claimToRoles` (`src/auth/jwt.ts:81`) already passes an issuer's claim
    through verbatim, so `Actor.roles` needs no new shape, and a sync from
    Active Directory or Entra ID needs no new field. `auth_users.roles` stays a
    `TEXT[]` of free text.

    A grant therefore lives in the installation, and maps a role string to a
    permission and a scope. One row covers every holder of `finance-authors`.
    The alternative encodes the scope into the grant's own name, and that name
    then needs re-cutting in the directory as well as the database each time
    the scope idea grows. A customer with 40 processes, 12 of them finance,
    writes one row under this decision and 72 directory assignments under the
    other one.

    **A scope follows the `{type, config}` pattern**, the shape `plugin`
    already gives actions, data sources and assignment strategies
    (`src/schema/definition.ts:469`). `{ type: "process", config: { processId
    } }` is the only type a first version ships. A later `"label"` or `"owner"`
    type resolves through the same registry and moves no call site.

    **A role string carries no scope.** The 2026-08-15 pass kept
    `system:publish@proc_…` as a documented fallback for an installation that
    manages every grant in its directory. The owner dropped it 2026-08-16. It
    was a second place for a scope beside the grant table, it needed three
    format rules and a length bound of its own, and no installation had asked
    for it. A role string stays a principal, and the grant table stays the one
    place a scope lives. Where an installation later wants directory-managed
    scopes, that is its own change.

    **A grant to an Entra ID group names the object id.** `claimToRoles`
    passes the `groups` claim through, and that claim emits object ids by
    default. So the grant row holds the GUID, and the grant list shows it. The
    installation creates no second copy of the group. It writes one row that
    names what the token carries. App roles carry a readable value instead,
    at the price of Entra ID P1 for group assignment. A later operator screen
    settles how a GUID displays.

    The eight constants split into three groups under those decisions.

    The first group scopes cleanly, because the process is known at the call
    site. Publish reads it from the body. Cancel reads it from the loaded
    instance. The migration routes name a version of one process.

    The second group turns a gate into a filter. `scope=all` on `GET
    /instances` has no single process, so a scoped grant changes which rows the
    query returns. That is the expensive part, and it reaches `instance-query`
    rather than the authorization module. `system:reports` belongs here too:
    every `/reporting/*` route aggregates across processes, and meets the same
    problem.

    The third group has no process at all and stays as it is. `system:admin`
    over users, the outbox, the timers and the UI strings, beside
    `system:datalists` and `system:templates`.

    The two authoring roles belong to the first group, and stay global for
    now. The 2026-08-15 pass said a draft for a new process holds no `proc_`
    id to name. That was wrong. `drafts.process_id` is the table's key, and
    the studio names the id in `PUT /drafts/:processId` from the first save.
    So `system:author` and `system:developer` are scopeable on the four draft
    routes, and a draft-scoped `"author"` permission is where a multi-team
    installation gains the most: without it, every author sees and edits every
    draft. That is its own change. It moves the four draft call sites and
    filters the drafts list.

    Five constraints hold for any build. A scoped grant carries the opaque
    process `id`, never the `key`, since the contract lets a key change and
    references nothing. `actor.roles` sits in the CEL context
    (`src/cel/eval.ts:83`), so an authored guard reads that array, and the
    decisions above leave its shape untouched on purpose. Every scope type
    enumerates to a finite set of process ids from the store alone, because
    the second group needs the set to build a filter, and a type that only
    answers per id would leave that half unbuildable. The studio, the operator
    area and the reporting area each read their own role today, so a change
    to the shape reaches all three plus their i18n catalogs. And that same
    reading means a grant holder reaches publish over HTTP alone: the studio
    shows its publish control to a `system:publish` holder. The fix is
    server-computed `permissions` booleans on the resource views, so a screen
    asks the server what the caller may do rather than reading role strings.
    That is its own change, and it is the one that stops a second client-side
    gate from growing.

    Specs: `authorization`, `permission-grant-administration`, `http-wrapper`,
    `studio-publish`, `admin-user-management`, `instance-query`.

42. **Field catalog and data sources as list and detail: NOT STARTED.** Raised
    2026-08-15 in conversation. A design pass ran the same day and took the
    decisions below. Two problems drive the stage. Neither one concerns what
    the two panels hold.

    `panels/FieldCatalogPanel.tsx` renders every field expanded, always. One
    field carries a key, a label, a description, a type, an options fieldset
    with its data source and column mapping, a validation editor and an issue
    list. A group field repeats all of that for each child.
    `examples/purchase-requisition.json` declares 22 fields, so the view stacks
    22 of those blocks under one scrollbar. `panels/DataSourcesPanel.tsx`
    stacks its own rows the same way.

    Neither panel carries CSS. `.field-catalog-panel`, `.field-row`,
    `.option-row` and `.data-source-row` appear in no stylesheet. Neither
    `app.css` nor `shell.css` declares a bare `label`, `input` or `fieldset`
    rule. One rule of that kind exists, `.steps-panel label` in `app.css`,
    and it sets label above control at `--space-1`. The design language's field
    rule already ships in the area. These two panels never got it.

    **The panels rail becomes the master.** `screens/PanelsScreen.tsx` already
    lists every field key under the Fields entry, indents a group's children
    and carries an Add entry. Choosing an entry scrolls that field into view
    today. It selects the field instead, and the view renders that one field's
    editor. The scroll shrinks from 22 fields to one. The screen keeps its
    three columns.

    **Selection is component state and resets on a reload.** Mount selects the
    first field. Add selects the new field, so an author types into it at once.
    Remove selects the neighbour. A switch to another view and back keeps the
    selection. The editor dock takes the same position, for the same reason. No
    area holds a per-author preference store, and a lost selection lands an
    author on the view they already had open. A field takes no address of its
    own either. `/edit/panels/fields/<fieldId>` would carry an opaque id that
    one draft alone resolves, and the rail reaches any field in one click.

    **A group keeps its recursive editor.** Choosing a child selects the parent
    group and scrolls to the child inside it. `field-row-<id>` in
    `FieldCatalogPanel.tsx` and `scrollToField` in `PanelsScreen.tsx` both
    survive. They then cover one group rather than the whole catalog.

    **Each rail entry marks its own issues.** The checks rail expands and
    collapses, and nothing in it navigates to an entity. One field at a time
    would hide a broken field behind the entry an author has open. The rail
    counts issues per view already, through `issueCountForEntityType`. A
    per-id sibling gives each field entry the same mark. That part is not
    optional. Without it the stage trades a scroll for a hunt.

    **Two of the four views take the pattern.** Fields and data sources both
    stack rows, so both become list and detail. Contract holds one editor, and
    the spec grants it no sublist already. The field matrix is a table. One
    further fix falls out of the pair. A sublist renders only under the open
    view, since two sublists at once fill the 16rem column.

    The CSS half copies what the area states already. A `key` and a `type`
    print in mono, because the engine matches both exactly. A hairline divides
    rail rows and a 2px rule sits under the heading. A label sits above its
    control at 4px. The border is the field. No corner takes a radius.

    Three things stay out. The rail gets no filter, since 22 fields do not earn
    one and 100 do. The screen gets no overview table, since the field matrix
    maps a field against a step already. Neither panel gains a duplicate or a
    reorder control, since neither problem drove the stage.

    The stage lands after the editor dock. Both of them change `app.css` and
    `src/i18n/catalogs/studio.ts`, and both append to those two files.

    Spec: `studio-app`. The rail's scroll-into-view requirement becomes a
    selection, and the per-field issue mark joins it.

## Done

Stage detail: `docs/roadmap-history.md`. Same numbers, same order.

| # | Stage | Change | Spec |
|---|---|---|---|
| 1 | Validation layer (Zod-first) | `add-cross-process-validation`, `tighten-publish-validation`, `harden-publish-validation`, `close-subprocess-contract-leak` | `definition-contract`, `cross-process-validation` |
| 2 | CEL wiring | `wire-cel-expressions`, `cel-guard-totality`, `wire-cel-validation-into-publish`, `forbid-cel-datasource-refs`, `resolve-action-output-fields-everywhere` | `cel-expressions` |
| 3 | Engine skeleton | `adopt-bun-and-postgres`, `fix-schema-bootstrap-and-indexes`, `engine-skeleton-transition-slice`, `add-automatic-transitions`, `commit-transition-synthesized-callers`, `harden-cascade-resume`, `faulted-status-gate`, `add-instance-faulted-event`, `transactional-outbox`, `reresolve-after-writeback`, `suppress-faulted-writeback`, `isolate-worker-poison-rows`, `wire-outbox-retry-policy`, `bound-async-delivery`, `timer-scheduler`, `add-deadline-timers`, `harden-duration-timers`, `timer-state-provenance`, `add-subprocess-execution`, `harden-subprocess-return`, `harden-subprocess-spawn-redelivery`, `initial-step-subprocess-spawn`, `record-unmatched-subprocess-outcome`, `cancel-semantics`, `runtime-cancellation`, `harden-cancel-cascade`, `add-instance-migration`, `fix-migration-plan-freeze-race`, `reconcile-migration-writebacks`, `migration-transform-dropped-event`, `gate-migration-live-child`, `orphan-key-inspection`, `add-runtime-event-log`, `add-definition-store`, `hash-the-parsed-body`, `handler-registry`, `registry-publish-validation`, `data-source-resolution` | `persistence`, `transition-execution`, `automatic-transitions`, `instance-creation`, `transactional-outbox`, `writeback-reresolution`, `timers`, `subprocess-execution`, `cancellation`, `instance-migration`, `orphan-key-inspection`, `runtime-events`, `definition-store`, `action-handlers`, `action-registry-validation`, `data-source-resolution` |
| 4 | Editor | `editor-v1`, `editor-import-process`, `editor-ui-i18n`, `collapse-editor-i18n`, `authored-content-i18n` | `authored-content-localization` |
| 5 | Post-v1: make the engine reachable | `http-wrapper`, `correct-api-error-responses`, `configurable-cors-origins`, `player-preview-ui`, `auth-actor-assignment-claim`, `remove-assignment-registry`, `fix-claim-affordance`, `http-action-handler` | `runtime-api`, `http-wrapper`, `actor-resolution`, `assignment-claim-enforcement`, `http-action-handler` |
| 6 | Read/query API | `add-read-query-api`, `fix-instance-list-cursor-precision`, `tolerate-unresolvable-instance-in-list`, `authorize-instance-access` | `instance-query` |
| 7 | Authentication | `add-authentication`, `harden-auth-configuration`, `add-login-rate-limit`, `dedupe-auth-token-lifetime` | `jwt-authentication`, `local-user-accounts`, `auth-token-lifetime-consolidation` |
| 8 | Authorization | `add-authorization` | `authorization` |
| 9 | End-user app | `add-end-user-app` | `end-user-app`, `form-ui` |
| 10 | Admin area | `admin-shell-and-ops`, `admin-users`, `admin-migration-run` | `admin-app`, `admin-operations-api`, `admin-user-management` |
| 11 | Process Studio | `studio-shell-and-drafts`, `studio-canvas`, `studio-edit-shared-modal`, `studio-json-view`, `studio-lifecycle`, `seed-draft-from-published`, `studio-base-locale-control`, `studio-tools-and-player` | `studio-app`, `process-drafts`, `studio-canvas`, `studio-json-view`, `studio-publish`, `studio-migration-planning`, `process-version-inspection`, `studio-tools`, `studio-player` |
| 12 | Unified shell | `serve-web-assets`, `consolidate-frontend-shell` | `web-asset-serving`, `unified-shell` |
| 13 | i18n extensions (content-translation UI; UI-chrome white-label overrides) | `add-content-translation-gap-warnings`, `add-ui-chrome-white-label-overrides`, `i18n-catalogs-admin-reporting` | `studio-app`, `ui-string-overrides`, `admin-app`, `http-api-documentation`, `reporting-app` |
| 14 | Deployment & operations readiness | `add-health-readiness-endpoints`, `add-production-docker-images`, `backup-restore-runbook` | `production-docker-images`, `backup-restore-runbook` |
| 15 | Observability | `add-observability` | `observability` |
| 16 | Notifications | `add-notifications`, `notification-recipient-resolution` | `notification-email-action-handler`, `action-handlers`, `transactional-outbox`, `studio-plugin-config-form`, `local-user-accounts` |
| 17 | Escalation pattern | `add-escalation-pattern` | `escalation-pattern` |
| 18 | Environment promotion | `add-environment-promotion` | `environment-promotion` |
| 19 | Database seed data | `add-database-seed-data`, `guard-the-seed-script` | `database-seed-script` |
| 20 | Data retention & deletion policy | `add-data-retention-deletion` | `data-retention` |
| 21 | Reporting & analytics | `add-reporting-analytics` | `reporting-analytics-api`, `reporting-app` |
| 22 | HTTP API documentation | `add-http-api-documentation` | `http-api-documentation` |
| 23 | Extended task collaboration | `add-task-delegation`, `add-instance-comments`, `add-instance-attachments` | none |
| 24 | Multi-tenancy | `multi-tenancy` | `multi-tenancy`, `http-wrapper`, `jwt-authentication`, `local-user-accounts`, `action-handlers`, `assignment-strategy-registry`, `data-source-resolution`, `persistence` |
| 25 | Per-instance step assignment | `add-admin-role-editing`, `add-assignment-strategy-registry`, `add-manager-service` | `admin-user-management`, `local-user-accounts`, `admin-app`, `assignment-strategy-registry`, `manager-of-starter-assignment`, `runtime-events` |
| 26 | DB-backed data lists | `add-db-data-lists` | `db-data-source-type`, `data-list-administration` |
| 27 | No-code / low-code process authoring | `studio-plugin-config-form`, `add-condition-builder`, `studio-migration-plan-field-mapping`, `add-process-templates`, `view-layout-and-form-editor`, `split-studio-role-gate` | `studio-plugin-config-form`, `studio-tools`, `studio-condition-builder`, `cel-expressions`, `studio-migration-plan-form`, `process-templates`, `authorization`, `unified-shell`, `studio-app`, `database-seed-script`, `studio-form-editor`, `form-ui`, `runtime-api`, `studio-canvas`, `studio-player`, `process-drafts`, `process-version-inspection`, `studio-publish`, `data-list-administration` |
| 28 | Zod v4 migration | `migrate-to-zod-v4` | `development-toolchain`, `studio-plugin-config-form` |
| 29 | Table-shaped data sources | `table-shaped-data-sources` | `db-data-source-type`, `persistence`, `data-list-administration`, `definition-contract`, `data-source-resolution`, `runtime-api`, `runtime-events`, `form-ui`, `admin-app`, `studio-column-mapping-form`, `studio-app` |
| 30 | Canvas edge routing styles (step/smoothstep) | `canvas-edge-routing-styles` | `studio-canvas` |
| 32 | Shape per step/path kind on the canvas | `canvas-subprocess-step-shape` | `studio-canvas` |
| 33 | Editable edges with draggable control points | `canvas-edge-waypoints` | `studio-canvas` |
| 34 | Selection grouping (group/ungroup nodes) | `canvas-multi-select`, `canvas-step-groups` | `studio-canvas` |
| 35 | Starter access to a started instance | `starter-instance-list` | `http-wrapper`, `end-user-app` |
| 36 | Panels screen | `studio-panels-screen` | `studio-app`, `studio-checks-rail`, `studio-form-editor` |
| 37 | Canvas nodes snap to the grid | `canvas-grid-snap` | `studio-canvas` |
| 38 | Automatic canvas layout | `studio-canvas-auto-layout` | `studio-canvas` |
| 39 | Process chaining | `process-chaining` | `process-chaining`, `cross-process-validation` |
| 41 | Field matrix | `studio-view-flags-module`, `studio-field-matrix` | `studio-app`, `studio-canvas`, `spa-accessibility`, `studio-form-editor`, `studio-checks-rail` |

## Changes with no stage

The archive also holds hardening, deduplication and bug-fix changes that belong
to no stage. Among them: the accessibility and error-state passes, the
deduplication series, the test-suite determinism work, and the security fixes.
`openspec/changes/archive/` lists them. Each one amends the capability spec it
touches.
