<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->
<!-- synonym-rotation fires on operator/user/customer, which name three
     different things here and cannot collapse into one: "operator" is the
     `packages/admin` audience this repo names in CLAUDE.md and across the
     spec corpus, "user" is an `auth_users` row (the seed's demo accounts),
     and "customer" is the client organisation, quoted from
     http-api-documentation's own wording. Merging them would lose the
     distinction the change is built on. -->
<!-- This proposal matches the dense technical-prose convention every other
     change document in openspec/changes/ already uses, and restates an
     approved design written end-to-end in that convention
     (docs/superpowers/specs/2026-07-30-reporting-analytics-design.md).
     Per the antislop-targeted-allow-not-file-all memory: named rules, not
     a blanket allow-file all. -->

## Why

The admin area (Roadmap #10, `packages/admin`) is operations-focused — all
instances, the merged transition/event record, the outbox, pending timers. It
answers "what is the system doing, and why did it stop?" for an operator. A
process owner asks a different question: "where does this process lose time,
and does it meet its own SLA?" Nothing in the engine answers that today, even
though every number needed to answer it is already recorded: `instances`,
`HistoryEntry`, and the `timer.fired` `InstanceEvent`. Roadmap #21's design was
approved 2026-07-30
(`docs/superpowers/specs/2026-07-30-reporting-analytics-design.md`); this change
implements it.

## What Changes

- **A fourth product, `packages/reporting`** (new workspace package, React +
  Vite + TypeScript, same shape as `packages/admin`): a process picker plus
  three read-only views, each scoped to one selected process, each carrying a
  date-range filter defaulting to the last 30 days. `packages/form-ui` is not
  consumed — this package renders aggregated numbers, never step forms.
- **A fifth reserved role, `REPORTS_ROLE = "system:reports"`**, added to
  `src/auth/authorize.ts` alongside the existing four. It implies nothing else:
  an actor holding only `system:reports` cannot publish, cannot administer
  users, cannot run a migration, cannot read the operator's instance list.
- **`src/engine/reporting.ts`** (new): the shared per-instance timeline
  primitive — `(stepId, enteredAt)` pairs built from `instances.startedAt` plus
  every `HistoryEntry.toStepId`/`at` in `transitionSeq` order — and the three
  view queries built on it. Traversals aggregate by step `id` across every
  published version of the process, per the Identity contract.
- **`src/http/reporting-routes.ts`** (new): four `GET /reporting/*` routes, all
  gated by `system:reports`, all read-only.
- **Cycle-Time view**: p50/p90/p99 total duration plus per-step average dwell
  time, both restricted to `completed` instances.
- **Bottleneck view**: steps ranked by median dwell time over every in-range
  instance regardless of status, plus a live, date-unfiltered count of
  `running` instances parked in each step.
- **SLA view**: per-step breach rate derived from the two forms in which the
  engine records a timer firing — a `timer.fired` event for a reminder timer,
  and a `HistoryEntry` with cause `timer` for a transition timer, which
  records no event — matched to traversals through per-version maps resolved
  via `resolveBody`. A step with no declared timer carries no SLA and is absent
  from the view.

No existing engine function changes. No schema change. No new table. No write
route. Not breaking.

Out of scope, deliberately: a cross-process dashboard, configurable SLA
thresholds, precomputed or scheduled aggregation, editing anything, and a shared
shell with `app`/`admin`/`studio` (Roadmap #12's already-flagged duplication,
which a fourth package continues and this change does not resolve).

## Capabilities

### New Capabilities

- `reporting-analytics-api`: the process-owner-facing server surface —
  `src/engine/reporting.ts`'s timeline primitive and the Cycle-Time, Bottleneck
  and SLA queries built on it, plus the four `system:reports`-gated
  `GET /reporting/*` routes in `src/http/reporting-routes.ts`.
- `reporting-app`: the process-owner frontend, `packages/reporting` — its
  shell, login, process picker, the three views, the shared date-range filter,
  and the pure view-model modules (percentile formatting, ranking, date
  default) that carry its tests.

### Modified Capabilities

A fourth frontend and a fifth reserved role make five existing specs
factually wrong where they enumerate exactly three packages or exactly four
roles. Each is corrected in the same change that makes it stale:

- `authorization`: the capability today defines exactly four reserved roles and
  states that these SHALL be the only roles it defines. It gains a fifth,
  `REPORTS_ROLE = "system:reports"`, which implies no other role and is implied
  by none, and a requirement that every `/reporting/*` route is gated by it.
- `frontend-security-headers`: the Content-Security-Policy requirement
  enumerates `app`/`admin`/`studio` as the packages producing a browser
  bundle. `packages/reporting` joins them, and a scenario binds any future
  browser package too, so the next addition does not repeat this sweep.
- `production-docker-images`: the frontend image's `PACKAGE` build argument
  names exactly one of `app`, `admin`, or `studio`. It gains `reporting`.
- `development-toolchain`: the fixed dev-port table assigns 5173/5174/5175.
  `packages/reporting` takes 5176, and the devcontainer's CORS allowlist gains
  that origin, as that capability's own "a frontend package is added" rule
  already requires.
- `database-seed-script`: the seed provisions one demo user per reserved role,
  today four. It provisions five, so a contributor can exercise the reporting
  surface from a seeded database without provisioning an account by hand.
- `http-api-documentation`: `docs/openapi.yaml` names the internal-only route
  prefixes it does not document. `reporting/*` joins `admin/*` on the same
  ground — a role-gated surface backing a frontend this repository ships, not
  an integration point a customer's own system calls. Named rather than left
  implicit, so its absence reads as a decision.

Two further specs were checked and need no delta: `spa-accessibility` and
`spa-error-reporting` state their requirements over "every browser package"
and "each browser package", so a fourth is already bound. Only their Purpose
prose enumerates three, which a delta cannot carry — those two lines are
edited directly in `openspec/specs/`.

## Impact

- **New code**: `packages/reporting/` (whole package), `src/engine/reporting.ts`,
  `src/http/reporting-routes.ts`, their `bun:test` suites.
- **Modified code**: `src/auth/authorize.ts` (one constant), `src/http/server.ts`
  (route-file wiring, matching how `admin-routes.ts` and `studio-routes.ts` are
  mounted), `docker/frontend.Dockerfile` (one more `PACKAGE` value), the
  devcontainer's `CORS_ALLOWED_ORIGINS`, the seed script (a fifth demo user),
  `docs/openapi.yaml`'s exclusion note, the root `package.json` workspace
  scripts, and `ROADMAP.md` / `docs/current-state.md` on completion.
- **Reused unchanged**: `resolveBody` (`src/engine/definitions.ts`),
  `listProcesses`, `POST /auth/login`, the JWT/actor-resolution stack.
- **Database**: read-only against `instances`, `history`, and the runtime event
  log. No migration, no new table, no new column, no index required by the
  design (the date-range filter is a predicate on `instances.startedAt`, the
  column every view already starts from).
- **Dependencies**: none new on the engine side; `packages/reporting` takes the
  same React/Vite dev dependencies the other frontends already pin.
- **Deployment**: a fourth frontend image, following the Roadmap #14(b)
  production-image pattern.
