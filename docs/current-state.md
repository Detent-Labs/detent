# Current State

This file maps each subsystem to its files and to the spec capabilities that
own its rules. It names directories, files and capabilities only. For a
function, a type or a route's exact shape, read the knowledge graph, the code
or `docs/openapi.yaml`. The rules an implementation must uphold live in
`.claude/rules/process-contract.md` and `.claude/rules/authoring-invariants.md`.
Open work lives in `docs/decisions.md`, and stage status lives in `ROADMAP.md`.

The last full version of the old per-feature record is commit `7e87bd44`.
Read it with `git show 7e87bd44:docs/current-state.md`.

Each capability named below is a directory under `openspec/specs/`.

## Definition contract and field model

The definition contract is the serialized JSON process definition. Zod schemas
declare it, and the TypeScript types derive from them. A field declares a type,
an optional format and an optional control. The canonical JSON form feeds the
definition hash.

- Paths: `src/schema/definition.ts`, `src/schema/canonical-json.ts`,
  `src/schema/hash.ts`, `src/schema/strip-compiled.ts`, `examples/`
- Specs: `definition-contract`, `authored-content-localization`,
  `cancellation`

## CEL

Every condition is a CEL expression. One library parses in the studio and
evaluates in the engine. A guard that raises counts as no match.

- Paths: `src/cel/check.ts`, `src/cel/eval.ts`, `test/cel.test.ts`
- Specs: `cel-expressions`, `field-expression-map-consolidation`

## Publish validation

Publishing compiles an authored body and runs the write-path checks on it. It
resolves every plugin reference against its registry. It also runs the checks
that need the database, such as cross-process references and group scope.

- Paths: `src/schema/compile.ts`, `src/schema/step-graph.ts`,
  `src/validate.ts`, `src/engine/registry-check.ts`
- Specs: `publish-validation-consolidation`, `field-tree-check-consolidation`,
  `cross-process-validation`, `action-registry-validation`,
  `assignment-registry-validation`, `data-source-registry-validation`,
  `group-scope-validation`, `registry-config-check-consolidation`,
  `registry-error-consolidation`

## Engine: store, outbox, transitions, timers

The engine keeps definitions and instances in PostgreSQL. A transition commits
state first. Its side effects then leave through a transactional outbox. Timers
persist their fire time at step entry, and one poll loop drives the workers.

- Paths: `src/engine/store.ts`, `src/engine/definitions.ts`,
  `src/engine/transition.ts`, `src/engine/outbox.ts`, `src/engine/timers.ts`,
  `src/engine/poll.ts`, `src/engine/idempotency.ts`, `src/engine/duration.ts`
- Specs: `persistence`, `definition-store`, `transition-execution`,
  `automatic-transitions`, `transactional-outbox`, `timers`, `runtime-events`,
  `engine-poll-loop-consolidation`, `runtime-field-type-check-consolidation`

## Audit log and retention

Each instance keeps an append-only history and an event record. The audit log
can clear a redactable field across its whole history. Retention erases the
personal data of a finished instance, by admin request or by a periodic sweep.

- Paths: `src/engine/retention.ts`, `src/engine/store.ts`
- Specs: `instance-audit-log`, `data-retention`, `runtime-events`

## Subprocess and process chaining

A subprocess step starts a child instance and waits for its outcome. An action
can also start another process, or move another instance along a path.

- Paths: `src/engine/subprocess.ts`, `src/handlers/process-start.ts`,
  `src/handlers/instance-transition.ts`, `examples/subprocess-loan-parent.json`
- Specs: `subprocess-execution`, `process-chaining`,
  `instance-transition-action`

## Migration

A migration plan moves every instance of one version to another version. It
maps steps and fields, and it reports the data keys the target no longer
declares. Action writebacks still in flight resolve against the new version.

- Paths: `src/engine/migration.ts`
- Specs: `instance-migration`, `writeback-reresolution`,
  `orphan-key-inspection`

## Runtime API Layer

