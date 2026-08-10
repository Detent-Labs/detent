# Roadmap

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: this file names four distinct audiences the product serves:
     participant (end user), operator, developer, process owner. They are four
     different people, not one concept under rotating names, so the rule reports
     a false positive on every stage that contrasts them. No other rule is
     silenced here. -->

Stage-by-stage status. A DONE entry says what the stage was. It points at the
OpenSpec change and the capability spec that carry the detail. Each change name
below drops its date prefix; the archive holds it at
`openspec/changes/archive/<date>-<name>/`. Specs live in `openspec/specs/<name>/`.
`docs/current-state.md` describes each subsystem.

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
    one file per area. The admin screen needs all three key lists, and the
    package forbids an area importing another area. `admin` and `reporting`
    carry no catalog yet, so neither is overridable. That retrofit is the
    next step here, and it adds two entries to
    `i18n/catalogs/index.ts` and writes `area = 'admin'` rows with no
    schema change.

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

16. **Notifications: DONE.** Stage 9 excluded notifications on purpose; an
    inbox-only model is a gap for customers used to being pushed to. Delivered as
    one new action handler type on the existing registry, not a new schema
    concept — the five existing action positions already cover "notify on
    assignment" and "notify on reminder". Webhook notification stays a documented
    recipe over `http.request` (stage 5e) rather than new code.
    **Half of what the stage's own rationale asked for stays open.** Recipients
    are static configuration, so a message reaches a team or manager mailbox,
    never the actor a step is assigned to. Resolving an assignee to an account's
    email address widens the handler seam itself, so it is its own stage (#16b),
    not a follow-up patch. Stage 17 is unaffected — an escalation notifies a
    tier, and a tier is a static address.
    One test gap is recorded rather than closed: the authenticated-relay path is
    verified by reading only, because no local harness can complete a TLS
    handshake against the engine's own client socket.
    Change: `add-notifications`. Spec: `notification-email-action-handler`.
    Design: `docs/superpowers/specs/2026-07-30-notifications-design.md`.

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

24. Multi-tenancy: design DONE, implementation NOT STARTED (see
    `docs/superpowers/specs/2026-07-30-multi-tenancy-design.md`). Raised
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
    SaaS control plane, and per-tenant quotas. No OpenSpec change yet.

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

27. **No-code / low-code process authoring: DONE (a–e).**
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
       Shipping this exposed an open question the stage has not yet answered:
       the studio area sits behind one coarse role. `system:developer` reaches
       drafts, the registry, migration planning and the Player alike, and
       publishing needs `system:publish` on top. A business analyst authoring
       a process is exactly the actor that role was not shaped for. Either
       the analyst gets `system:developer` (and with it migration planning),
       or the area splits its gate the way stage 26 split the admin area's —
       a set of roles per area, each screen keeping its own check.
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

## Changes with no stage

The archive also holds hardening, deduplication and bug-fix changes that belong
to no stage. Among them: the accessibility and error-state passes, the
deduplication series, the test-suite determinism work, and the security fixes.
`openspec/changes/archive/` lists them. Each one amends the capability spec it
touches.
