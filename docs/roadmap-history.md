# Roadmap history

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: this file names four distinct audiences the product serves:
     participant (end user), operator, developer, process owner. They are four
     different people, not one concept under rotating names, so the rule reports
     a false positive on every stage that contrasts them. No other rule is
     silenced here. -->

What each finished stage was, in full. `ROADMAP.md` carries the index and the
open stages. This file carries the detail. Stage numbers match. A stage points at the OpenSpec change that built it and the
capability spec that holds its rules. Each change name drops its date prefix;
the archive holds it at `openspec/changes/archive/<date>-<name>/`. Specs live
in `openspec/specs/<name>/`. `docs/current-state.md` describes each subsystem
as it stands.

1. **Validation layer (Zod-first): DONE.** The JSON contract as Zod schemas,
   with TypeScript types derived from them. It also carries the structural
   invariants the types cannot express. Publish enforces the cross-process
   invariants that need the child definition. That also establishes child-first
   publish ordering.
   Changes: `add-cross-process-validation`, `tighten-publish-validation`,
   `harden-publish-validation`, `close-subprocess-contract-leak`.
   Specs: `definition-contract`, `cross-process-validation`.

2. **CEL wiring: DONE.** One CEL library for both sides: the studio parses and
   type-checks, the engine evaluates. Guards are total: a runtime error is not a
   match. An invalid expression is a publish error, never a runtime one. The
   check visits every expression position in a body.
   Changes: `wire-cel-expressions`, `cel-guard-totality`,
   `wire-cel-validation-into-publish`, `forbid-cel-datasource-refs`,
   `resolve-action-output-fields-everywhere`.
   Spec: `cel-expressions`.

3. **Engine skeleton: DONE.** The executor itself: everything that runs a
   published definition against PostgreSQL.
   a. Instance store and persistence, on Bun's native `Bun.sql`.
      Changes: `adopt-bun-and-postgres`, `fix-schema-bootstrap-and-indexes`.
      Spec: `persistence`.
   b. Transition execution: manual, automatic and timer-forced transitions,
      trigger ordering, run-to-rest, and the `faulted` park on a re-entry loop.
      Changes: `engine-skeleton-transition-slice`, `add-automatic-transitions`,
      `commit-transition-synthesized-callers`, `harden-cascade-resume`,
      `faulted-status-gate`, `add-instance-faulted-event`.
      Specs: `transition-execution`, `automatic-transitions`, `instance-creation`.
   c. Transactional outbox: state commits first, side effects dispatch after,
      at-least-once with idempotency, retry, dead-letter and reclaim, plus
      re-resolution of wait-states after a writeback.
      Changes: `transactional-outbox`, `reresolve-after-writeback`,
      `suppress-faulted-writeback`, `isolate-worker-poison-rows`,
      `wire-outbox-retry-policy`, `bound-async-delivery`.
      Specs: `transactional-outbox`, `writeback-reresolution`.
   d. Timers: first-class on the step, fire time computed at entry and
      persisted, both `duration` and `deadline` forms.
      Changes: `timer-scheduler`, `add-deadline-timers`, `harden-duration-timers`,
      `timer-state-provenance`.
      Spec: `timers`.
   e. Subprocesses: synchronous call-and-return, contract-bound, with downward
      cancel propagation.
      Changes: `add-subprocess-execution`, `harden-subprocess-return`,
      `harden-subprocess-spawn-redelivery`, `initial-step-subprocess-spawn`,
      `record-unmatched-subprocess-outcome`.
      Spec: `subprocess-execution`.
   f. Cancellation of a running instance, cascading to active children.
      Changes: `cancel-semantics`, `runtime-cancellation`, `harden-cancel-cascade`.
      Spec: `cancellation`.
   g. Instance migration: an explicit, registered plan per version pair, applied
      as one rule to all instances on a version, plus a read-only orphan-key scan.
      Changes: `add-instance-migration`, `fix-migration-plan-freeze-race`,
      `reconcile-migration-writebacks`, `migration-transform-dropped-event`,
      `gate-migration-live-child`, `orphan-key-inspection`.
      Specs: `instance-migration`, `orphan-key-inspection`.
   h. The runtime event log: the sibling record for everything that happens
      without a step change.
      Change: `add-runtime-event-log`.
      Spec: `runtime-events`.
   i. The definition/version store that instances rehydrate from, and the
      handler registry validated at publish.
      Changes: `add-definition-store`, `hash-the-parsed-body`, `handler-registry`,
      `registry-publish-validation`.
      Specs: `definition-store`, `action-handlers`, `action-registry-validation`.
   j. Runtime option-list resolution for a field's data source.
      Change: `data-source-resolution`.
      Spec: `data-source-resolution`.

4. **Editor: DONE, then superseded.** A proof of concept for the editing half
   only: structural panels over a file-held draft. The graph view was read-only,
   and nothing could publish. Stage 11 replaced it and deleted the package, and
   retired the twelve capability specs that described only the editor's
   internals. Authored-content localization outlived it, since it lives in the
   schema.
   Changes: `editor-v1`, `editor-import-process`, `editor-ui-i18n`,
   `collapse-editor-i18n`, `authored-content-i18n`, plus the graph-view fixes
   (`editor-graph-mermaid`, `editor-graph-edge-routing`,
   `editor-graph-arrowhead-fix`).
   Spec: `authored-content-localization`.

5. **Post-v1: make the engine reachable. DONE (a–e).** Getting from "the engine
   runs in a test" to "something outside the process can drive it".
   a. DONE. An end-to-end validation of the Runtime API Layer with a throwaway
      script against `examples/expense-approval.json` (`b27e18f`). No new
      capability, no OpenSpec change.
      Change (the layer itself): `runtime-api-layer`. Spec: `runtime-api`.
   b. DONE. A thin REST/JSON wrapper over `Bun.serve` exposing the Runtime API
      Layer, with typed errors mapped to HTTP statuses.
      Changes: `http-wrapper`, `correct-api-error-responses`,
      `configurable-cors-origins`.
      Spec: `http-wrapper`.
   c. DONE. A Player/Preview screen driving a real instance through (b). Stage
      11 later rebuilt it inside the studio area.
      Change: `player-preview-ui`.
   d. DONE. Authentication of the acting actor and enforcement of the previously
      inert `Step.assignment`: pluggable actor resolution, candidates resolved at
      step entry, and exclusive claim/release.
      Changes: `auth-actor-assignment-claim`, `remove-assignment-registry`,
      `fix-claim-affordance`.
      Specs: `actor-resolution`, `assignment-claim-enforcement`.
   e. DONE. A vendor-neutral `http.request` action handler, registered by
      default, so a process can call an outside system.
      Change: `http-action-handler`.
      Spec: `http-action-handler`.

6. **Read/query API: DONE.** The last engine-side blocker before frontend work.
   It lists instances, reads one instance's merged record, and discovers
   published processes. Before it, a caller could only address a single instance
   by an id it already held.
   Changes: `add-read-query-api`, `fix-instance-list-cursor-precision`,
   `tolerate-unresolvable-instance-in-list`, `authorize-instance-access`.
   Spec: `instance-query`.

7. **Authentication: DONE.** A production-capable JWT actor resolver beside the
   non-production dev-header one. One resolver covers both local project
   accounts and JWKS-backed external issuers, dispatching on the token's issuer.
   A local account and an IdP identity therefore both work during a migration.
   Changes: `add-authentication`, `harden-auth-configuration`,
   `add-login-rate-limit`, `dedupe-auth-token-lifetime`.
   Specs: `jwt-authentication`, `local-user-accounts`,
   `auth-token-lifetime-consolidation`.

8. **Authorization: DONE.** Closes the gap stage 7 recorded. Two reserved roles
   gate publishing and cancelling anyone's instance, the two operations that had
   no permission check at all. It changes assignment/claim enforcement in no way.
   **BREAKING**: an account that published or cancelled earlier now needs the
   role. Grant it with `src/auth/cli.ts set-roles`.
   Change: `add-authorization`.
   Spec: `authorization`.

9. **End-user app: DONE.** The participant's product: an inbox of my tasks, one
   task screen, and starting a process. The same change extracted the shared
   step-form renderer. An author now previews the form a participant later fills
   in, through one renderer rather than two.
   Deliberately excluded here and delivered later: comments, attachments and
   delegation (stage 23).
   Change: `add-end-user-app`.
   Specs: `end-user-app`, `form-ui`.

10. **Admin area: DONE.** The operator's product, beside the participant's
    (stage 9) and the developer's (stage 11), behind one reserved role. Runtime
    access through the HTTP wrapper only, never a direct database read.
    Design: `docs/superpowers/specs/2026-07-27-admin-developer-area-design.md`.
    a. Shell and operations: DONE. All instances, the merged transition+event
       record, the outbox with dead-letter repair, and pending timers.
       **BREAKING, shipped**: listing all instances and reading an instance
       record were reachable by any authenticated actor and now require
       `system:admin`.
       Change: `admin-shell-and-ops`. Specs: `admin-app`, `admin-operations-api`.
    b. User administration: DONE. The first HTTP carve-out from CLI-only account
       administration — list users and disable/enable them. Disabling blocks
       the next login; it does not revoke an already-issued token. Creating a
       user, changing a password and assigning roles stayed CLI-only here;
       25a took roles, and `admin-user-onboarding` took the other two, so the
       carve-out now covers every account write.
       Change: `admin-users`. Spec: `admin-user-management`.
    c. Migration run: DONE. Running an already-registered migration plan and
       seeing the result grouped by bucket. Authoring the plan belongs to the
       studio area (stage 11).
       Change: `admin-migration-run`.
    The design's Processes and Tools areas were reassigned to stage 11 —
    authoring belongs to the developer, operating to the operator.

