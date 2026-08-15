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

38. **Automatic canvas layout: NOT STARTED.** Raised 2026-08-15 in
    conversation. Today `autoPlaceSteps` in `canvas/layout.ts` positions a step
    only when `layout` carries none for it. It walks breadth-first from
    `initialStep`, maps depth to a column at `COLUMN_WIDTH` 240 and arrival
    order to a row at `ROW_HEIGHT` 120, and appends an unreachable step one
    column past the deepest it reached. It never reads a node's size, never
    orders the steps inside a column, and treats a path that returns to an
    earlier step as one more edge to skip. This stage adds one arrange over the
    whole graph, invoked by the author. It does not change the placement
    default for a new step.

    The graphs hold cycles, and that fact decides the library. A depth-first
    pass over the examples counts one back edge in `expense-approval.json`,
    `booking_error -> book`, and four in the 13-step
    `purchase-requisition.json` in the working tree, `manager_approval ->
    draft` among them. Both are ordinary rework loops. A layered layout
    therefore has to break the cycles before it ranks, and restore them after,
    or it fails on the definitions this repository already carries.

    Two candidates, both MIT. `@dagrejs/dagre` documents the cycle break as the
    first step of its pipeline: `acyclic.run` reverses a back edge and
    `acyclic.undo` restores its direction once the layout is computed. It is
    also the maintained fork, since plain `dagre` was archived in 2023.
    `d3-dag` is TypeScript-native and lets the layering, the crossing pass and
    the coordinate pass be chosen apart from each other. One question separates
    the two: whether its v1 `graphConnect` builder breaks a cycle or throws on
    one. The v0 line threw. Answer that before choosing. If it throws, the
    caller owns about twenty lines of back-edge detection, which is the work
    the library was meant to supply.

    Three candidates were dropped. `elkjs` is EPL-2.0 against this package's
    AGPL-3.0-or-later, and it ships a GWT-compiled artifact large enough to
    want a worker. Its one clear advantage, nested compound nodes, has no use
    here: a subprocess is call-and-return and never draws inside its parent.
    Graphviz through `@hpcc-js/wasm` is EPL-1.0 and takes DOT strings. A
    force-directed layout settles differently on each run and produces no flow
    direction.

    Two constraints hold whichever wins. Position stays in the opaque `layout`
    blob, so no schema, no `definitionHash` and no published body moves, the
    property stage 37 also rests on. And the result must land on the 20-unit
    lattice `snapToGrid` enforces, so the rank and node separations stay whole
    multiples of `GRID_STEP`. Otherwise the first drag of an arranged step
    shifts it, the defect stage 37 closed.
    Spec: `studio-canvas`.

39. **Process chaining: NOT STARTED.** Raised 2026-08-15 in conversation. An
    offer process reaches its terminal step `approved` and must start a
    procurement process from the data it collected. The offer itself is done
    and must not wait for the procurement to finish.

    A subprocess step does not express this. It is call-and-return, so the
    parent parks until the child returns an outcome. What this stage adds is
    the fire-and-forget direction: the source instance completes, the target
    instance runs on its own.

    The enqueue site already exists. A terminal step carries `onEntry` actions
    like any other step, and `planStepEntry` sets `status` to `completed` at
    that entry and enqueues them. The subprocess return rides that same site
    today, as `core.returnSubprocess` in `transition.ts`. What is missing is a
    handler. Only `http.request` and `notification.email` ship.

    The handler takes `{ processId, inputMapping }` and calls
    `createProcessInstance`. The mapping keeps the shape
    `SubprocessSpec.inputMapping` already has: one CEL expression per target
    field, evaluated over the source instance, and a raising entry leaves its
    target unwritten and records `mapping.entry-dropped` rather than failing
    the start. That reuses the decided semantics and the existing editor.

    Two points need care. The outbox is at-least-once, so a redelivery would
    otherwise start a second target instance; deriving the new instance id from
    the delivery's `idempotencyKey` turns a redelivery into a primary-key
    collision, and needs an optional `id` in `createProcessInstance`. And the
    `processId` in the config must resolve at publish time, beside the checks
    `cross-process-validation` already runs. Specs: `action-handlers`,
    `instance-creation`, `cross-process-validation`.

40. **Permission model rework: DESIGNED, NOT BUILT.** Raised 2026-08-15 in
    conversation. A design pass ran the same day and took the decisions below.
    Nobody is blocked by the current model, so this stage records a direction
    rather than queued work. `tmp/open-work-priority.md` carries it as a
    deferral and names the trigger that moves it.

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

