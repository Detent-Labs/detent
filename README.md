# SummitBPS

A headless, API-first workflow / BPM engine in TypeScript. It executes
structured, form- and approval-driven business processes with explicit states.

The paradigm is a **state-based finite-state machine**: Steps (states) connected
by explicit Paths (transitions). This is *not* BPMN token flow.

## The contract

A serialized JSON process definition is the one artifact three roles share:

- **Engine** — executes definitions.
- **Editor** — produces them graphically (`packages/studio`, superseding the
  `packages/editor` proof of concept).
- **Hand-authoring** — definitions written directly as JSON (rare).

`src/schema/definition.ts` is that contract, expressed as Zod schemas with TS
types derived via `z.infer` so validation and types cannot drift. Ids are opaque
(`step_<uuid>`) and are the sole reference anchor; `key`/`label` reference
nothing. Bodies are hashed with JCS (canonical JSON); published versions are
immutable and instances pin `{ processId, version, definitionHash }`.

All conditions are CEL (`{ lang: "cel", src }`) — pure, total, no `now()`.

## Status

Schema, validation, a working engine, a Runtime API Layer, an HTTP wrapper with
JWT authentication and role-gated authorization, and three frontends
(participant, operator, developer).

| Piece | State |
|-------|-------|
| `src/schema/definition.ts` | Full definition + runtime model as Zod; structural invariants as refinements / `superRefine`. Includes `LocalizedText`/`baseLocale` for participant-facing content. |
| `src/cel/check.ts` | Authoring-time CEL parse/type-check against the field catalog (`@marcbachmann/cel-js`). |
| `src/cel/eval.ts` | Runtime CEL: guards (total — a runtime error is `false`), Action.output writeback, and migration `transforms` (total per entry). |
| `src/schema/compile.ts` | Publish-time pass: injects the cancel-sink (+ reserved outcome for a contracted process) before hashing, deterministic and idempotent. |
| `src/engine/` | Instance store, transactional outbox (delivery + writeback + retry/dead-letter + reclaim), transition executor (manual/automatic/timer), async wait-state re-resolution, timer arming + scheduler, crash recovery, runtime cancellation, subprocess execution (`subprocess.ts`: spawn + return + downward cancel cascade), instance migration (`migration.ts`: plan store + row-locked, keyset-paginated version migration), definition/version store (`definitions.ts`) + `startEngine` host. PostgreSQL via `Bun.sql`. |
| `src/runtime/api.ts` | Runtime API Layer: instance creation, view resolution, submit-and-transition, claim/release, cancel, and the read/query surface (`listInstances` / `getInstanceRecord`) — the boundary a UI calls without touching engine internals. Every function takes an explicit `Actor`. |
| `src/http/` | Thin REST/JSON wrapper over `Bun.serve` around the Runtime API Layer, plus the admin and studio route files. Typed-error-to-HTTP-status mapping, configurable CORS. |
| `src/auth/` | `ActorResolver` seam with two implementations (a non-production dev-header resolver and a production-capable JWT resolver accepting local `auth_users` accounts and JWKS-backed external issuers), login + rate limiting, a user-admin CLI, and the reserved roles (`system:publish`, `system:cancel-any`, `system:admin`, `system:developer`). |
| `src/handlers/` | `http.request` — the one shipped action handler; a vendor-neutral REST call with engine-set idempotency and outbox-aligned retry semantics. |
| `packages/studio/` | Process Studio, the developer's product: server-persisted drafts, canvas editing (drag-to-connect), the structural panels as inspector, a replacing JSON surface, publish, published versions with a JSON diff, and migration-plan authoring. Tools + Player are the remaining piece. |
| `packages/admin/` | The operator's product: all-instances list, merged transition/event record with cancel, outbox with dead-letter retry/discard, pending timers, user administration. |
| `packages/app/` | The participant's product: Login / My-tasks inbox / Task / Start-a-process. |
| `packages/form-ui/` | Source-only shared step-form renderer, so what an author previews is what a participant gets. |
| `packages/editor/` | The original structural editor — a proof of concept for the editing half only (file-based drafts, read-only Mermaid graph, no publish). Superseded by `packages/studio`; deleted once `studio-tools-and-player` lands. |
| `examples/expense-approval.json` | Complete Capture → Review → Book example. |
| `examples/subprocess-*.json` | A loan-application parent calling a credit-check subprocess (child) — spawn, `child.outcome` routing, return writeback. |
| `test/` | `bun:test` suites; each invariant ships a test that rejects a violating definition. |

Done: validation, CEL wiring, the engine (runtime cancellation, subprocess
execution with downward cancel propagation, both timer kinds, plan-governed
instance migration), the Runtime API Layer, the HTTP wrapper, authentication
and authorization, assignment/claim enforcement, and the read/query API — plus
the participant, operator and developer frontends. See `ROADMAP.md` for
stage-by-stage status and what is deliberately deferred.

## Develop

Bun is the runtime, package manager, and test runner. Everything runs inside the
dev container (`.devcontainer/`), never on the host.

```bash
bun install
DATABASE_URL=postgres://postgres:postgres@db:5432/workflow_engine bun test   # bun:test suites
bun run typecheck                                                            # tsc --noEmit (Bun does not typecheck)
```

Set `DATABASE_URL`. The database-backed suites carry `test.skipIf(!DATABASE_URL)`
at over 500 sites — the majority of the suite. Without it they skip silently,
not loudly. A bare `bun test` then reports a pass count that omits most of what
the suite tests. CI (`.github/workflows/ci.yml`) fails the job outright when
the variable is unset, for the same reason.

### Authentication configuration

`bun run serve` refuses to start unless you configure authentication. Set one
of these three:

- `AUTH_JWT_SECRET` — a local HS256 signing key, at least 32 bytes encoded
  (`openssl rand -base64 32`)
- `AUTH_ISSUERS` — a JSON array of `{iss, jwksUrl, audience, rolesClaim}`, to
  accept externally-issued tokens
- `ALLOW_INSECURE_DEV_AUTH=1` — an explicit opt-out for local development
  only. It trusts `X-Actor-Id`/`X-Actor-Roles` headers verbatim, with no
  identity check at all. Never set this where real user data is reachable.
  The devcontainer sets it for you (`.devcontainer/docker-compose.yml`).

Changes go through OpenSpec (`openspec/`) — propose → specs/tasks → implement →
verify → archive. See `CLAUDE.md` for the full contract rules and invariants.

## License

[GNU AGPLv3](LICENSE) or later.
