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

## Publish validation: the compile pass

Publishing compiles an authored body first. The compile pass runs the
write-path structural checks, such as field keys, view groups and the step
graph.

- Paths: `src/schema/compile.ts`, `src/schema/step-graph.ts`
- Specs: `publish-validation-consolidation`, `field-tree-check-consolidation`

## Publish validation: references

Publishing resolves every plugin reference against its registry and checks
each plugin config. It also runs the checks that need the database, such as
cross-process references and group scope.

- Paths: `src/validate.ts`, `src/engine/registry-check.ts`
- Specs: `action-registry-validation`, `assignment-registry-validation`,
  `data-source-registry-validation`, `registry-config-check-consolidation`,
  `registry-error-consolidation`, `cross-process-validation`,
  `group-scope-validation`

## Engine: store and definitions

The engine keeps definitions, drafts and instances in PostgreSQL. A published
version stays immutable, and an identical body publishes as a no-op.

- Paths: `src/engine/store.ts`, `src/engine/definitions.ts`
- Specs: `persistence`, `definition-store`

## Engine: transitions, outbox and timers

A transition commits state first. Its side effects then leave through a
transactional outbox. Timers persist their fire time at step entry.

- Paths: `src/engine/transition.ts`, `src/engine/outbox.ts`,
  `src/engine/timers.ts`, `src/engine/idempotency.ts`, `src/engine/duration.ts`
- Specs: `transition-execution`, `automatic-transitions`,
  `transactional-outbox`, `timers`, `runtime-events`,
  `runtime-field-type-check-consolidation`

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

A thin REST and JSON layer exposes the runtime, with one route file per
audience. It also serves the built browser app with its security headers.

- Paths: `src/http/`, `src/errors.ts`, `docker/nginx.conf`,
  `docs/openapi.yaml`
- Specs: `http-wrapper`, `http-route-handling-consolidation`,
  `http-api-documentation`, `web-asset-serving`, `frontend-security-headers`

## Authentication and authorization

A request resolves to an actor through dev headers or a signed token. Local
accounts log in with a password under a rate limit. Roles such as
`system:admin` and `system:author` gate each area, and grants gate a process.

- Paths: `src/auth/`
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
at publish time and describes each plugin config for the studio. Two general
handlers ship beside the chaining handlers: an HTTP request and an email.

- Paths: `src/engine/registry.ts`, `src/engine/config-descriptor.ts`,
  `src/handlers/http.ts`, `src/handlers/notification-email.ts`
- Specs: `action-handlers`, `http-action-handler`,
  `notification-email-action-handler`

## Data sources

A field option list comes from a data source, which resolves at runtime. A
data source can read a data list, a database table or other instances.

- Paths: `src/engine/registry.ts`, `src/engine/resolution.ts`,
  `src/engine/instance-query-source.ts`
- Specs: `data-source-resolution`, `db-data-source-type`,
  `instance-query-data-source`

## Assignment strategies

A step's assignment strategy resolves the candidates who may claim it. The
shipped strategies read a static list, a group, the starter's manager or a
person field.

- Paths: `src/engine/assignment-strategies.ts`, `src/auth/groups.ts`
- Specs: `assignment-strategy-registry`, `group-based-assignment`,
  `manager-of-starter-assignment`, `actor-from-field-assignment`,
  `escalation-pattern`

## Data lists and templates

A data list is a table of rows kept in the database, and a data source can
read it. A template is a starting body for a new draft.

- Paths: `src/engine/host.ts`, `src/engine/store.ts`,
  `src/engine/templates.ts`
- Specs: `data-list-administration`, `process-templates`

## Reporting engine

The reporting queries compute cycle time, bottlenecks and SLA figures. A saved
report reads one process's instances as a table of field values. The
Runtime API Layer creates and runs saved reports.

- Paths: `src/engine/reporting.ts`, `src/http/reporting-routes.ts`,
  `src/runtime/api.ts`
- Specs: `reporting-analytics-api`, `reporting-data-tables`,
  `instance-data-tables`, `instance-data-query`

## Observability and worker errors

The engine writes structured logs and exposes metrics. The liveness and
readiness probes answer at `/livez` and `/readyz`. One shared poll loop drives
the background workers, and each worker error writes a log line.

- Paths: `src/log.ts`, `src/http/metrics.ts`, `src/http/server.ts`,
  `src/engine/poll.ts`
- Specs: `observability`, `http-wrapper`, `engine-poll-loop-consolidation`

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
screens plan migrations and export a version to another environment.

- Paths: `packages/web/src/areas/studio/screens/`,
  `packages/web/src/areas/studio/draft/`, `src/engine/drafts.ts`
- Specs: `studio-app`, `process-drafts`, `studio-publish`, `studio-tools`,
  `process-version-inspection`, `studio-migration-planning`,
  `studio-migration-plan-form`, `studio-player`, `environment-promotion`

## Process Studio: canvas

The canvas draws steps and paths on a grid. An author can select, group,
arrange and connect steps there. A selection opens the inspector beside it.

- Paths: `packages/web/src/areas/studio/canvas/`
- Specs: `studio-canvas`

## Process Studio: tabs and the form editor

One tab row holds every part of a draft, from steps and fields to access and
checks. The form editor lays out each step's view.

- Paths: `packages/web/src/areas/studio/panels/`
- Specs: `studio-process-tabs`, `studio-step-page`, `studio-forms-overview`,
  `studio-form-editor`, `studio-json-view`, `studio-checks-rail`

## Process Studio: guided editors

Guided editors write conditions, validation rules, plugin config and column
maps. Each one prints the author's words and writes the same JSON.

- Paths: `packages/web/src/areas/studio/panels/shared/`
- Specs: `studio-condition-builder`, `studio-field-validation-form`,
  `studio-plugin-config-form`, `studio-column-mapping-form`,
  `studio-guided-vocabulary`

## The reporting area

The process owner reads cycle time, bottlenecks and SLA figures here. The
owner also builds, previews, shares and exports saved reports.

- Paths: `packages/web/src/areas/reporting/`
- Specs: `reporting-app`

## Tooling: devcontainer, CI and gates

All tooling runs inside the devcontainer, and a preflight script checks it.
The pre-push hook runs the gates and a lint-first check. Hosted CI runs the
same checks plus a dependency audit. The suite uses its own database.

- Paths: `.devcontainer/`, `.githooks/`, `scripts/gates/`,
  `scripts/preflight.sh`, `.github/workflows/check.yml`, `bunfig.toml`,
  `test/preload-db.ts`
- Specs: `development-toolchain`, `push-gate-checks`,
  `devcontainer-preflight`, `worktree-isolation`

## Browser smoke suite

A Playwright suite drives four flows against the production web build. It
runs as `bun run e2e`, and a separate CI job runs it beside the checks. The
engine it starts uses a database of its own.

- Paths: `e2e/`, `playwright.config.ts`, `scripts/e2e.ts`,
  `.github/workflows/check.yml`
- Specs: `browser-smoke-suite`, `development-toolchain`

## Deployment

Two images serve the engine and the frontend. The runbooks cover
deployment, backup and restore. A seed script fills a new database.

- Paths: `docker/`, `docs/runbooks/`, `scripts/seed.ts`
- Specs: `production-docker-images`, `deployment-runbook`,
  `backup-restore-runbook`, `database-seed-script`