This layer is the one place where the HTTP routes and the tests start, view,
submit and query instances. It also handles claims, cancellation, comments,
attachments and form drafts.

- Paths: `src/runtime/api.ts`, `src/pagination.ts`,
  `src/engine/instance-drafts.ts`, `src/engine/seeded-create.ts`
- Specs: `runtime-api`, `instance-creation`, `instance-query`,
  `instance-visibility-set`, `instance-form-drafts`, `draft-test-instances`,
  `assignment-claim-enforcement`, `assignment-claim-release-consolidation`

## HTTP wrapper and security headers

A thin REST and JSON layer over the Bun server exposes the runtime. Each
audience has its own route file. The same server serves the built browser
app and sets its framing and content-security headers.

- Paths: `src/http/server.ts`, `src/http/routes.ts`,
  `src/http/admin-routes.ts`, `src/http/studio-routes.ts`,
  `src/http/reporting-routes.ts`, `src/http/account-routes.ts`,
  `src/http/static.ts`, `src/http/errors.ts`, `src/errors.ts`,
  `docker/nginx.conf`, `docs/openapi.yaml`
- Specs: `http-wrapper`, `http-route-handling-consolidation`,
  `http-api-documentation`, `web-asset-serving`, `frontend-security-headers`

## Authentication and authorization

A request resolves to an actor through dev headers or a signed token. Local
accounts log in with a password under a rate limit. Roles such as
`system:admin` and `system:author` gate each surface. Per-process grants gate
each process.

- Paths: `src/auth/resolve.ts`, `src/auth/jwt.ts`, `src/auth/login.ts`,
  `src/auth/users.ts`, `src/auth/authorize.ts`, `src/auth/grants.ts`,
  `src/auth/process-access.ts`, `src/auth/cli.ts`
- Specs: `actor-resolution`, `jwt-authentication`, `local-user-accounts`,
  `auth-token-lifetime-consolidation`, `authorization`,
  `process-access-roles`, `permission-grant-administration`,
  `account-self-service`

## Multi-tenancy

Each tenant has its own database. A tenant store maps a request to its
connection, and a CLI provisions new tenants.

- Paths: `src/tenancy/store.ts`, `src/tenancy/connections.ts`,
  `src/tenancy/provision.ts`, `src/tenancy/cli.ts`
- Specs: `multi-tenancy`

## Action handlers

An action names a handler type and a config. The registry resolves that type
at publish time. Two general handlers ship beside the chaining handlers: an
HTTP request and an email notification.

- Paths: `src/engine/registry.ts`, `src/handlers/http.ts`,
  `src/handlers/notification-email.ts`
- Specs: `action-handlers`, `http-action-handler`,
  `notification-email-action-handler`

## Data sources and assignment strategies

A field option list comes from a data source, which resolves at runtime. A
step's assignment strategy resolves the candidates who may claim it. Both are
plugins behind a registry, and both declare a config schema for the studio.

- Paths: `src/engine/registry.ts`, `src/engine/resolution.ts`,
  `src/engine/assignment-strategies.ts`, `src/engine/instance-query-source.ts`,
  `src/engine/config-descriptor.ts`, `src/auth/groups.ts`
- Specs: `data-source-resolution`, `db-data-source-type`,
  `instance-query-data-source`, `assignment-strategy-registry`,
  `group-based-assignment`, `manager-of-starter-assignment`,
  `actor-from-field-assignment`, `escalation-pattern`

## Data lists and templates

A data list is a table of rows kept in the database, and a data source can
read it. A template is a starting body for a new draft.

- Paths: `src/engine/host.ts`, `src/engine/store.ts`,
  `src/engine/templates.ts`
- Specs: `data-list-administration`, `process-templates`

## Reporting engine

The reporting queries compute cycle time, bottlenecks and SLA figures. A saved
report reads one process's instances as a table of field values.

- Paths: `src/engine/reporting.ts`, `src/http/reporting-routes.ts`
- Specs: `reporting-analytics-api`, `reporting-data-tables`,
  `instance-data-tables`, `instance-data-query`

## Observability and worker errors

