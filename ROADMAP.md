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

Every git worktree checkout derives its own Compose project name and ports
from its filesystem path. A linked worktree's stack, database and push gate
then run against its own containers, never the main checkout's.

Change: `add-ci-and-dependency-hygiene`, `specify-the-real-push-gate`,
`add-devcontainer-preflight`, `add-ci-workflow`,
`per-worktree-devcontainer-stacks`.
Specs: `development-toolchain`, `devcontainer-preflight`, `worktree-isolation`,
`push-gate-checks`.

## Open stages

40. **Permission model rework: SEAM, STORAGE AND MIGRATION-PLAN VISIBILITY
    DONE. FILTER AND DRAFT SCOPE NOT BUILT.** Raised 2026-08-15 in
    conversation. A design pass ran the
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

    Three pieces stayed open, and each was its own later change. The
    `scope=all` filter and the reporting aggregates turn a gate into a query
    predicate, which reaches `instance-query` rather than `authorization`.
    That one stays open — `process-read-permission` closed a narrower piece
    of it instead: a per-process `"read"` gate on `GET /instances`'s
    `scope=all`, admitting a grant holder who names the process, with no
    result-set predicate over the processes a grant covers and no change to
    the three reporting routes. A draft-scoped `"author"` permission would
    let a multi-team installation limit who sees and edits which draft.
    Today every author reaches every draft. That one stays open too.
    `tmp/open-work-priority.md` tracks both.

    The third piece closed 2026-08-19 as `scope-migration-plan-visibility`.
    An audit of every client-side role check in `packages/web` found the
    web-areas-read-`actor.roles`-directly gap real in exactly one place, not
    the many the original framing implied. Publish and Cancel already
    render unconditionally and let the server's 403 carry the real gate.
    Area entry stays global-role-only, by decision: a grant narrows which
    processes an already-admitted actor may act on, and never opens a new
    area on its own. Only the Studio Versions screen's "Plan migration"
    control read a static role instead of the scoped `migrate` grant.
    `GET /drafts/:processId` now carries one added field,
    `canPlanMigration`, computed via the seam's own `can(actor, "migrate",
    processId, db)`. The Versions screen reads that field instead of
    `ROUTE_ROLE`. `ROUTE_ROLE.migrate` itself widens from `system:developer`
    alone to the same pair every other authoring screen admits; the actual
    migration-plan call still enforces the grant server-side, unchanged.
    No general `permissions`-booleans framework landed. The audit found no
    second case that needed one.

    The seam shipped 2026-08-15 as `process-scoped-permission-seam`, ahead of
    that trigger, because it was the one piece carrying no storage question.
    `can(actor, permission, processId)` and `requirePermission` sit in
    `src/auth/authorize.ts`, over three permissions at the time: `"publish"`,
    `"cancel"` and `"migrate"`. A private `PERMISSION_ROLE` map answers each
    one with the global role that gates it today, so no actor gained or lost
    access. `process-read-permission` later widened the seam to four
    permissions, adding `"read"` (mapped to `ADMIN_ROLE`) and moving the
    `scope=all` instance listing onto it when the request names a
    `processId` — see below.

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
    to the shape reaches all three plus their i18n catalogs. That same
    reading was checked against every client-side role gate in
    `packages/web` on 2026-08-19. Publish and Cancel already render their
    controls unconditionally and let the server's 403 carry the gate, so
    neither needed a fix. Only the Studio Versions screen's migration-plan
    control read a role instead of the grant; `scope-migration-plan-visibility`
    closed that one gap, over one field on one resource view, not a general
    `permissions`-booleans framework.

    Specs: `authorization`, `permission-grant-administration`, `http-wrapper`,
    `studio-publish`, `admin-user-management`, `instance-query`,
    `process-drafts`, `studio-app`, `studio-migration-planning`.

43. **Step-level validation overrides: ENGINE DONE, STUDIO UI NOT BUILT.**
    Landed 2026-08-18 as `step-validation-overrides`. A catalog field's
    `min`/`max`/`minLength`/`maxLength`/`pattern`/`rule` used to apply
    unchanged to every step that showed the field. A CAPEX process needing a
    `betrag` field capped at 10000 normally but 1000 on a "small request"
    step had to fork the field into two catalog entries under two ids, which
    split the value a report reads and a migration maps.

    `ViewField` now carries an optional `validation`, the same shape the
    catalog field's own carries, plus `validationMode`: `"merge"` (the
    default) overlays the step's keys on the catalog's, `"replace"` drops
    the catalog's whole. `validateSubmissionData`
    (`src/runtime/api.ts::effectiveValidation`) resolves the two per field
    per step, at the point of the submission check, not in `resolveFields`:
    the override never reaches `ResolvedViewField`, so it never reaches
    `GET /instances/:id`. Publish compiles a step-level `pattern` and
    type-checks a step-level `rule` on the same terms the catalog's own
    already faced.

    No studio surface exposes it. An author writes the override through the
    JSON view alone, the low-code escape hatch the no-code direction keeps
    first-class. The form editor's per-step strip stops at
    `visible`/`required`/`readonly`, and the field matrix draws no marker
    for a step carrying one. Both are a later change's to make, once an
    author asks for the control rather than the JSON.

    Specs: `definition-contract`, `runtime-api`, `cel-expressions`.

44. **Technical (system-only) field marker: DONE.** Raised 2026-08-19 in
    conversation, while verifying the `gate-required-readonly-conflict`
    change (landed 2026-08-18, commit `f4c2db1`) live on `detent.org`. That
    change gates `required` and `readonly` against each other one-way, but
    only while nothing else in the draft writes the field (`writtenByOther`,
    `draft/view-flags.ts`). Live testing on `loan_application` found the
    gate correctly stays off for `result`: the `check` step's
    `subprocess.outputMapping` writes it
    (`field_l_result: { src: "child.outcome", lang: "cel" }`), so
    `writtenFieldCounts` counts it as written and the gate does not fire.
    That was the earlier change's own designed behavior, not a defect — but
    `result` is written only by the engine and never by a participant, on
    any step, so offering it as an editable, `required` field on any form is
    arguably the wrong shape regardless of step order. This change (`technical-
    field-marker`) closes that gap with a declared marker.

    `FieldDef` gained `technical?: boolean`. A `technical` field must not be
    `type: "group"`, and a view entry naming one must declare neither
    `required` nor `readonly`, literal or CEL — both checked at publish
    (`compile.ts::checkTechnicalFields`), never as a Zod refinement, since
    `definition.ts` also deserializes stored immutable bodies. The engine
    forces `required: false, readonly: true` for a technical field on every
    step, in `resolveFields`, mirroring the `type: "group"` precedent
    already there. A submission naming a technical field is rejected with
    the existing `readonly-field` issue.

    The studio ships the marker without inference: a Technical checkbox on
    the field catalog's Field tab, reaching a group's child too. Checking it
    clears every stale `required`/`readonly` view key the field carries,
    behind a confirmation naming the count. The form editor's strip omits
    the `required`/`readonly` controls for a technical field; the field
    matrix disables the equivalent cell controls and marks the row header.
    A new checks-rail finding reports the inverse case — a technical field
    no structural source writes — non-blocking, and anchored on the field
    rather than a step.

    Inferring "technical" from usage, and step-order/reachability-aware
    validation, are both explicitly deferred; see this stage's own history
    entry for the reasoning.

    Specs: `definition-contract`, `runtime-api`, `studio-app`,
    `studio-form-editor`, `studio-checks-rail`.

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
| 31 | Custom and floating canvas edges (floating anchors, drop-to-insert on a path) | `canvas-floating-anchors`, `canvas-edge-affordances` | `studio-canvas` |
| 32 | Shape per step/path kind on the canvas | `canvas-subprocess-step-shape` | `studio-canvas` |
| 33 | Editable edges with draggable control points | `canvas-edge-waypoints` | `studio-canvas` |
| 34 | Selection grouping (group/ungroup nodes) | `canvas-multi-select`, `canvas-step-groups` | `studio-canvas` |
| 35 | Starter access to a started instance | `starter-instance-list` | `http-wrapper`, `end-user-app` |
| 36 | Panels screen | `studio-panels-screen` | `studio-app`, `studio-checks-rail`, `studio-form-editor` |
| 37 | Canvas nodes snap to the grid | `canvas-grid-snap` | `studio-canvas` |
| 38 | Automatic canvas layout | `studio-canvas-auto-layout` | `studio-canvas` |
| 39 | Process chaining | `process-chaining` | `process-chaining`, `cross-process-validation` |
| 41 | Field matrix | `studio-view-flags-module`, `studio-field-matrix` | `studio-app`, `studio-canvas`, `spa-accessibility`, `studio-form-editor`, `studio-checks-rail` |
| 42 | Field catalog and data sources as list and detail | `panels-list-and-detail` | `studio-app` |
| 45 | Auto-derive `key` from `label` in the studio | `auto-derive-key-from-label` | `studio-canvas`, `studio-app` |
| 46 | Instance audit log: append-only, hash-chained field history | `instance-audit-log-chain` | `admin-operations-api`, `data-retention`, `instance-audit-log`, `persistence` |
| 47 | Cross-process instance query core (`queryInstances`) | `instance-query-core` | `admin-app`, `http-wrapper`, `instance-data-query`, `instance-query`, `persistence` |
| 48 | Redactable field flag, narrowing audit-log redaction to marked fields | `redactable-field-flag` | `data-retention`, `definition-contract`, `instance-audit-log`, `persistence` |
| 49 | Instance audit log admin view (entries + chain verification) | `instance-audit-log-view` | `admin-app`, `admin-operations-api`, `instance-audit-log` |
| 50 | Instance data tables: a saved report builder over instance field values | `instance-data-tables` | `instance-data-tables`, `reporting-app`, `reporting-data-tables` |
| 51 | `instance.query` data source: a field's options read from another process's instances | `instance-query-data-source` | `cross-process-validation`, `data-source-resolution`, `definition-store`, `instance-data-query`, `instance-query-data-source`, `studio-plugin-config-form` |
| 52 | `instance.transition` action, the write half of the aggregated data source pattern | `instance-transition-action` | `cross-process-validation`, `definition-store`, `instance-transition-action`, `runtime-events` |
| 53 | Studio Player test instances run against a process's current draft | `studio-play-draft-instance` | `admin-app`, `definition-store`, `draft-test-instances`, `instance-query`, `reporting-analytics-api`, `runtime-api`, `studio-player` |
| 54 | Field model split into `type`, `format` and `control` | `field-model-type-format-control` | `authored-content-localization`, `cel-expressions`, `data-source-resolution`, `definition-contract`, `field-tree-check-consolidation`, `form-ui`, `instance-data-query`, `instance-query-data-source`, `runtime-api`, `runtime-field-type-check-consolidation`, `studio-app`, `studio-column-mapping-form`, `studio-condition-builder`, `studio-field-validation-form`, `studio-migration-plan-form` |
| 55 | `person` field format, the `org.actor-from-field` assignment strategy, and the people list a person picker reads | `field-model-person-format` | `actor-from-field-assignment`, `database-seed-script`, `data-source-resolution`, `definition-contract`, `runtime-api`, `studio-app` |
| 56 | Authored notes in a step's view, the first non-field `ViewEntry` | `field-model-view-note` | `authored-content-localization`, `definition-contract`, `form-ui`, `runtime-api`, `studio-app`, `studio-checks-rail`, `studio-form-editor` |

## Changes with no stage

The archive also holds hardening, deduplication and bug-fix changes that belong
to no stage. Among them: the accessibility and error-state passes, the
deduplication series, the test-suite determinism work, and the security fixes.
`openspec/changes/archive/` lists them. Each one amends the capability spec it
touches.