41. **Field matrix: SHARED MODULE DONE, GRID NOT STARTED.** Raised 2026-08-15
    in conversation. One surface lists every catalog field against every step
    and sets `required`, `readonly` and `visible` in place, so an author stops
    opening each step's form editor in turn. The aim is authoring speed. A
    design pass ran the same day and took the decisions below. The six
    numbered points after them stay the reference. Each one names a property
    of the current engine that the first-guess build gets wrong.

    The shared module `draft/view-flags.ts`, the form editor's default-aware
    controls and the two stopping-state checks shipped 2026-08-15 as
    `studio-view-flags-module`, this stage's first half. The grid at
    `/processes/:id/edit/panels/matrix` does not exist yet.

    **The surface writes flags alone.** A cell exists only where the step
    already declares the field. `purchase-requisition.json` gives 54 such cells
    against 286 in the full grid. The form editor keeps `view.fields[]`
    membership, array order, `group` and `span`. That answers the fourth point
    below instead of paying it. `view.group` is free text per step, and the 13
    steps invent 10 different labels, so the matrix has no basis to pick one.

    **The grid stays 22 by 13.** A step that declares no view draws an inert
    column. A field that a step never lists draws an inert cell.

    **The three flags keep their names and gain one behaviour.** Each control
    starts at the engine's resolved default. Each writes its key only where the
    author departs from that default, and deletes the key on return. Each takes
    a boolean or CEL through one control. `visible` gates the other two.
    Switching it off disables both and clears their keys.

    A polarity flip lost on one fact. Every flag is `boolean | Expression`, and
    nobody can invert an expression. `readonly: data.amount > 5000` under an
    "Editable" label would store `!(data.amount > 5000)`. The JSON view would
    then show the author text they never wrote. That view stays first-class, so
    the studio keeps the JSON's own three words.

    **The standardization lives in one shared module**, `draft/view-flags.ts`.
    The form editor calls it too. `BooleanOrExpressionInput` rendered
    `checked={value === true}` before this stage's first half shipped. An
    absent `visible` had therefore drawn unticked while the field showed. The
    matrix would have repeated that defect 54 times over; the checkbox now
    reads `effectiveFlag` instead, and the defect is fixed everywhere the
    module reaches.

    **The two stopping states report rather than block.** The fifth point below
    names both. The JSON view authors either one, so gating the matrix alone
    would catch nothing. The readonly-with-required rule reports only where no
    step makes the field editable, and no `Action.output`,
    `SubprocessSpec.outputMapping`, `FieldDef.columnMapping` or
    `ProcessContract.inputFields` entry writes it. Real reachability over a
    cyclic graph costs more than a warning earns. The checks rail carried five
    engine-validator sources before this stage's first half. Both rules now
    report under the sixth, `view`, for the studio's own findings.

    **The surface joins the panels screen as a fourth view**, at
    `/processes/:id/edit/panels/matrix`. It inherits the deep link, the Back
    behaviour, the role gate and the checks rail column. `routing.ts` and
    `.claude/rules/ui-glossary.md` each name three views today. Both go to
    four.

    The cost sits on the field, not on the step.
    `purchase-requisition.json` in the working tree carries 22 fields, four of
    them nested in the `line_item` group, over 13 steps, and 54 view entries.
    `line_item.item_description` appears in six steps, so one decision about
    that field costs six visits today.

    First, `visible` is not a peer of the other two flags. `resolveFields`
    (`src/runtime/api.ts:441`) applies it as a `continue`: a field that fails it
    leaves the loop and never reaches the returned list, while `required` and
    `readonly` become properties of a field that stayed. `ResolvedViewField`
    shows the split. It carries those two and never carries `visible`. A cell of
    three equal switches states this wrongly. Membership belongs above the two
    modifiers, and `visible` belongs beside a CEL input.

    Second, the three flags default apart. `resolveFlag` reads an absent
    `visible` as true and an absent `required` or `readonly` as false. The
    surface must write a key only where the author departs from the default, and
    must delete that key when the author returns to it. The 54 entries in
    `purchase-requisition.json` carry no `visible` key at all. One `visible:
    true` per entry alters `ProcessBody`, so `definitionHash` moves for an edit
    that alters no behavior, and an identical re-publish stops being a no-op.

    Third, the steps are not peers either. Three of the 13 —
    `approval_routing`, `issue_po` and `receipt_check` — hold automatic paths,
    carry no assignment and declare no view, so no person ever stands at one.
    Three more are terminal and show a receipt. The full grid is 22 by 13, which
    is 286 cells over 54 entries. Decide which steps the surface admits, or it
    draws 232 cells that answer nothing.

    Fourth, `view.fields[]` gets a second writer. The form editor owns array
    order, `group` and `span`. The array position of a field the matrix adds
    decides where the form renders it, and the matrix holds one row order for
    all steps while each step holds its own. Name the owner of each key before
    either surface writes.

    Fifth, two field states stop a step, and the surface can see both.
    `readonly` with `required`, on a field no earlier step writes, makes every
    submission raise `required-missing`: `editableFieldIds` excludes the field,
    so nobody can supply the value. `visible: false` with `required: true` drops
    the requirement silently, because `resolveFields` removes the field before
    `requiredFieldIds` counts it. Both read off `view.fields[]` alone, so both
    belong in the checks rail whether or not the grid ships — and both do,
    reported under `checkViewFlags` since this stage's first half.

    Sixth, a grid is a keyboard problem. 286 cells need a roving focus, a header
    that names each column to a screen reader, and a scroll region that holds no
    focus trap. `spa-accessibility` carries the standing rules.

    Specs: `studio-form-editor`, `studio-app`, `studio-checks-rail`,
    `spa-accessibility`.

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

## Changes with no stage

The archive also holds hardening, deduplication and bug-fix changes that belong
to no stage. Among them: the accessibility and error-state passes, the
deduplication series, the test-suite determinism work, and the security fixes.
`openspec/changes/archive/` lists them. Each one amends the capability spec it
touches.