The engine writes structured logs and exposes metrics. The liveness and
readiness probes answer at `/livez` and `/readyz`. Each worker catches its
own failures, so one broken instance parks alone.

- Paths: `src/log.ts`, `src/http/metrics.ts`, `src/http/server.ts`,
  `src/engine/poll.ts`
- Specs: `observability`

## The web shell

One browser package serves all four areas under one login and one session.
The shell owns routing by prefix, the chrome, the login screen and the error
boundary. The shared tokens and the string catalogs sit beside it.

- Paths: `packages/web/src/shell/`, `packages/web/src/api/`,
  `packages/web/src/i18n/`, `src/engine/ui-strings.ts`, `DESIGN.md`
- Specs: `unified-shell`, `spa-accessibility`, `spa-error-reporting`,
  `ui-string-overrides`, `web-styling`

## The app area and `packages/form-ui`

The participant works here on tasks, starts processes and follows cases. The
form renderer is its own package. The studio Player uses the same renderer.

- Paths: `packages/web/src/areas/app/`, `packages/form-ui/src/`
- Specs: `end-user-app`, `form-ui`

## The admin area

The operator inspects instances, the outbox, timers and migrations. The same
area administers users, groups, data lists and UI strings.

- Paths: `packages/web/src/areas/admin/`, `src/http/admin-routes.ts`,
  `src/engine/admin-queries.ts`
- Specs: `admin-app`, `admin-operations-api`, `admin-user-management`,
  `group-administration`, `data-list-administration`

## Process Studio: frame, drafts and publish

The developer keeps drafts, publishes versions and compares them here. Other
screens hold migration plans, templates, tools, the Player and version
export for another environment.

- Paths: `packages/web/src/areas/studio/screens/`,
  `packages/web/src/areas/studio/draft/`, `src/engine/drafts.ts`,
  `src/http/studio-routes.ts`
- Specs: `studio-app`, `process-drafts`, `studio-publish`,
  `process-version-inspection`, `studio-migration-planning`,
  `studio-migration-plan-form`, `studio-tools`, `studio-player`,
  `environment-promotion`

## Process Studio: canvas

The canvas draws steps and paths on a grid. An author can select, group,
arrange and connect steps there. A selection opens the inspector beside it.

- Paths: `packages/web/src/areas/studio/canvas/`
- Specs: `studio-canvas`

## Process Studio: tabs, forms and editors

One tab row holds every part of a draft, from steps and fields to access and
checks. The form editor lays out each step's view. Guided editors write
conditions, validation rules, plugin config and column maps.

- Paths: `packages/web/src/areas/studio/panels/`,
  `packages/web/src/areas/studio/panels/shared/`
- Specs: `studio-process-tabs`, `studio-step-page`, `studio-forms-overview`,
  `studio-form-editor`, `studio-json-view`, `studio-checks-rail`,
  `studio-condition-builder`, `studio-field-validation-form`,
  `studio-plugin-config-form`, `studio-column-mapping-form`,
  `studio-guided-vocabulary`

## The reporting area

The process owner reads cycle time, bottlenecks and SLA figures here. The
owner also builds, previews, shares and exports saved reports.

- Paths: `packages/web/src/areas/reporting/`
- Specs: `reporting-app`

## Tooling: devcontainer, CI, gates, deployment

All tooling runs inside the devcontainer, and a preflight script checks it.
The pre-push hook runs the gates, and hosted CI runs the same checks. The
suite uses its own database. Two images and two runbooks cover deployment.

- Paths: `.devcontainer/`, `.githooks/`, `scripts/gates/`,
  `scripts/preflight.sh`, `scripts/seed.ts`, `.github/workflows/check.yml`,
  `bunfig.toml`, `test/preload-db.ts`, `docker/`, `docs/runbooks/`
- Specs: `development-toolchain`, `push-gate-checks`,
  `devcontainer-preflight`, `worktree-isolation`, `database-seed-script`,
  `production-docker-images`, `deployment-runbook`, `backup-restore-runbook`
