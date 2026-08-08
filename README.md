<!-- antislop: allow-file synonym-rotation -->
<!-- The pre-existing "Develop" section's "create the two indexes"
     (database indexes) and the "Deploy" section's repeated "build"
     (container images) name unrelated concepts that happen to share this
     rule's synonym bucket. Rewriting either to dodge the rule would make
     the wrong section read worse for a false-positive cross-reference. -->
# Detent

A workflow / BPM platform in TypeScript. It runs structured, form- and
approval-driven business processes with explicit states.

The product is the engine plus its browser UI. Four areas serve the four people
around a process. The participant works a task. The operator runs the
installation. The developer builds the process. The owner measures it.

The engine stays headless and API-first behind that UI. It carries no UI
dependency, and the browser package reaches it only over HTTP. So an
integration drives a process with no browser at all.

Where this is going: no-code and low-code process authoring (`ROADMAP.md` stage
27). No-code is the target for what the builders cover. An analyst completes a
process through forms and a canvas, typing no CEL and no JSON. Low-code is what
stays underneath, permanently. The JSON view and the CEL input remain
first-class for a developer, and for what a builder cannot express. CEL guards
and action config still need a developer today.

The paradigm is a **state-based finite-state machine**: Steps (states) connected
by explicit Paths (transitions). This is *not* BPMN token flow.

## The contract

A serialized JSON process definition is the one artifact three roles share:

- **Engine** — executes definitions.
- **Studio** — builds them on a canvas (the studio area of `packages/web`).
- **Hand-authoring** — definitions written directly as JSON (rare).

`src/schema/definition.ts` is that contract, expressed as Zod schemas with TS
types derived via `z.infer` so validation and types cannot drift. Ids are opaque
(`step_<uuid>`) and are the sole reference anchor; `key`/`label` reference
nothing. Bodies are hashed with JCS (canonical JSON); published versions are
immutable and instances pin `{ processId, version, definitionHash }`.

All conditions are CEL (`{ lang: "cel", src }`) — pure, total, no `now()`.

New to the vocabulary? `docs/authoring-guide.md` explains what a Step, a Path
and an Action are. It also gives the order in which to build a process.

## Status

Schema, validation, a working engine, a Runtime API Layer, and an HTTP wrapper
with JWT authentication and role-gated authorization. One frontend package
carries the four areas above.

| Piece | State |
|-------|-------|
| `src/schema/definition.ts` | Full definition + runtime model as Zod; structural invariants as refinements / `superRefine`. Includes `LocalizedText`/`baseLocale` for participant-facing content. |
| `src/cel/check.ts` | Authoring-time CEL parse/type-check against the field catalog (`@marcbachmann/cel-js`). |
| `src/cel/eval.ts` | Runtime CEL: guards (total — a runtime error is `false`), Action.output writeback, and migration `transforms` (total per entry). |
| `src/schema/compile.ts` | Publish-time pass: injects the cancel-sink (+ reserved outcome for a contracted process) before hashing, deterministic and idempotent. |
| `src/engine/` | Instance store, transactional outbox (delivery + writeback + retry/dead-letter + reclaim), transition executor (manual/automatic/timer), async wait-state re-resolution, timer arming + scheduler, crash recovery, runtime cancellation, subprocess execution (`subprocess.ts`: spawn + return + downward cancel cascade), instance migration (`migration.ts`: plan store + row-locked, keyset-paginated version migration), definition/version store (`definitions.ts`) + `startEngine` host. Three plugin registries (`registry.ts`) cover actions, data sources and assignment strategies. The `db.list` data source reads the `data_lists`/`data_list_values` tables. PostgreSQL via `Bun.sql`. |
| `src/runtime/api.ts` | Runtime API Layer: instance creation, view resolution, submit-and-transition, claim/release, cancel, and the read/query surface (`listInstances` / `getInstanceRecord`) — the boundary a UI calls without touching engine internals. Every function takes an explicit `Actor`. |
| `src/http/` | Thin REST/JSON wrapper over `Bun.serve` around the Runtime API Layer, plus the admin and studio route files. Typed-error-to-HTTP-status mapping, configurable CORS. |
| `src/auth/` | `ActorResolver` seam with two implementations (a non-production dev-header resolver and a production-capable JWT resolver accepting local `auth_users` accounts and JWKS-backed external issuers), login + rate limiting, a user-admin CLI, and the six reserved roles (`system:publish`, `system:cancel-any`, `system:admin`, `system:developer`, `system:reports`, `system:datalists`). The server checks each role directly. None implies another. |
| `src/handlers/` | Two action handlers ship. `http.request` is a vendor-neutral REST call with engine-set idempotency and outbox-aligned retry semantics. `notification.email` speaks SMTP directly and reads its connection details from the environment. |
| `packages/web/` | The one browser package. `src/shell/` holds prefix routing, the one session and login, the account menu and the area switcher; `src/api/` and `src/i18n/` hold what every area shares; `src/areas/{app,admin,studio,reporting}/` hold the four audiences' screens, one URL prefix, one lazy chunk and one role gate each. An area never imports from another area. |
| `packages/form-ui/` | Source-only shared step-form renderer, so what an author previews is what a participant gets. |
| `examples/expense-approval.json` | Complete Capture → Review → Book example. Runs end-to-end in the devcontainer against its `webhook-sink` service. |
| `examples/subprocess-*.json` | A loan-application parent calling a credit-check subprocess (child) — spawn, `child.outcome` routing, return writeback. |
| `test/` | `bun:test` suites; each invariant ships a test that rejects a violating definition. |