11. **Process Studio: DONE.** The developer's product, behind its own reserved
    role, superseding stage 4's editor. Process list, editing over three surfaces
    (canvas, panels-as-inspector, JSON), published versions with a diff, a Player
    beside the instance record, migration-plan authoring, and tools.
    Design: `docs/superpowers/specs/2026-07-27-process-studio-design.md`.
    One new table, `drafts` — one mutable draft per process, deliberately not the
    `definitions` table that running instances rehydrate from, and holding layout
    beside the body so moving a box mints no version. **Version numbers are
    environment-local**; `definitionHash` is the only identity that carries
    across an environment boundary.
    a. Shell and drafts: DONE. The package, the draft store with optimistic
       concurrency, and a process list merging published processes with drafts.
       Change: `studio-shell-and-drafts`. Specs: `studio-app`, `process-drafts`.
    b. Canvas: DONE. The edit screen becomes canvas-primary — drag to
       reposition, drag to connect — with the canvas at the top of the editing
       well, a per-step section index docked beside it, and the field
       catalogue, data sources and contract behind one shared modal. The
       canvas adds no authoring operation the panels could not already do.
       Changes: `studio-canvas`, `studio-edit-shared-modal`.
       Spec: `studio-canvas`.
    c. JSON view: DONE. The third editing surface, mutually exclusive with the
       structural one so a stale textarea cannot clobber a panel edit.
       Change: `studio-json-view`. Spec: `studio-json-view`.
    d. Lifecycle: DONE. Publishing the persisted draft server-side, a versions
       screen with a from-scratch JSON diff, and migration-plan authoring with an
       orphan-key dry run.
       Changes: `studio-lifecycle`, `seed-draft-from-published`,
       `studio-base-locale-control`.
       Specs: `studio-publish`, `studio-migration-planning`,
       `process-version-inspection`.
    e. Tools and Player: DONE. A registry view of the running server, a static
       CEL scratchpad, and a Player driving a real instance beside its merged
       record. Deleted `packages/editor`.
       Change: `studio-tools-and-player`. Specs: `studio-tools`, `studio-player`.

12. **Unified shell: DONE.** An installation must present itself as one system
    with one address, not four systems with four ports and four logins. The four
    independently-built SPAs became one package, `packages/web`, with one build,
    one login, one session and one address; the engine serves it from `WEB_ROOT`.
    Areas are gated by role and lazily loaded, so a participant never downloads
    the studio canvas and sees no trace of the consolidation.
    a. Static asset serving in the engine: DONE. The only backend change,
       reviewed alone: a fallthrough behind every API route, so no URL prefix is
       reserved and an absent `WEB_ROOT` leaves the engine running unchanged.
       Change: `serve-web-assets`. Spec: `web-asset-serving`.
    b. The shell and all four areas: DONE, one change, one area per step.
       Change: `consolidate-frontend-shell`. Spec: `unified-shell`.
    `packages/form-ui` stayed a separate package throughout, since it is imported
    from two sides. Folding it in is a separate decision, not taken.

13. **i18n extensions (content-translation UI; UI-chrome white-label
    overrides): DONE.** Raised 2026-07-28 as a
    brainstorm, not a committed stage. Two independent sub-projects, each
    with its own design and its own change:
    a. Content-translation UI (studio area): DONE. `LocalizedText` (the
       process/step/field labels a participant sees) already lives in the DB,
       inline in the versioned JSON definition/draft body. There is nothing to
       move. The studio already supports inline per-field locale editing
       (`ContentLocaleSwitcher`, `LocalizedTextInput`). Adds a per-locale gap
       count next to the switcher, and an inline missing-translation warning
       at each `LocalizedTextInput`, following the existing assignment and
       `db.list`-key non-blocking-warning pattern. Pure UI addition, no
       schema or storage change.
       Design: `docs/superpowers/specs/2026-08-05-content-translation-ui-design.md`.
       Change: `add-content-translation-gap-warnings`. Spec: `studio-app`.
    b. UI-chrome white-label overrides: DONE. Motivated by a per-customer wording
       requirement, not language count. Each customer already gets its own
       deployment/DB (existing environment-separation convention) and wants
       to edit its own UI-chrome wording (buttons/headings) without a
       redeploy. Adds a sparse table
       `ui_string_overrides(area, locale, key, value)`, an unauthenticated
       `GET /ui-strings` fetched once at app boot (covering the pre-login
       screen too), and a one-line patch in each catalog that already has a
       `t(locale, key)`: `shell`, `app`, `studio`. Writes go through a
       `system:admin`-gated route (`src/engine/ui-strings.ts` plus routes,
       mirroring `admin-queries.ts`/`admin-routes.ts`) and a new admin
       screen. `admin`/`reporting` need their own catalog first; that
       retrofit is a deliberately deferred, separate prerequisite change.
       Scoped to text only, no logos, colors, or theming.
       Design: `docs/superpowers/specs/2026-08-05-ui-chrome-white-label-overrides-design.md`.
       Change: `add-ui-chrome-white-label-overrides`. Specs:
       `ui-string-overrides`, `admin-app`, `http-api-documentation`.
    The builtin catalogs moved up to `packages/web/src/i18n/catalogs/` in (b),
    one file per area. The admin screen needs every key list, and the
    package forbids an area importing another area.
    c. Catalogs for `admin` and `reporting`: DONE. The retrofit (b) named as
       its next step. Both areas rendered their wording from literals, so an
       operator could override neither, and a German account read English
       screens under German chrome. Adds `i18n/catalogs/admin.ts` and
       `i18n/catalogs/reporting.ts` (each `en` and `de`), a `t(locale, key)`
       wrapper per area, and both names in `BUILTIN_CATALOGS` and
       `OVERRIDABLE_AREAS`, which the UI-strings picker reads. The screens
       take a `locale` prop; the date, duration and percent formatters take
       one too. The reporting area gains its own `describeError`, since the
       shared `errorText` ends in the server's own English string. No schema
       change and no API change: `ui_string_overrides.area` is plain text
       already. Change: `i18n-catalogs-admin-reporting`. Specs: `admin-app`,
       `reporting-app`, `ui-string-overrides`.

14. **Deployment & operations readiness: DONE (a–c).** What shipping to a real
    customer needs beyond a devcontainer. Three independent sub-projects, each
    brainstormed and specced on its own.
    a. Health/readiness endpoints: DONE. Sequenced first because both a Docker
       `HEALTHCHECK` and a k8s-style probe need an endpoint to call, so designing
       the image around one that does not exist yet would reopen the design
       later. Two unauthenticated routes: an unconditional liveness one and a
       readiness one that pings the database.
       Change: `add-health-readiness-endpoints`. Design:
       `docs/superpowers/specs/2026-07-30-health-readiness-endpoints-design.md`.
    b. Production Docker images: DONE. One image for the engine and one
       parameterized image for the frontend, both running non-root.
       Change: `add-production-docker-images`. Spec: `production-docker-images`.
    c. Backup/restore runbook: DONE. Pure ops documentation, no engine or schema
       change: one Postgres database backs an entire environment, so a
       whole-database dump is the backup unit. Deliberately out of scope:
       backup scheduling, point-in-time recovery, and backup-file encryption.
       Change: `backup-restore-runbook`. Spec: `backup-restore-runbook`.
       Runbook: `docs/runbooks/backup-restore.md`.

15. **Observability: DONE.** Outbox backlog, timer latency and the
    faulted-instance rate were visible only by hand through the admin area.
    Scoped to exactly two things — a structured logging convention and a metrics
    endpoint exposing those three signals — deliberately not tracing, and with no
    logging or metrics dependency added.
    Change: `add-observability`. Spec: `observability`. Design:
    `docs/superpowers/specs/2026-07-30-observability-design.md`.

16. **Notifications: DONE (a–b).** Stage 9 excluded notifications on purpose; an
    inbox-only model is a gap for customers used to being pushed to. Delivered as
    one new action handler type on the existing registry, not a new schema
    concept — the five existing action positions already cover "notify on
    assignment" and "notify on reminder". Webhook notification stays a documented
    recipe over `http.request` (stage 5e) rather than new code.
    One test gap is recorded rather than closed: the authenticated-relay path is
    verified by reading only, because no local harness can complete a TLS
    handshake against the engine's own client socket.
    Change: `add-notifications`. Spec: `notification-email-action-handler`.
    Design: `docs/superpowers/specs/2026-07-30-notifications-design.md`.
    **16b, recipient resolution: DONE.** 16a shipped with literal recipients
    only, so a message reached a team or manager mailbox and never the actor
    holding the step. The config now carries a second list, `toActors`, over
    three tokens: `candidate`, `claimant`, `starter`. The handler resolves each
    to an account address and drops an unknown id or a disabled account. Every
    candidate gets the message; a delivery resolving no address sends nothing,
    succeeds, and logs one warning.
    The actor ids reach the handler frozen, on a new `outbox.actors` column all
    three enqueue sites stamp. A delivery-time read would be wrong, not merely
    less tidy: the resolution worker cascades automatic steps without waiting
    for the outbox, so the instance can already sit two steps on. Stage 17 is
    unaffected — an escalation notifies a tier, and a tier is a static address.
    The studio needed a matching widening. A `z.array(z.enum(...))` property
    left `describeConfigSchema`'s supported subset, which drops the descriptor
    for the WHOLE type, so `notification.email` would have lost its generated
    form entirely. Such an array now renders as a checkbox group.
    Change: `notification-recipient-resolution`. Specs:
    `notification-email-action-handler`, `action-handlers`,
    `transactional-outbox`, `studio-plugin-config-form`, `local-user-accounts`.

17. **Escalation pattern: DONE.** Timers were already first-class, but there was
    no documented recipe for "SLA breached → notify a manager / reassign", so
    every customer would reinvent it per process. No new engine capability: a
    non-forcing reminder timer and a longer forcing escalation timer on the same
    step, the latter transitioning into an ordinary step assigned to the next
    tier. The pattern names an action position, not a specific handler, so it
    works with either notifying handler. Delivered as a worked extension of
    `examples/expense-approval.json` plus an end-to-end test.
    Deliberately out of scope: chained multi-tier escalation and a generic
    reusable escalation subprocess.
    Change: `add-escalation-pattern`. Spec: `escalation-pattern`. Design:
    `docs/superpowers/specs/2026-07-30-escalation-pattern-design.md`.

18. **Environment promotion: DONE.** Stage 11 excluded multi-environment
    transport as a product feature and made version numbers environment-local, so
    moving a definition from staging to production was a manual rebuild. Closed
    by a pure UI addition: export a published version to a file, import it in the
    target environment, publish through the existing route. File transport only —
    no live link or stored credentials between environments, keeping promotion an
    explicit human action like publish and migration already are.
    Deliberately out of scope: a direct environment-to-environment push,
    automatic dependency bundling (children are promoted separately, child-first),
    promoting drafts, promoting plans/users/roles/instance data, and a
    cross-database diff.
    Change: `add-environment-promotion`. Spec: `environment-promotion`. Design:
    `docs/superpowers/specs/2026-07-30-environment-promotion-design.md`.

19. **Database seed data: DONE.** A `bun run seed` script publishing the three
    example processes and provisioning one demo account per reserved role,
    idempotent by construction so a re-run changes nothing. It writes only when
    an explicit opt-in variable is set: five fixed-password accounts, one of them
    an administrator, were otherwise a mistyped connection string away from a
    real database.
    Changes: `add-database-seed-data`, `guard-the-seed-script`.
    Spec: `database-seed-script`.

