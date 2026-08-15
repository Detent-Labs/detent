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
Spec: `development-toolchain`.

## Open stages

31. **Custom and floating canvas edges: ANCHORS DONE, EDGE AFFORDANCES NOT
    STARTED.** Raised 2026-08-10 in
    conversation, alongside stage 30. Today's anchors are fixed: every Path
    leaves a step's right-middle and enters the target's left-middle
    (`sourceAnchor`/`targetAnchor` in `canvas/CanvasView.tsx`), even when the
    target sits above, below, or left of the source. React Flow's
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

40. **Permission model rework: SEAM DONE, STORAGE NOT BUILT.** Raised
    2026-08-15 in conversation. A design pass ran the same day and took the
    decisions below. Nobody is blocked by the current model, so the storage
    half records a direction rather than queued work.
    `tmp/open-work-priority.md` carries it as a deferral and names the trigger
    that moves it.

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
    instance. That call answers false there today, because the fast path
    already put the same question and lost. The two tests stay independent so
    neither masks the other once a grant carries a scope.

    One gap stays open for the storage half, and it is not a defect here. A
    scoped grant names an existing process id, and the publish route mints a
    new process where that id is fresh. A first publish therefore stays a
    global question under any storage this stage picks.

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
    permission, processId)` takes over from the bare `requireRole` at the call
    sites that hold a process. Its body today is the check that ships: does
    `Actor.roles` hold the global role. Storage, scope shape and any directory
    mapping live behind it. That seam is what this stage protects, and it is
    the one piece worth landing early. A later change to how a grant is stored
    then moves one file rather than six call sites.

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

    **The scoped-role string stays a documented fallback**, for an installation
    that wants every grant managed in its directory. Such an installation
    writes `system:publish@proc_3f8a1c2e-9b4d-4e7a-a1c8-2e5f7b9d0a13` as an
    Entra app role value, and the engine reads it behind the same `can`. Three
    format rules hold wherever that path runs. The separator is `@` and the
    process id is the entire remainder, because `processId` is
    `regex(/^proc_/)` with an unconstrained tail, so no right-hand split is
    safe. The string carries no space and stays under 120 characters, which is
    what an Entra app role value permits. App roles carry this and groups do
    not, because the `groups` claim emits object ids by default.

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

    The two authoring roles sit outside all three. A draft for a new process
    holds no `proc_` id to name, so `system:author` and `system:developer` stay
    global on the four draft routes. Publish takes the scope instead, because
    the body names its target.

    Three constraints hold for any build. A scoped grant carries the opaque
    process `id`, never the `key`, since the contract lets a key change and
    references nothing. `actor.roles` sits in the CEL context
    (`src/cel/eval.ts:83`), so an authored guard reads that array, and the
    decisions above leave its shape untouched on purpose. And the studio, the
    operator area and the reporting area each read their own role today, so a
    change to the shape reaches all three plus their i18n catalogs.

    Specs: `authorization`, `admin-user-management`, `instance-query`.

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