Done: validation, CEL wiring, the engine (runtime cancellation, subprocess
execution with downward cancel propagation, both timer kinds, plan-governed
instance migration), the Runtime API Layer, the HTTP wrapper, authentication
and authorization, assignment/claim enforcement, and the read/query API — plus
the four frontend areas. Custom actions, data sources and assignment strategies
are plugins behind one envelope, `{ type, config }`. Publish resolves each type
against its registry and checks its config. A `db.list` data source keeps its
option values in engine-owned tables. Business staff edit a list without
publishing a new version. See `ROADMAP.md` for
stage-by-stage status and what is deliberately deferred.

## Develop

Bun is the runtime, package manager, and test runner. Everything runs inside the
dev container (`.devcontainer/`), never on the host.

Bring the whole stack up with one command: `bash scripts/dev-up.sh`, or
`pwsh scripts/dev-up.ps1` on Windows. Both need Git Bash, which Git for
Windows ships. The PowerShell path runs the same preflight script.

That one command starts
the
containers, installs dependencies, seeds the demo processes and users, and
starts the HTTP server. A preflight check runs last, confirming the whole
stack answers before it prints the login. The same preflight gates every
push: `.githooks/pre-push` runs its `core` profile first. Run either
profile standalone with `bash scripts/preflight.sh core|serve`. The `.ps1`
entry point takes the same two profiles and runs that same script.

```bash
bun install
DATABASE_URL=postgres://postgres:postgres@db:5432/workflow_engine bun test   # bun:test suites
bun run typecheck                                                            # tsc --noEmit (Bun does not typecheck)
bun run build                                                                # vite build, the frontend's production bundle
bun run check                                                                # typecheck, build, then the suite, in one command
```

Set `DATABASE_URL`. The database-backed suites carry `test.skipIf(!DATABASE_URL)`
at over 500 sites — the majority of the suite. Without it they skip silently,
not loudly. A bare `bun test` then reports a pass count that omits most of what
the suite tests. Inside the dev container the variable is already set, which is
the second reason to run there.

Nothing runs on a hosted CI service. `.githooks/pre-push` is the gate instead.
It runs `bun run check` in the dev container. The push proceeds only when the
typecheck, the build and the suite all pass.

The `bun install` above arms it: the root
`prepare` script runs `scripts/enable-hooks.sh`, which points
`core.hooksPath` at `.githooks`. That arms `post-commit` too, which bumps
`VERSION` after each commit. The same script arms an SSH keepalive on
`core.sshCommand`, so the connection to the remote survives the hook's own
runtime. Nobody types a `git config` line.

`bun run serve` creates the database schema on startup if it is missing.
Pointing it at an empty Postgres needs no separate setup step. Every DDL
statement is `CREATE ... IF NOT EXISTS`, so this is a no-op against a
database that already has the schema. Set `DATABASE_URL` before starting the
process; without it, the process fails immediately and names the variable.

On a deployment with meaningful existing data volume, create the two indexes
`initSchema` adds ahead of the deploy, using `CREATE INDEX CONCURRENTLY`.
Match the definitions in `src/engine/store.ts::initSchema` exactly. That way
the startup call finds both indexes already there and skips them —
`CREATE INDEX` inside `initSchema` blocks startup on a large table.

### Authentication configuration

`bun run serve` refuses to start unless you configure authentication. It needs
one of `AUTH_JWT_SECRET`, `AUTH_ISSUERS` or `ALLOW_INSECURE_DEV_AUTH=1`. The
devcontainer sets the third one (`.devcontainer/docker-compose.yml`). That one
belongs nowhere else. `docs/runbooks/deployment.md` gives all three with their
defaults, and every other variable too.
Changes go through OpenSpec (`openspec/`) — propose → specs/tasks → implement →
verify → archive. See `CLAUDE.md` for the full contract rules and invariants.

## Deploy

Two production images exist: one for the engine, one for the frontend.
`docker/engine.Dockerfile` and `docker/frontend.Dockerfile` build them.
The engine can also serve the frontend itself from `WEB_ROOT`, which is
the single-origin alternative to running the nginx image. The devcontainer uses neither one;
it stays dev-only.

```bash
# Engine
docker build -f docker/engine.Dockerfile -t workflow-engine .

# The frontend: one bundle covering every area.
# VITE_API_URL is a build arg only: Vite inlines it at build time, so a
# container runtime env var set later has no effect on the result.
docker build -f docker/frontend.Dockerfile \
  --build-arg VITE_API_URL=https://api.example.com \
  -t web .
```

The engine image reads its configuration from the container runtime
environment. These are the same variables `bun run serve` already reads
locally. `docs/runbooks/deployment.md` is the list. It gives every variable,
what it controls, whether a deployment must set it, and its default. It also
marks the defaults that are unsafe to keep. Read it before the first
deployment, and again when an upgrade adds a variable.

Two of those defaults deny rather than permit.
`HTTP_ACTION_ALLOWED_HOSTS` starts empty and refuses every `http.request`
target. `METRICS_TOKEN` starts unset and leaves `GET /metrics` unregistered.
The runbook covers both.

The image never sets
`ALLOW_INSECURE_DEV_AUTH` itself. A deployment that omits both auth
variables fails to start immediately. It names the missing variable,
exactly as `bun run serve` already does locally, instead of falling back
to an insecure default.

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/workflow_engine \
  -e AUTH_JWT_SECRET=$(openssl rand -base64 32) \
  workflow-engine
```

Each frontend image serves its built assets over nginx on port 8080. A
client-side routing fallback means a direct load of a deep URL still
resolves. Run it with a plain port mapping:

```bash
docker run -p 8080:8080 app
```

Both images declare a `HEALTHCHECK`: the engine calls `GET /readyz`, each
frontend requests its served root.

## Support

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H3R224KYSE)

## License

[GNU AGPLv3](LICENSE) or later.