20. **Data retention & deletion policy: DONE.** The runtime record is
    append-only by design, so storage grew unbounded and an erasure request had
    no defined answer. One policy covers both: a retention period counted from an
    instance's completion clears its data automatically, and the same clearing
    runs on demand for one instance when an erasure request arrives first.
    A schema read settled the scope — the append-only audit trail carries only
    structural facts, never a field value, so it needed no change at all.
    The automatic sweep runs only when an operator opts in with a retention
    period; there is no default, since one would start an existing deployment
    erasing data the moment the code ships.
    Deliberately out of scope: per-process retention configuration, erasure of a
    running instance, account-email erasure (stage 10's disable-not-delete
    decision covers it), and data portability/export.
    Change: `add-data-retention-deletion`. Spec: `data-retention`. Design:
    `docs/superpowers/specs/2026-07-30-data-retention-deletion-design.md`.

21. **Reporting & analytics: DONE.** The admin area (stage 10) serves the
    operator — instances, outbox, timers. A process owner wants cycle time,
    bottlenecks and SLA instead: a distinct audience and a distinct data shape,
    so it is its own area behind its own reserved role, implying nothing else.
    Three views, each scoped to one selected process and each computed fresh per
    request with no cache and no aggregation job. Read-only: no schema change, no
    new table, no write route.
    Deliberately out of scope: a cross-process dashboard (a step id means nothing
    across processes), configurable SLA thresholds, and precomputed aggregation.
    Change: `add-reporting-analytics`. Specs: `reporting-analytics-api`,
    `reporting-app`. Design:
    `docs/superpowers/specs/2026-07-30-reporting-analytics-design.md`.

22. **HTTP API documentation: DONE.** The HTTP wrapper had no published contract
    document, needed once a customer's own system integrates against the engine
    directly instead of only through the shipped frontends. Documentation only:
    one hand-written OpenAPI file (`docs/openapi.yaml`) covering the routes a
    customer would actually call. Internal routes serving the admin and studio
    areas stay out. Not a generator — the repo has no schema-to-OpenAPI tool, and
    adding one for a doc-only task on sixteen routes costs more than writing them.
    Change: `add-http-api-documentation`. Spec: `http-api-documentation`. Design:
    `docs/superpowers/specs/2026-07-30-http-api-documentation-design.md`.

23. **Extended task collaboration: DONE (a–c).** The three things stage 9
    excluded from the end-user app, ordered by distance from the engine core.
    Each extends existing capabilities rather than adding a new one, and none
    touches the definition store or the append-only record.
    a. Task delegation: DONE. The current claimant hands a task to a named
       person, who becomes the claimant without joining the permanent candidate
       pool — so releasing it returns the task to the original candidates.
       Change: `add-task-delegation`. Design:
       `docs/superpowers/specs/2026-07-30-task-delegation-design.md`.
    b. Instance comments: DONE. A comment thread on the task screen, visible
       independent of claim state. Stored in its own table rather than as a
       runtime event, because free-form text can carry personal data and the
       append-only record must stay free of it (stage 20).
       Change: `add-instance-comments`. Design:
       `docs/superpowers/specs/2026-07-30-instance-comments-design.md`.
    c. Instance attachments: DONE. Upload, list and download files on an
       instance, stored in Postgres rather than object storage: no new
       dependency, identical on-premise and in SaaS, and covered by stage 14c's
       backup runbook unchanged.
       Change: `add-instance-attachments`. Design:
       `docs/superpowers/specs/2026-07-30-instance-attachments-design.md`.
    Both new tables are cleared by stage 20's redaction.

24. **Multi-tenancy: DONE.** Raised
    2026-07-28, deferred twice as a business decision. Re-brainstormed
    2026-07-30 once that decision was made: the engine must support both a
    shared SaaS deployment and today's on-premise, per-customer deployment,
    from one codebase. Two isolation models were considered and rejected: a
    row-level `tenant_id` column on every table (cheapest, but one missed
    `WHERE` clause leaks one tenant's data into another's response) and
    schema-per-tenant (stronger, but one shared migration run still couples
    every tenant together). The recommended model is one database per tenant,
    reusing stage 11's existing environment-separation convention exactly:
    on-premise stays one deployment, one `DATABASE_URL`, one tenant, unchanged;
    SaaS runs many tenant databases behind one shared `Bun.serve` process, with
    a new control-plane `tenants` table (`id`, `key`, `name`, `databaseUrl`) the
    only new shared state. No table gains a `tenant_id` column and no query
    gains a tenant filter, since every route handler already takes a `db`
    argument the server resolves per request in SaaS mode; `auth_users` needs no
    change either, since each tenant's database already carries its own. Tenant
    resolution reuses stage 7's existing multi-resolver JWT-issuer dispatch.
    Provisioning a new tenant is a CLI action mirroring `src/auth/cli.ts`, not
    self-service. One environment variable (a control-plane connection string)
    turns SaaS mode on; unset, the server behaves exactly as it does today.
    Deliberately out of scope: cross-tenant billing/usage dashboards,
    self-service signup, forced migration of an on-premise deployment into the
    SaaS control plane, and per-tenant quotas.
    The design doc that entry named never reached git: `.gitignore` covers
    `docs/superpowers/`, so no clone carries it. The change's own `design.md` is
    the design of record and is deliberately self-contained.
    Three premises the summary above left open, each settled against the code.
    `db` did not arrive per request: `createServer` built one route table and
    about forty closures captured one handle, as did the resolver, the
    definition-store cache and all three registry factories. The four workers
    polled one handle for the life of the process. And a locally-issued token
    named no tenant, because `LOCAL_ISSUER` is one constant every deployment
    shares.
    `Route.handler` now takes the database as a fourth parameter the dispatcher
    supplies. `startEngine` takes a `TenantSource`, asked per tick, so the
    worker count stays four whatever the tenant count. A local token carries a
    `tenant` claim, and the login request takes its tenant from its host.
    Every db-reading plugin reads `ctx.db` instead of a bound handle. That
    covers `db.list` too, which the proposal missed and the review caught: it
    reads the `data_lists` tables, so a bound handle would have offered one
    tenant's option values to every tenant.
    Change: `multi-tenancy`. Specs: `multi-tenancy`, `http-wrapper`,
    `jwt-authentication`, `local-user-accounts`, `action-handlers`,
    `assignment-strategy-registry`, `data-source-resolution`, `persistence`.

25. **Per-instance step assignment: DONE (a–c)** (design approved 2026-08-02,
    see `docs/superpowers/specs/2026-08-02-pluggable-step-assignment-design.md`).
    Raised 2026-08-01 as a reality
    check on how a user acquires a role a process names. The answer exposed a
    deeper gap: the candidate list is copied verbatim from the frozen definition
    onto every instance, so every instance of a definition carries an identical
    list. That serves "anyone in accounting" and cannot express "the requester's
    manager". It also cannot scope a shared definition per instance — a
    company-wide leave request listing `["dept-a:manager", "dept-b:manager"]`
    lets department B's manager approve department A's request, silently, and
    puts it in their inbox too. No role naming repairs that: any name sits in the
    immutable body, which knows nothing about the instance. Two independent
    pieces are missing — organizational facts (`auth_users` holds email, password
    hash, roles and a disabled flag, no manager and no department) and a path for
    the answer to reach the step. Three OpenSpec changes:
    a. **Role editing in the admin area: DONE.** `PATCH
       /admin/users/:id/roles` behind `system:admin`, plus in-place roles
       editing per row in the admin area's users screen. Closes the CLI-only
       gap stage 10b deliberately left, which becomes untenable once business
       roles multiply. No contract change; independent of (b). The route runs
       over a new `setRolesById`, not the existing `setRoles` this entry and
       the design doc first named: every other `/admin/users*` route keys on
       `user_id`, and the browser never holds an email. `setRoles` stays for
       the CLI, which is also the recovery path the route's one refusal
       assumes — it returns 409 rather than let an actor strip `system:admin`
       from its own account.
       Change: `add-admin-role-editing`. Specs: `admin-user-management`,
       `local-user-accounts`, `admin-app` (all modified).
    b. **Assignment strategy registry: DONE.** Makes a step's assignment strategy
       a plugin like actions and data sources already are: a third registry,
       validated at publish, with the resolver called before the transaction
       opens. `"static"` becomes a registered entry with unchanged behaviour, so
       the change alters no behaviour and needs no migration, and the JSON
       contract is untouched. Deferred to (c), because nothing that ships can
       fail: a resolution deadline, a failure classification, and an
       `assignment.unresolved` event. One known path is recorded in
       `docs/decisions.md` — the subprocess return resolves candidates
       while holding the parent's row lock.
       Change: `add-assignment-strategy-registry`.
       Spec: `assignment-strategy-registry`.
    c. Manager service: DONE. One field on the user (manager → person, a
       pointer, not a tree) edited on the same screen (a) touches, plus a
       built-in `org.manager-of-starter` strategy resolving the manager of the
       instance's starter, which every instance already records. This was the
       first fallible resolver, so it owns the deadline
       (`ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, default 5000), the failure handling
       and the `assignment.unresolved` event (b) deferred. The row-lock question
       (b) left open is answered: the subprocess-return path is bounded by that
       deadline rather than hoisted above the lock, since a hoist's sequence
       re-check must still fall back to resolving under the lock and so makes
       the unbounded hold rarer without making it impossible. A later switch to
       Entra ID or AD replaces only what the strategy asks internally: a
       definition names the strategy, never a storage location, and stage 7's
       JWT resolver already accepts an external issuer. Identity stays
       consistent because the value written into `candidates` is always the id
       the person authenticates with; instances created before such a switch
       keep the old ids, which is a migration concern for the switch itself.
       Change: `add-manager-service`.
       Specs: `manager-of-starter-assignment`, `assignment-strategy-registry`,
       `runtime-events`, `local-user-accounts`, `admin-user-management`,
       `admin-app`.
    Deliberately out of scope across all three, each rejected during
    brainstorming with its reason recorded in the design: a permission store per
    process (two instances of one frozen definition would behave differently on
    data outside the body, breaking versioning, migration pinning and the audit
    record), a role hierarchy such as `dept-all:manager` implying
    `dept-a:manager` (hierarchies broaden, the requirement narrows per instance;
    `src/auth/authorize.ts` already records the no-hierarchy decision, and the
    eligibility check plus the inbox filter would both have to expand identically
    or a step becomes claimable but invisible), a general expression-backed
    strategy computing candidates by CEL over instance data, an automatic
    fallback assignee when resolution yields nobody, re-resolution when someone's
    manager changes mid-instance (delegation already covers the one-off case),
    and the Entra/AD integration itself.

26. **DB-backed data lists: DONE.** A `"static"` data source keeps its option
    list inside the immutable, hashed body, so changing one value costs a
    published version plus a migration for every running instance. Four needs
    converged on one mechanism: business staff editing lists during operation,
    several processes sharing a list, an external system feeding the values, and
    a list too large to belong in a body.
    Adds a second data source type whose values live in engine-owned tables
    instead of the body. This is the type stage 5e's sibling design deferred, and
    it lands first because a database-backed type answers the deferred
    timeout/cache/error questions far more cheaply than an HTTP-backed one.
    Four decisions carry the stage: the declaration stays in the body and only
    the values move, so a body remains self-contained for promotion, diff and
    hashing; the list key is flat, because the body already records which process
    uses which list, so "global vs. process-specific" is the answer to a query,
    not a column; a value an operator retires stays visible to exactly the
    instances still holding it; and no API path ever deletes a value row.
    Publishing deliberately does not read the tables — an existence check would
    make the same body valid or invalid by table contents — so a mistyped key is
    prevented in the studio by a picker plus a warning, never an error.
    A new narrow role maintains the lists, which is what split area entry from
    per-screen checks in the shell.
    Deliberately out of scope: search and typeahead, caching across calls, a
    change history, a separate import endpoint, and CEL-readable data sources,
    which stay a publish error exactly as before.
    Change: `add-db-data-lists`. Specs: `db-data-source-type`,
    `data-list-administration`. Design:
    `docs/superpowers/specs/2026-08-02-db-data-lists-design.md`.

27. **No-code / low-code process authoring: DONE (a–f).**
    Raised 2026-08-03 as the product direction the README and `CLAUDE.md` now
    state: a business analyst builds a process in the studio area without
    writing JSON or CEL. This is a stage, not a rewrite. The studio area already
    covers the structural half — canvas, steps, paths, fields, views, the
    Player, publish, versions — and every gap below is an authoring surface,
    never a contract change.
    **The two words name two different things, on purpose.** No-code is the
    target for the subset the builders cover: an author completes a whole
    process through forms and a canvas, never typing CEL or JSON, and never
    seeing either. Low-code is what stays underneath, permanently: the JSON
    view, the CEL text input and hand-authored bodies remain first-class, for a
    developer and for every case a builder cannot express. The two are one
    product, not two editions, and an author moves between them per field. That
    is also why "no-code" here is never a promise that a process needs no
    developer — it is a promise about one authoring path through one product.
    **The rule that governs the whole stage.** An authoring surface PRODUCES the
    serialized JSON definition; it never becomes a second language beside it.
    Nothing here enters `src/schema/definition.ts`, so `definitionHash`,
    version immutability and migration stay untouched, and a hand-authored body
    stays first-class. The JSON view is the escape hatch and stays reachable
    from every screen a builder covers.
    **Item (e) takes the one exception to that rule, and it is the only one.**
    A form's column count and a field's span describe how a participant's form
    draws. That form draws from the immutable version its instance pinned, long
    after the draft that produced it is gone, so the two keys have to travel
    inside the body. Both are optional and both mean 1, so every stored body
    keeps its `definitionHash` and every published version stays immutable. What
    the rule forbids is a second authoring language beside the JSON definition.
    Two optional presentation keys are not that.
    Five gaps, measured against the code rather than guessed, ordered cheapest
    and most valuable first:
    a. **A plugin config form: DONE.** `panels/shared/PluginEnvelopeEditor.tsx`
       edited every `{ type, config }` position — actions, data sources,
       assignment strategies, a custom field type — as a free-text `type`
       input beside a raw JSON textarea. A typo in either surfaced only at
       publish. `GET /registry` (`src/http/studio-routes.ts`) now also
       carries a browser-consumable config-schema description per registered
       type, built by a new bespoke converter
       (`src/engine/config-descriptor.ts`) rather than a hand-written
       descriptor or a generic JSON-Schema library — the design weighed both
       and rejected them. The action, data-source and assignment-strategy
       positions now offer a type picker plus a generated form with inline
       per-field validation, for any type whose schema the converter can
       represent; a type it cannot (a cross-field `.refine()`, a nested
       object, `z.unknown()`) keeps the raw JSON path, same as before, with a
       manual JSON escape hatch available even for a schema-backed type. The
       custom field-type position stays free-text, since no registry backs
       it.
       Shipping this exposed an open question, since answered in (f): the
       studio area sat behind one coarse role. `system:developer` reached
       drafts, the registry, migration planning and the Player alike, and
       publishing needs `system:publish` on top. A business analyst authoring
       a process is exactly the actor that role was not shaped for.
       Change: `studio-plugin-config-form`. Specs: `studio-plugin-config-form`
       (new), `studio-tools` (modified: `GET /registry`'s response shape, the
       Tools screen's registered-registry count).
    b. **A condition builder over CEL: DONE.** `panels/shared/ExpressionInput.tsx`
       was one text input writing `{ lang: "cel", src }`, so a business analyst
       could not author a path guard at all. The two condition sites — the path
       guard and the three view overrides — now open on a flat row builder with
       one joiner, over a picker built from the field catalog and the pinned
       expression context. `TimersPanel` and `FieldExpressionMapEditor` keep the
       text input, since a deadline must infer to `string` and an
       `Action.output` value reads `result` alone.
       Read-back is by parse, as the design predicted: `parse(src).ast` carries
       a `range` per node, so a fragment the builder cannot represent slices out
       of the original source and opens as a raw row, and one macro no longer
       costs the whole guard. The sidecar was rejected for the reason recorded
       here. Nothing persists the row model, so a later grouping level changes
       the reader and writer alone; two rules keep that open, no sidecar and
       write-only-on-a-real-edit. `src/` gained two exports and no behavior
       (`parseAst`, and `export` on `ACTOR_SCHEMA`), so the CEL library keeps one
       version pin. Grouping and date ordering stay deferred. Field-against-field
       comparison no longer is, scoped to `field.validation.rule` alone:
       `studio-canvas-first-form-builder` reopens it there, narrowly.
       `ConditionBuilder` itself, and its other two sites (path guards, view
       overrides), keep literal-only comparison. `field.validation.rule`'s own
       authoring surface is a separate row builder over the same parse-back
       pattern, `RuleBuilder`/`RuleInput`, not `ConditionBuilder` reused: its
       default operand ("this answer," the field's own key) and its
       field-against-field row have no counterpart on a guard or an override.
       Change: `add-condition-builder`. Specs: `studio-condition-builder` (new),
       `cel-expressions` (modified: an authoring surface reaches the AST through
       the engine's own CEL module).
    c. **Migration-plan authoring without JSON: DONE.** Stage 11 shipped a
       `MigrationSpec` textarea on purpose, since no field-by-field form
       existed to extend and the server owns validation. The migration-plan
       screen now carries a Mapping/JSON toggle. The Mapping side
       (`panels/MigrationSpecEditor.tsx`) offers both versions' catalogs as
       pickers over all five `MigrationSpec` keys, labelled by `key` and
       `label` rather than by raw id. It reads both bodies through the
       existing `getVersionBody` call, so nothing in `src/` changed: no
       route, no schema, no engine code. Three rules the browser can
       evaluate report inline before the save (a non-injective `fieldMap`, a
       `fieldMap` pair whose CEL types disagree, the reserved cancel-sink as
       a target); the server keeps every check it had. A row whose id no
       catalog declares is kept and marked, never dropped, so a
       hand-authored plan round-trips unchanged. The JSON textarea stays as
       the escape hatch, and the orphan-key dry run is untouched. Stage 27's
       read-back problem does not arise here: a `MigrationSpec` is
       structured data, not a language, so the form holds the same object it
       writes.
       Change: `studio-migration-plan-field-mapping`. Spec:
       `studio-migration-plan-form` (new).
    d. **Process templates: DONE.** Nothing seeded a new process; an author
       started from an empty draft every time. The studio already copied a
       body — `processListLogic.ts::seededDraftInput` reads a published version
       and strips the compile pass's cancel-sink injection — but every call
       site handed it the source process's own id, so it produced the next
       version of one process rather than a new one.
       The two questions this entry recorded are answered. Templates live in
       their own `templates` table, for the reason drafts have one: a template
       row in `definitions` would make every reader of that table responsible
       for excluding it, and one missed reader puts a template in the
       participant's start list. A seventh reserved role curates them,
       `system:templates`, mirroring stage 26's `system:datalists` including
       its read asymmetry — reads also accept `system:developer`, so the start
       picker works for every author.
       Seeding adds no route. The browser reads the template and writes an
       ordinary draft through the existing `PUT /drafts/:processId`. A
       template is a snapshot: nothing records which process came from which
       template, and a later edit changes no draft already seeded from it.
       Admitting the new role into the studio area widened its entry, so the
       area gained the per-screen `ROUTE_ROLE` map the admin area already had.
       That answers half of what (a) left open: splitting `system:developer`
       is now a change to that map rather than new machinery.
       Deliberately out of scope: built-in templates seeded by `bun run seed`,
       template versioning, a record of which process came from which
       template, and permissions per template.
       Change: `add-process-templates`. Specs: `process-templates` (new),
       `authorization`, `unified-shell`, `studio-app`, `database-seed-script`
       (all modified). Design:
       `docs/superpowers/specs/2026-08-05-process-templates-design.md`.
    e. **Form layout and a visual form editor: DONE.** A step's view was an
       ordered list of override rows with `↑`/`↓` buttons
       (`panels/ViewEditor.tsx`), and a form drew one stacked column with no
       way to say otherwise. An author read field names to picture a form.
       `View` now carries `columns` and `ViewField` carries `span`, both
       optional `1 | 2` and both layout only. Neither reaches a guard, a CEL
       context or a submission check. `FieldForm` draws the grid, so the Player
       and the participant's Task screen get one renderer and one collapse
       threshold. `ViewEditor` is gone. The step's View entry now opens
       `panels/FormEditorDialog.tsx`: a palette of unplaced catalog fields, a
       canvas drawing the form at its column count, and a strip editing the
       selected card. Drag reorders the view array, and move-up/move-down make
       the same change without a pointer.
       This is the stage's one entry into `src/schema/definition.ts`, for the
       reason recorded above. `test/view-layout-hash.test.ts` pins each
       `examples/` body to the `definitionHash` it had before the two keys
       existed.
       Deliberately out of scope: a third column count, a per-group column
       count, and any publish-time rejection of a span wider than its form —
       that clamps at render time instead, since the two keys change
       independently.
       Change: `view-layout-and-form-editor`. Specs: `studio-form-editor`
       (new), `form-ui`, `runtime-api`, `studio-canvas`, `studio-player` (all
       modified).
    f. **A role for the author, split from the developer's: DONE.** Item (a)
       left the question open and (d) paid most of its cost by adding the
       studio area's per-screen `ROUTE_ROLE` map. `system:author` is the
       eighth reserved role. It admits the four authoring screens — the
       process list, the editor, the versions screen and the player — plus
       the routes behind them: the four draft routes, publish (beside
       `system:publish`, which does not move), `GET /registry` and the two
       template reads. Migration planning and the Tools screen stay
       `system:developer` alone.
       Two routes outside the studio prefix widen with it, because studio
       screens call them: the data list read that fills the `"db.list"`
       picker, and the record read beside the Player for an instance the
       actor started. Neither data list write moves, and the record read
       keeps its starter condition.
       `GET /registry` widens while the Tools screen does not. The route also
       feeds the inspector's plugin-config form, which is what lets an author
       configure an action without JSON.
       A widening throughout: every account holding `system:developer`
       reaches exactly what it reached before.
       Change: `split-studio-role-gate`. Specs: `authorization`,
       `unified-shell`, `studio-app`, `studio-tools`, `studio-player`,
       `process-drafts`, `process-templates`, `process-version-inspection`,
       `studio-publish`, `data-list-administration`, `database-seed-script`
       (all modified).
    Deliberately out of scope: a natural-language or AI-assisted authoring
    surface (it produces the same JSON, so it is a later surface over the same
    contract, not a reason to reshape one), executable code authored in the
    browser (actions stay declarative handler references, per the contract),
    and relaxing any v1 boundary — no parallelism arrives because a canvas
    could draw it.

28. **Zod v4 migration: DONE.** Dependabot opened a major-version bump
    (zod 3.25.76 -> 4.4.3, PR #9) 2026-08-09 alongside a batch of otherwise
    routine dependency PRs. v4 restructured Zod's internal API — the `_def`
    shape, `AnyZodObject`, `ZodTypeDef` — and `src/schema/definition.ts` is
    the JSON contract itself, built directly on those internals. Per this
    project's own contract rule, that needed its own OpenSpec change rather
    than a merged dependency PR.
    The bump is pinned exactly, in the engine root and `packages/web`, and
    ranged as a `peerDependency` in the source-only `packages/form-ui`. That
    closes a gap the spec already stated: `development-toolchain` required an
    exact pin on a dependency the contract rests on, and named only the CEL
    library. `definitionHash` is the JCS hash of the PARSED body, so a zod
    release that emits one key more or fewer changes the identity of an
    already-published version. `test/view-layout-hash.test.ts` was the gate,
    and all three example bodies kept their hashes.
    Measured, not predicted: 43 errors on the bump, 13 of which came from one
    annotation. `fieldDef` carried v3's three-parameter `ZodType<Output, Def,
    Input>`; v4's third parameter is `Internals`, so the array of fields
    inferred `unknown[]` and the error surfaced in `src/cel/check.ts`,
    `src/cel/eval.ts`, `src/engine/migration.ts`, `src/engine/outbox.ts` and
    `src/runtime/api.ts` — files that read no Zod internal at all. Correcting
    the one annotation cleared all thirteen.
    One behavior widened, deliberately. `refine` returns `this` in v4, so a
    refined config schema stays a `ZodObject` and now yields a generated form
    where v3 sent it to the studio's raw JSON textarea. The form still
    describes per-field rules alone; the cross-field rule runs at publish.
    `describeConfigSchema` also stopped dispatching on `instanceof`, since
    `z.email()` is a `ZodEmail` that answers `instanceof z.ZodString` with
    false while reporting `type: "string"`.
    Change: `migrate-to-zod-v4`. Specs: `development-toolchain`,
    `studio-plugin-config-form` (both modified). Design:
    `docs/superpowers/specs/2026-08-10-zod-v4-migration-design.md`.

29. Table-shaped data sources: DONE. Change: `table-shaped-data-sources`.
    A data list declares extra columns on itself, not in a process body, so an
    operator makes a list table-shaped with no publish and no migration. Each
    column carries a `key`, an operator-facing `label` and a scalar `type`
    (`string`/`number`/`boolean`); `MAX_DATA_LIST_COLUMNS` is 10. A value fills
    one attribute per declared column, and `"db.list"` carries them onto each
    resolved `FieldOption` as an optional `attributes` map, built by walking
    the DECLARATION rather than the stored jsonb (Postgres normalizes a jsonb
    object's key order, so the stored order is not the operator's).
    `db.list`'s `configSchema` stays `{ listKey }` alone.
    The four open questions the stage raised are answered. The columns are
    free-form per list rather than a fixed set; the picker folds each attribute
    into the `<option>`'s own text, because a native `<option>` carries one
    text run and that text is its accessible name; it is a generalization of
    `db.list`, not a sibling type. The fourth, which the queue file added and
    which decided the size: a consuming field reads the WHOLE row, and
    `FieldDef.columnMapping` (column key -> target `FieldId`) writes mapped
    attributes into ordinary catalog fields at submission and at creation,
    before the transition commits, so a guard on the same hop reads
    `data.<key>`. That reaches no CEL namespace: the data-source deferral in
    `docs/decisions.md` stands, and a mapped value is an ordinary field value
    by the time a guard sees it. Seven publish-time invariants bound a mapping
    (`compile.ts::checkColumnMapping`, the seventh structural check). A mapped
    target takes the mapped value over a submitted one and over the view's
    readonly/visibility rules — the list owns a mapped field. An attribute
    whose type does not match its target is dropped, not written, and recorded
    as the twelfth `InstanceEvent` kind, `datasource.attribute-dropped`; the
    submission still succeeds, the rule `Action.output` already takes.
    `commitManualTransition`/`executeManualTransition` gained one optional
    trailing `events` argument so that drop lands in the commit's own
    transaction. No studio work: `draft/validation.ts` calls the engine's own
    `compileProcessBody`, so the new invariants reach the checks rail with no
    browser-side code, and the no-code `columnMapping` editor waits behind
    stage 36's hold on `panels/EditPanelsModal.tsx`. Specs: `db-data-source-type`,
    `persistence`, `data-list-administration`, `definition-contract`,
    `data-source-resolution`, `runtime-api`, `runtime-events`, `form-ui`,
    `admin-app` (all modified).
    The browser check earned its place twice, and both findings were invisible
    to a green suite. The problem list under the value editor was keyed by the
    message string, and two blank columns emit the same sentence twice: the
    duplicate React key broke reconciliation, so stale entries stayed on screen
    while Save re-enabled from the same render. A production build strips
    React's duplicate-key warning, so the console said nothing. It is keyed by
    position now. And the values table grows one column per declared column,
    which took the page to 1861px of horizontal scroll at the bound on a
    1100px window; `.admin-table-scroll` contains it, and the page is back to
    the 152px baseline every admin screen shows in German at that width.
    The stage's deferred builder shipped on 2026-08-14 as
    `column-mapping-editor`. The field catalog now edits `columnMapping`
    without the JSON view: one row per mapped column, a picker over the bound
    list's declared keys, and a picker over the catalog. The editor appears
    only for a `select` field bound to a `"db.list"` source. Two of those
    conditions are `checkColumnMapping`'s own; the `db.list` narrowing is the
    editor's, since no other source type declares columns to pick from.
    It validates nothing. `draft/validation.ts` runs `compileProcessBody`, so
    all seven rules already reach the checks rail, and a duplicate target
    reaches it rather than a disabled control. A key the list no longer
    declares keeps its row and takes a mark, the same state the detail route
    reports. `useDataLists` in `panels/shared/` is the one read behind both the
    key picker and the column picker, in the shape `useRegistry` beside it
    already took. Specs: `studio-column-mapping-form` (new), `studio-app`
    (modified).
    The stage's first open question is answered, by `report-column-usage` on
    2026-08-14. The detail route's usage report now names the column keys each
    process maps, and the screen shows them beside the process. The removal
    warning names the published processes that map a dropped column, which is
    the moment the report changes a decision. Two properties decided the shape.
    The keys sort, because `columnMapping` lives inside the jsonb body and
    Postgres normalizes a jsonb object's key order — stage 29's own defect,
    which it answered by walking the declaration. And a key the list no longer
    declares reports: `checkColumnMapping` runs seven rules and none checks a
    key against a declaration, so a mapping outliving its column is exactly
    what the report exists to surface. `referencingProcesses` keeps both
    callers, so the guard reads bodies it discards rather than a second copy of
    the `EXISTS` clause deciding what a reference is. Specs:
    `data-list-administration`, `admin-app` (both modified).

30. **Canvas edge routing styles (step/smoothstep): DONE.** Raised
    2026-08-10 in conversation. The canvas draws every Path as a straight SVG
    `<line>` between two fixed anchors (`canvas/CanvasView.tsx`); an author
    asked for the orthogonal routing React Flow's edge-types example calls
    `step` and `smoothstep`. Brainstormed to this point, not yet a design doc:
    one canvas-wide toolbar toggle, not per-Path; two styles only, no straight
    option, default `step`; the choice persists as a reserved key
    (`layout.canvasEdgeStyle`) inside the existing opaque `layout` jsonb blob,
    the same round-trip `saveState.layout` already uses for node positions, so
    it needs no schema or API change. The routing geometry stays an open
    question, not a decision. A custom 3-segment path function was sketched
    during brainstorming. An existing connector-routing library may cost less
    than hand-rolled math, so the design phase must weigh one against the
    other before either lands. `libavoid-js`
    (https://github.com/Aksem/libavoid-js), a WASM port of libavoid's
    orthogonal connector routing with obstacle avoidance, is one candidate;
    nothing here commits to it. Pure `canvas/` presentation, per the UI
    glossary rule that "edge" never means anything outside that layer.
    Shipped 2026-08-13 as `canvas-edge-routing-styles`. The geometry question
    resolved to hand-rolled, and the user made that call. `libavoid-js` is a
    beta at `0.5.0-beta.5`. It unpacks to 813 KB of WASM against a 712 KB
    bundle, and it buys obstacle avoidance alone. Its LGPL-2.1-or-later licence
    suits this repository's AGPL-3.0, so the licence was not the objection.
    `routeEdge` in `canvas/geometry.ts` runs to about forty lines.
    The segment count reads off BOTH axes, which the review caught. A target
    ahead on the same row takes one segment, and that is the common case:
    `autoPlaceSteps` puts a linear chain on one row. A target ahead on another
    row takes three. A target that is not ahead takes five, and it dips below
    when both anchors share a row. `smoothstep` returns the same points and
    rounds each corner, clamped to half the shorter segment. The style persists
    at `layout.canvasEdgeStyle`. An absent or unknown value renders as `step`.
    The change's own `design.md` is the design of record for stages 30 to 33.
    Git ignores `docs/superpowers/`, and stage 24 already lost a design there.
    Change: `canvas-edge-routing-styles`. Spec: `studio-canvas`.

31. **Custom and floating canvas edges: DONE.** Raised 2026-08-10 in
    conversation, alongside stage 30. The anchors were fixed then: every Path
    left a step's right-middle and entered the target's left-middle, even when
    the target sat above, below, or left of the source. React Flow's
    "floating edges" example computes the anchor from the angle between the
    two node centers instead, so each node's border point actually faces the
    other node. React Flow's "custom edges" example renders arbitrary content
    along an edge, not only a stroke; here that could mean a delete or insert
    affordance on the edge itself, beyond today's guard-label and priority
    badges. Designed 2026-08-13, in `canvas-edge-routing-styles`'s
    `design.md`. The anchor snaps to the midpoint of the side facing the
    target. The larger of the two centre offsets picks that side. A
    free-angle border point suits a straight edge and fights an orthogonal
    one, because a segment leaving at 37 degrees has no clean turn. `routeEdge`
    gains the axis each anchor leaves on, and the routing itself does not
    change. This design deferred the stage's second half, the affordances
    drawn on the edge. The inspector deletes a path already, and a control on
    the edge is a second way to do one thing.
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
    The stage's second half stayed open after the anchors shipped. An
    objection stood against a delete affordance on the edge, recorded above:
    the inspector deletes a path already, and a control on the edge is a
    second way to do one thing. That objection covered delete. It never
    covered insert — neither a panel nor a canvas gesture put a step onto a
    path. Shipped 2026-08-17 as `canvas-edge-affordances`: a step dropped
    from the edit rail onto a rendered path now lands inside it. The source
    step's path retargets to the new step, keeping its id, key, guard and
    priority; the new step takes one path to the old target, inheriting the
    retargeted path's trigger alone. The path under the pointer draws in a
    drop-target stroke for the length of the drag, and that stroke is the
    whole affordance — the canvas gains no permanent control on an edge. No
    delete affordance shipped on the edge, on purpose: the objection above
    still holds for delete, and this change weakens no part of it. Change:
    `canvas-edge-affordances`. Spec: `studio-canvas`.

32. **Shape per step/path kind on the canvas: DONE.** Raised 2026-08-10 in
    conversation, alongside stages 30 and 31. The ask spans both node and
    edge, in this repo's own vocabulary (`.claude/rules/ui-glossary.md`):
    Start and End are step properties (`workflow.initialStep`,
    `step.terminal`) and Subprocess is a step type (`stepType`,
    `src/schema/definition.ts:198`), so all three are node shapes; "a step
    with an automatic path" reads off `Path.trigger`, an edge property. Today
    every node draws as the same rectangle regardless of kind. Initial and
    terminal steps get a small stamp overlay (`canvas-initial-stamp`,
    `canvas-terminal-stamp` in `app.css`); a subprocess step gets no marker at
    all, identical to a task step. An automatic path already renders as a
    solid stroke against a manual path's dashed one
    (`canvas-edge-automatic`/`canvas-edge-manual`), so that half of the ask
    already has a baseline, just not a distinct shape. Designed 2026-08-13, in `canvas-edge-routing-styles`'s
    `design.md`, and not yet built. The stage reads as four asks and reduces to
    one gap. An initial step and a terminal step carry stamps already. An
    automatic path draws solid against a manual path's dashed stroke. Only the
    subprocess step is indistinguishable from a task step. It gains an inset
    second rule inside its rectangle: radius 0, and no new colour role.
    Shipped 2026-08-13 as `canvas-subprocess-step-shape`. The rule sits at
    `x=4, y=4`, `NODE_WIDTH - 8` by `NODE_HEIGHT - 8`, under
    `.canvas-node-subprocess`: `fill: none`, `--color-border`, and the 1px
    hairline against the outer rule's 1.5. It reads the doubled border BPMN
    draws on a call activity, and no new token.
    Two facts came out of the review and the browser rather than the design.
    The rule's right edge at x 176 overlaps the connect handle's own circle,
    which spans 173 to 187. Paint order settles it: the rule draws before the
    label, the key, the stamps and the handle, so every one of them covers it.
    And the identity section's three-way "performed by" control cannot express
    a step that is terminal AND a subprocess. That combination is reachable
    from the JSON surface alone, which is where the browser check authored it.
    No pure function decides the marker. `step.type === "subprocess"` is a
    field read, and `studio-canvas`'s "Eight computations" requirement names
    its own members. The rendering claim lives in `docs/browser-checks.md`.
    Change: `canvas-subprocess-step-shape`. Spec: `studio-canvas`.

33. **Editable edges with draggable control points: DONE.** Raised
    2026-08-10 in conversation, alongside stages 30 through 32. An author
    drags a point on a Path's route to bend it around an obstacle, the way
    React Flow's editable-edges example lets a control point move. Path
    carries no waypoint field and none is proposed here; per the contract
    rules a hand-drawn route is presentation, so it belongs in the opaque
    `layout` blob, keyed per Path id, the same way stage 30's
    `layout.canvasEdgeStyle` and today's per-step positions already live
    there without a schema change.
    One open tension stage 30 already decided the opposite way: that stage
    picked one routing style for the whole canvas, not per Path, precisely to
    avoid per-edge state. A dragged control point is per-edge by nature, so
    the design must say whether dragging one edge silently opts it out of the
    canvas-wide style, and what a reset back to that style looks like.
    Designed 2026-08-13, in `canvas-edge-routing-styles`'s
    `design.md`, and not yet built. The tension resolves when a waypoint feeds
    the route rather than escaping it. `routeEdge` runs once per consecutive
    pair, and the canvas-wide style governs every one of those segments. A bent
    edge is still a `step` edge. No path carries a style, so stage 30's
    decision stands. Waypoints live at `layout.waypoints[pathId]`. Reset
    deletes that list and the edge returns to the direct route, so nothing
    stores what the route was before.
    Shipped 2026-08-13 as `canvas-edge-waypoints`, and with it the last of
    stages 30 to 33. A path may carry `layout.waypoints[pathId]`, the second
    reserved key in that blob. A selected path draws a filled square per
    waypoint and an outlined one at the route's midpoint. Dragging the
    outlined square inserts, dragging a filled one moves, and a double-click
    deletes. The last delete restores the direct route, which is the whole of
    reset.
    The anchors face the first and the last waypoint rather than each other,
    so an edge dragged over a step leaves the top side. A path with no
    waypoints takes `routeEdge` untouched and draws as it drew before.
    The review earned its place on the insert index. `midpointOfRoute` returns
    an index into the drawn polyline's segments, and one leg draws as one or
    two of them, so that index names nothing in the waypoint list.
    `routeThroughWaypoints` returns `legStarts` beside its points, and the
    insert reads the leg off that.
    The browser earned its place twice, and both findings were invisible to a
    green suite. A handle without `panzoom-exclude` never sees its own press:
    Panzoom stops propagation at `.canvas-wrap`, and React listens at the
    root. The canvas panned instead. And running `routeEdge` per leg, which is
    the design of record's own sentence made literal, drew a 20-unit spike out
    of every bend: that function's gutter clears the node an anchor sits on,
    and a waypoint has no box to clear. A leg carries no gutter now, and a
    test pins it.
    Change: `canvas-edge-waypoints`. Spec: `studio-canvas`.

34. **Selection grouping (group/ungroup nodes): DONE.** Raised 2026-08-10
    in conversation. An author selects several steps at once and groups them
    into one movable, collapsible unit, the way React Flow's grouping example
    turns a multi-selection into a parent group node, and later ungroups it.
    Node, not edge, unlike stages 30 through 33; it shares only the same file
    and the same "presentation, not contract" pattern.
    A prerequisite gap: today's canvas selects one step at a time
    (`selectedStepId: string | undefined` in `canvas/CanvasView.tsx`), with no
    marquee or shift-click multi-select. That has to exist before grouping
    does. No v1 FSM concept changes: a group is an organizational device on
    the canvas, not a new runtime concept, and the hard v1 boundary against
    parallelism stays untouched. Group membership is presentation only, so it
    fits the opaque `layout` blob beside the other canvas-only state (node
    positions, and stages 30/33's proposed edge style and waypoints), not
    `src/schema/definition.ts`. No design doc, no OpenSpec change yet.
    Two changes, ranked apart on 2026-08-13. The multi-select prerequisite
    ships first and on its own, ahead of stages 30 through 33 rather than
    behind them. It is the interaction state every other canvas stage edits by
    hand: stage 37 rounds one node's position on release, and stages 31 and 33
    attach handles and control points to one selected element. Each assumes a
    single selected id today, so landing multi-select last rewrites all of
    them. It also earns its keep alone, since multi-move and multi-delete come
    with the selection set. Grouping stays the second change and runs after the
    edge work. The stage keeps one number: this splits the delivery, not the
    scope.
    The first delivery landed 2026-08-13 as `canvas-multi-select`. The canvas
    now holds `selectedStepIds: string[]`. A shift-click toggles a step, a
    shift-drag draws a marquee that selects on overlap, a drag on any member
    moves the whole set, and a set of several swaps the third column to a count
    and a Remove steps control. Three rules live in `canvas/selection.ts` as
    pure, tested functions: the toggle, the corner sort, and the overlap test.
    Two Panzoom facts shaped the gesture. Its down-handler stops propagation at
    `.canvas-wrap`, so the marquee starts on `onPointerDownCapture` rather than
    on a bubble-phase handler that never runs. And it binds `up` on `document`,
    so the marquee takes pointer capture and restores `disablePan` on lost
    capture too — a release outside the SVG would otherwise leave the canvas
    unpannable. The deltas landed in `studio-canvas` and `studio-checks-rail`.
    The second delivery landed 2026-08-14 as `canvas-step-groups`. A group
    lives at `layout.groups`, the third reserved key in that blob. Its box is
    its members' bounding box plus a margin, and it has no position of its
    own: dragging the box moves the members, and the box follows them. A
    collapsed group draws at the node size, hides its members, and becomes the
    anchor every path from outside ends on. A path between two hidden members
    does not draw. Ungrouping leaves every step and every path as it was.
    The canvas gained no selection state. Clicking a box selects exactly its
    members, so every rule that reads `selectedStepIds` kept working, and the
    third column's existing summary carries the group's own controls.
    `anchorSideToward` and `routeThroughWaypoints` now read a size, defaulting
    to the node's. `canvas-floating-anchors` predicted that generalization in
    its own risks: the rule takes two rectangles, and a group's box
    substitutes for a node's.
    The review earned its place on that seam. A size on the anchor rule alone
    would never have arrived, because `routeThroughWaypoints` is the one
    function the canvas calls per path. It also found two hit tests reading
    every step regardless of visibility, which would have let a marquee select
    a hidden member and a connect drag drop a path onto one.
    The browser found what no test could. `fill: none` leaves only a rect's
    stroke hit-testable, so a grab inside an expanded box reached the canvas
    beneath it. The group's name is the handle now, and the interior stays the
    canvas's, which is what keeps the marquee usable over a group.
    Changes: `canvas-multi-select`, `canvas-step-groups`. Spec: `studio-canvas`.

35. **Starter access to a started instance: DONE.** Raised 2026-08-12 in
    conversation, as the question of whether a process instance records who
    started it. It does, and the read access the question asked for already
    holds. What is missing is the list.
    `Instance.startedBy` is optional in the contract
    (`src/schema/definition.ts`) and `createProcessInstance` writes the
    calling actor's id into it (`src/runtime/api.ts::createProcessInstance`).
    A subprocess spawn passes `startedBy: undefined` on purpose
    (`src/engine/subprocess.ts`), since a child instance has no human starter.
    `loadInstanceForActor` (`src/runtime/api.ts::loadInstanceForActor`)
    already admits a
    non-admin caller who is the starter, the current claimant, or an eligible
    candidate on the current step. So the starter reads the instance view for
    the whole run, including after the step moves to somebody else. Two other
    rules key on the same field: only the starter or an admin cancels an
    instance (`api.ts::cancelInstance`), and a step carrying no assignment
    accepts a submission from the starter or an admin alone
    (`api.ts::submitAndTransition`).
    The gap is discovery. `GET /instances` carries a `startedBy` filter
    (`src/http/routes.ts::handleListInstances`), but `parseScope` defaults to
    `scope=all`,
    which demands `system:admin`. The only other scope is `scope=mine`, and
    that one forces `assignedTo = actor.id` plus the actor's roles. A
    participant therefore reads an instance they started when they hold its
    id, and finds it nowhere. The app area matches: `TasksScreen` lists
    assigned tasks, and no screen lists started instances.
    Three questions the design owes an answer. Whether the scope is a third
    value beside `mine` and `all` or a separate filter, since `scope=mine`
    already means "assigned to me" and must keep meaning it. Whether the
    starter's access stays read-only, which it is not today — the comment and
    attachment routes share `loadInstanceForActor`'s predicate, so a starter
    already writes both. And
    whether a started list shows completed and cancelled instances, which the
    task inbox does not.
    The change answered all three. The scope is a third value, `scope=started`,
    because relaxing the role check for a self-referential `startedBy` would
    put an authorization rule inside a filter parameter. The starter's access
    is unchanged, which is the answer rather than a decision: this adds a way
    to find an instance and no rule about what a finder may then do. And the
    list carries every status, since a finished case is the common answer to
    "what became of the thing I sent".
    `instance-query` took no delta after all. Its spec already states the
    `startedBy` filter as conjunctive and role-free, and the engine changed
    nothing, so a delta there would have restated existing behaviour.
    `/app/started` and its `StartedScreen` carry the list. It is a register,
    not a second inbox: no filter, no sort, no grouping. `app.css` gained the
    three stamp tones it lacked, matching the four roles the admin badges
    already carry.
    Change: `starter-instance-list`. Specs: `http-wrapper`, `end-user-app`.

36. **Panels screen: DONE.** Change: `studio-panels-screen`. Raised
    2026-08-12 in conversation, and held until somebody took its visual
    decision. That session ran on 2026-08-14 through
    `/frontend-design:frontend-design`. It put three directions to the user: a
    rail-only rework, a canvas drawer, and the routed screen. The user took the
    routed screen.
    One finding decided it. The overlay hid the checks rail while an author
    edited field keys and data source keys, and those two produce most of what
    that rail reports. The rail entry showed a count per view, and that number
    stood in for the list behind the backdrop. A screen frees a column for the
    rail.
    Two smaller facts agreed. `openPanel` was `useState` in `EditScreen.tsx`,
    so no link reached a view, Back did not close it, and a reload landed on
    the canvas. And the dialog measured `min(72rem, 92vw)` by `88vh`, paying
    for a backdrop over what nobody could see. Stage 27e had already answered
    the same question for the form editor by routing it.
    The three views now sit at `/processes/:id/edit/panels/:view`. `panel`
    rides the `edit` route as an optional field beside `formStepId`, the shape
    `routing.ts` already called a sub-state rather than a sibling route. An
    unrecognized view falls through to the plain edit match, so a typo lands on
    the canvas.
    Both properties the stage fixed survive. All three views stay mounted and
    `hidden` shows one, so `ContractPanel`'s half-typed outcome name and
    `DataSourcesPanel`'s fetched list keys outlive a switch. And the screen
    carries no Save: every panel writes into the in-browser draft, and the edit
    screen's toolbar persists it.
    The review earned its place twice. `canvas/EditRail.tsx` imported
    `PANEL_VIEWS` from the module this change moved, and no task named that
    file. And nothing gave the new screen a height rule: the dialog's `88vh`
    does not survive, and item 1 had already archived a whole pass because this
    screen did not grow into its height.
    The apply found what the review could not. `EditRail`'s `fields` prop
    existed only to feed its own count, and `panelEntityCounts` in
    `draft/panel-rail.ts` now serves both rails. The two had disagreed: the
    canvas rail counted `draftFields`, which keeps a field carrying no id,
    while the screen counted rail rows, which drop one.
    The three panels keep their internals. `FieldCatalogPanel` is 230 lines,
    `DataSourcesPanel` 103, `ContractPanel` 111, and none of them moved. That
    is the larger option `tmp/open-work-priority.md` sizes on its own.
    Specs: `studio-app`, `studio-checks-rail`, `studio-form-editor` (all
    modified). `.claude/rules/ui-glossary.md` carries the renamed term: the
    edit panels modal is the panels screen.

37. Canvas nodes snap to the grid: DONE. Change: `canvas-grid-snap`.
    A dragged step, a dropped step and the in-flight drag preview all round to
    a 20-unit lattice through one `snapToGrid` in `canvas/geometry.ts`. All
    three round, so the node under the pointer is the node the author gets: the
    preview never calls `onMoveStep`, so rounding at the write path alone would
    have left it unrounded and jumping on release.
    The grid question got the harder of its two answers. `.canvas-wrap` now
    takes its `background-size` and `background-position` from three custom
    properties, which `CanvasView` writes on every `panzoomchange` from the
    event's own `detail`. The dots therefore track the scale and the pan, and a
    node released on a dot lands on that dot at any zoom. The grid stays
    painted on the wrap for the reason it always was, and the wrap still holds
    still; what changed is that it is now told what the transform is. An author
    works at the fit scale, rarely 1, so a snap measured against a fixed 20px
    grid would have lined up with nothing they could see.
    The four constants are reconciled rather than left disagreeing.
    `ROW_HEIGHT` went 110 to 120 and `NODE_HEIGHT` 64 to 60, so all four sit on
    the lattice and no auto-placed step shifts on its first drag. No step size
    both matched the drawn 20px dots and divided the old four: 10 divides 240,
    180 and 110 but not 64.
    The review pass earned its place on one finding. `studio-canvas-fit.test.ts`
    fixes its graph box by hand, with a comment deriving the height from the two
    constants. That box is an input to `computeFit`, so the suite would have
    stayed green while the fixture quietly stopped describing the layout it
    names. Corrected, along with the one hand-worked expectation the height
    feeds. `CLICK_THRESHOLD` and its comparison moved to `geometry.ts` as
    `exceedsClickThreshold`, so the ordering the snap depends on — threshold
    first, rounding second — has a test rather than only a comment.
    Presentation throughout. Position stays in the opaque `layout` blob, so no
    schema, no hash and no published body moves. Specs: `studio-canvas`
    (modified).

38. Automatic canvas layout: DONE. Change: `studio-canvas-auto-layout`.
    Raised 2026-08-15 in conversation, proposed and archived the same day.

    The roadmap's own branch condition did not survive a real run. It held
    that `d3-dag` v1's `graphConnect` might throw on a cycle, and that a
    throw would decide the library in `@dagrejs/dagre`'s favor. Neither
    `graphConnect`/`sugiyama()` nor `dagre.layout()` threw, tested against
    the real cyclic edge lists from `expense-approval.json` (one back
    edge) and `purchase-requisition.json` (four back edges), inside an
    isolated scratch package outside this repo's workspace glob. Three
    measured properties decided `dagre` instead: 16.9kb gzipped against
    `d3-dag`'s 37.7kb, a `rankdir: "LR"` axis assignment matching
    `autoPlaceSteps`'s own depth-to-column convention with no transform
    needed, and first-party TypeScript types through `dagre`'s own
    `exports` map.

    A collapsed or an expanded group arranges as one rigid unit: fed to
    `dagre` as a single synthetic node, sized by its current box, with
    every member then moved by the same delta as the box itself. Arrange
    overwrites every step's position at once and clears every stored
    waypoint, behind a confirm gate that gathers over both a hand-placed
    step and an existing waypoint. Flow order exempts a path that closes
    a cycle: a two-step cycle makes both directions of the ordering
    impossible to satisfy at once, so the delta spec's own requirement
    carries that exemption rather than an unconditional rule its own
    reference data would violate.

    The review pass earned its place nine times over, across two
    Critical findings and seven Warnings, all confirmed after adversarial
    verification with zero refutations. The first Critical: `arrangeSteps`
    sized a group's box against the raw `existingLayout` blob, and
    `groupBox`/`drawnBox` return `undefined` under two members with a
    real position, a state a never-dragged group reaches easily. The fix
    builds a resolved position map first, the same fallback
    `CanvasView.tsx`'s own `positionOf` already applies. The second
    Critical: the delta spec's flow-order requirement was unconditional,
    and a back edge makes it mathematically impossible to satisfy in both
    directions of a cycle. The fix narrows the requirement to exempt a
    path that closes one.

    The Warnings ranged from a misattributed open question (the
    group-handling decision traces to `tmp/open-work-priority.md`'s own
    planning note, not to `ROADMAP.md`'s stage entry, which never
    mentions groups) to task-ordering (the i18n group ran after the
    wiring group that references its keys) to an untested confirm
    predicate, now extracted as `hasHandPlacedStep` with its own test.

    Applied and verified 2026-08-15. Full suite: 2680 pass, 1 skip
    (pre-existing, unrelated), 0 fail.

    A live check against `purchase-requisition` confirmed Arrange ran
    with no confirm on a never-dragged draft, positioned all 13 steps at
    distinct non-overlapping points on the lattice, and produced no
    console error. A real pointer-driven drag on an arranged step, by
    exactly 3 grid steps in `x` and 2 in `y`, landed at exactly that
    delta with no extra offset. Grouping two steps and re-arranging kept
    their relative offset (180, -100) exactly, both expanded and,
    separately, collapsed. A real waypoint, dragged onto a path by hand,
    cleared on the next arrange. The studio catalog carries English only,
    confirmed again here: the Arrange button read "Arrange" under the
    German UI locale too, and the toolbar held three buttons within
    579px, well inside 1280px, either way.

    Archived as `openspec/changes/archive/2026-08-15-studio-canvas-auto-layout`.
    The delta landed in `studio-canvas`. `tmp/open-work-priority.md`
    carries the work as item 15, the queue's last row.

39. Process chaining: DONE. Change: `process-chaining`. Raised 2026-08-15 in
    conversation, proposed and archived the same day.

    An offer process reaches its terminal step and must start a procurement
    process from the data it collected. It must not wait for that process.
    A `subprocess` step could not express this. It is call-and-return: the
    parent parks until the child returns. This stage adds the
    fire-and-forget direction instead, as a new action type,
    `process.start`, on the `onEntry` site a terminal step already carries.

    The roadmap's own premise did not survive. It named `createProcessInstance`
    as the mechanism and said it needed an optional `id`. That function needs
    an `Actor` and a `DataSourceRegistry`, and `HandlerContext` carries
    neither.

    The handler mirrors `makeSpawnHandler`'s own low-level pattern instead.
    It resolves the target's latest published body itself. It evaluates
    `inputMapping` with `evalFieldMap`. It calls the low-level
    `store.ts::createInstance` directly.

    Unlike the subprocess pair, though, it takes `ctx.db` per delivery. It
    does not close over a handle built at registry time. This follows
    `action-handlers`' own rule for an author-facing action. It registers in
    the shared, stateless `createDefaultRegistry()`, beside `http.request`
    and `notification.email`, not in the per-tenant wiring `subprocess.ts`
    needs.

    The started instance's id derives from `ctx.idempotencyKey` directly.
    `HandlerContext` already carries it, a per-delivery, redelivery-stable
    UUIDv5. No new id-derivation helper was needed. The started instance
    records `chainedFrom`, a new field distinct from `parent`. Reusing
    `parent` would have cancel-cascaded the chained instance. It would also
    have misrouted it into the subprocess return path on its own terminal
    step.

    The review pass earned its place on one Critical finding. The planned
    redelivery branch skipped `resolveAutomatic` on the already-exists path.
    That reproduced a defect class `subprocess-execution` was written to
    close. A crash between creation and drive-to-rest would have stranded
    the started instance forever. The handler now drives to rest
    unconditionally on both branches, matching `makeSpawnHandler`'s own
    shape. A redelivery test proves it.

    The pass also found a gap in the publish-time check. That type is
    authorable at five action positions, not one per-step field like
    `subprocess`. The check now reuses `registry-check.ts`'s own exported
    `collect`, the same five-position walk `checkActionRegistry` uses.

    Verification found two further gaps. The spec's own "no return path"
    scenario and its "runs the newest published version" scenario both
    lacked test coverage. Both closed the same day.

    Applied and verified 2026-08-15. Full suite: 2651 pass, 1 skip
    (pre-existing, unrelated), 0 fail.

    Archived as `openspec/changes/archive/2026-08-15-process-chaining`. The
    deltas landed in `process-chaining` (new) and `cross-process-validation`.
    `tmp/open-work-priority.md` carries the work as item 14. Item 17b is
    next.

41. **Field matrix: DONE.** Raised 2026-08-15 in conversation. One surface
    lists every catalog field against every step and sets `required`,
    `readonly` and `visible` in place, so an author stops opening each step's
    form editor in turn. The aim is authoring speed. A design pass ran the
    same day and took the decisions below. The six numbered points after them
    stay the reference. Each one names a property of the current engine the
    first-guess build gets wrong.

    The shared module `draft/view-flags.ts`, the form editor's default-aware
    controls and the two stopping-state checks shipped 2026-08-15 as
    `studio-view-flags-module`, this stage's first half. The grid at
    `/processes/:id/edit/panels/matrix` shipped the same day as
    `studio-field-matrix`, this stage's second half.

    `panels/FieldMatrixPanel.tsx` and `panels/fieldMatrixLogic.ts` carry the
    grid: a `role="grid"` table with a roving tabindex, sticky header row and
    first column, and one below-grid editor per selected live cell, driven by
    the same three `BooleanOrExpressionInput`s the form editor's strip
    already used. The rail badge needed a sixth counting function beside
    `issueCountForEntityType`: `checkViewFlags` findings carry `entityType:
    "step"`, the same entity type every other per-step issue already
    carries, so `issueCountForSource` filters by `source: "view"` instead.

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
    `.claude/rules/ui-glossary.md` named three views before this shipped.
    Both name four now.

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
    is 286 cells over 54 entries. Decided: all 13. The grid draws a hatched
    column for the three that declare no view, rather than filtering them out —
    a filter would change what "22 by 13" means per author, and no task in the
    shipped design asked for one.

    Fourth, `view.fields[]` gets a second writer. The form editor owns array
    order, `group` and `span`. The array position of a field the matrix adds
    decides where the form renders it, and the matrix holds one row order for
    all steps while each step holds its own. Decided: the matrix writes flags
    alone. Membership, order, `group` and `span` stay the form editor's.

    Fifth, two field states stop a step, and the surface can see both.
    `readonly` with `required`, on a field no earlier step writes, makes every
    submission raise `required-missing`: `editableFieldIds` excludes the field,
    so nobody can supply the value. `visible: false` with `required: true` drops
    the requirement silently, because `resolveFields` removes the field before
    `requiredFieldIds` counts it. Both read off `view.fields[]` alone, so both
    belong in the checks rail whether or not the grid ships, and both do,
    reported under `checkViewFlags` since this stage's first half.

    Sixth, a grid is a keyboard problem. 286 cells need a roving focus, a header
    that names each column to a screen reader, and a scroll region that holds no
    focus trap. `spa-accessibility` carries the pattern as its own requirement
    now, the same split `studio-canvas` already takes for the disclosure
    pattern.

    The review pass earned its place four times over. Two findings named a
    TypeScript consequence the design's own prose implied but the tasks never
    spelled out: `panelEntityCounts`'s parameter type had no `workflow` field
    to read the live-cell total from, and `VIEW_ENTITY_TYPE`'s
    `Record<PanelView, EntityType>` would have forced a bogus `matrix` entry
    with no correct value to give it. A third found the cell editor's three
    `BooleanOrExpressionInput`s missing `stepId`, the prop the condition
    builder's `child.*` operands need on a subprocess step, matching the form
    editor's own strip. A fourth found the design's own prose overclaiming an
    `aria-rowindex` requirement the actual `spa-accessibility` delta never
    asked for; the grid renders all 286 cells at once, so nothing here
    virtualizes and the attribute would only repeat what the DOM already says.

    A live check against `purchase-requisition` confirmed the grid draws 22
    rows by 13 columns: 54 live, 66 hatched (three columns:
    `approval_routing`, `issue_po`, `receipt_check`), 166 blank, summing to
    286. Selecting a live cell and changing a flag updated the same entry in
    the JSON surface. Turning a cell's `visible` off disabled and cleared
    `required`/`readonly` in the same write. A CEL `visible` expression
    round-tripped through the JSON surface unmangled. Keyboard traversal
    (arrows, Home/End, Ctrl+Home/Ctrl+End, Enter, Escape) all worked as
    specified, and the grid stayed the page's one tab stop throughout.
    Authoring an unwritable-required entry through the matrix's own cell
    editor reported exactly one `view`-group finding in the checks rail, with
    every other group reading clear.

    Applied and verified 2026-08-15. Full suite: 2667 pass, 1 skip
    (pre-existing, unrelated), 0 fail.

    Archived as `openspec/changes/archive/2026-08-15-studio-field-matrix`.
    The deltas landed in `studio-app`, `studio-canvas` and
    `spa-accessibility`. `tmp/open-work-priority.md` carries the work as item
    17b. Item 15 is next.

42. **Field catalog and data sources as list and detail: DONE.** Raised
    2026-08-15 in conversation. Change: `panels-list-and-detail`. The panels
    rail became the master for the Fields and Data sources views: choosing a
    rail entry selects that entity instead of merely scrolling to it, and each
    view renders one entity's editor rather than stacking every one under a
    single scrollbar. `examples/purchase-requisition.json`'s 22 fields
    collapsed from 22 stacked blocks to one.

    `draft/panel-rail.ts`'s `RailFieldRow` gained `rootId`, the id of the
    top-level field a row sits under regardless of the rendered indent depth,
    so choosing a relocated (depth-2+) row still opens the group editor that
    actually contains it. A new `issueCountForEntityId` joined its five
    siblings for the per-row issue mark. `PanelsScreen.tsx` now holds
    `selectedFieldId`/`selectedDataSourceId` as component state, resolving
    each against the current draft on every render and falling back to the
    first entity — a canvas round trip unmounts the screen and resets both,
    matching the mount-selects-first rule. The Data sources rail entry gained
    its own sub-list, gated (with the Fields one) to render only under the
    open view, so two sub-lists never compete for the rail's 16rem column.
    `FieldCatalogPanel` and `DataSourcesPanel` narrowed to a `selectedId` prop
    and screen-owned `onAdd`/`onRemove`, each returning or resolving the id
    the screen needs to select the new entity or the post-removal neighbour.

    Both panels gained the field CSS the design language already states
    elsewhere in the area: a label above its control at `--space-1`
    (`.field-row > label`, `.data-source-row > label`, scoped to direct
    children only — `PluginEnvelopeEditor` and `FieldValidationEditor` nest
    their own labels several levels deeper and keep their own styling), a 2px
    rule under each panel's heading, and a new `.studio-mono` utility (mirroring
    the admin area's `.admin-mono`) on the `key` inputs and the `type` select —
    the values the engine matches exactly. The rail's hairline divider needed
    no new rule: the new data-source sub-list rows reuse the existing
    `.studio-panels-rail-field` class, which already carries one.

    One deliberate deviation from design.md: its CSS section asked to
    catalogue `key`, `label`, `description`, `type` and `dataSource` as
    literal bare field labels. `catalogs/studio.ts`'s own header states the
    opposite rule in as many words — "Deliberately NOT translated: raw
    contract vocabulary shown as a bare field label" — since all five are
    exact `FieldDef`/`DataSourceDef` property names and cataloguing them would
    decouple the on-screen label from the JSON property it names. Those five
    stayed literal; `dataSources.dataListLabel` ("data list") catalogued
    instead, since that string names no schema property.

    Applied and verified 2026-08-17. Full suite: 2738 pass, 1 skip
    (pre-existing, unrelated), 0 fail. A real browser check drove the
    selection, both Add controls, both Remove-selects-neighbour behaviours, a
    group child scroll, the per-row issue mark, and a reload resetting to the
    first entity, in both the Fields and Data sources views.

    Archived as `openspec/changes/archive/2026-08-17-panels-list-and-detail`.
    The delta landed in `studio-app`.
