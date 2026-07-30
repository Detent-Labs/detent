## Context

`src/http/` wraps the Runtime API Layer with no published contract. A
customer's own system will need to integrate against the engine directly,
not only through `packages/app`/`admin`/`studio`. The owner approved a
design on 2026-07-30
(`docs/superpowers/specs/2026-07-30-http-api-documentation-design.md`);
this document adapts it for OpenSpec tracking. It changes no engine code.

A source review against the current codebase, done while writing this
change, found three corrections against that approved design:
- `POST /instances/:id/delegate`, `POST /instances/:id/comments`, and
  `GET /instances/:id/comments` exist in `src/http/server.ts` (Roadmap
  #23a/b, task delegation and instance comments) but are absent from the
  approved design's route list. They meet the same "a customer's own
  system would call this" test the design already applies to
  submit/claim/release. This change adds them to scope.
- The approved design lists 404 among the statuses each route documents.
  `src/http/errors.ts` never maps a specific route to 404. A not-found
  instance or process returns 500 by design (`NotFoundError`, kept
  message-bearing at 500, not 404). `server.ts` reserves 404 for an
  unmatched path only. This change drops 404 from the per-route status
  list.
- `POST /auth/login` never reaches `src/http/errors.ts`. `src/auth/login.ts`
  builds its own 400/401 responses and adds a 429 for its per-email rate
  limit (`checkAndRecordAttempt`), a status no other route returns. This
  change documents login's statuses from `src/auth/login.ts` directly,
  not from `errors.ts`.

## Goals / Non-Goals

**Goals:**
- Publish one OpenAPI 3.0 document, `docs/openapi.yaml`, describing the
  routes a customer integration would call: `POST /auth/login`,
  `POST /processes/:processId/instances`, `GET /instances/:id`,
  `GET /instances`, `POST /instances/:id/submit`, `POST /instances/:id/claim`,
  `POST /instances/:id/release`, `POST /instances/:id/delegate`,
  `POST /instances/:id/comments`, `GET /instances/:id/comments`,
  `POST /instances/:id/cancel`, `GET /instances/:id/record`,
  `POST /processes`, `GET /processes`, `GET /processes/:id/versions`,
  `GET /livez`, `GET /readyz`.
- For each route, document method/path, the auth requirement (reserved
  role, if any), and the request/response schemas. Also document the
  error statuses that route returns, drawn from 400, 401, 403, 409, 422,
  429, 500. Give each status a one-line trigger; most come from
  `src/http/errors.ts`, but login's come from `src/auth/login.ts`.

**Non-Goals:**
- Documenting `admin/*`, `drafts/*`, `migration-plans/*`, or `registry`.
  These routes serve `packages/admin`/`packages/studio` themselves, not a
  customer integration. Widening scope later is a small follow-on to this
  same file.
- An interactive "try it" console. No host for one exists. A static YAML
  file is enough for a customer to load into their own tool.
- Auto-generation or CI drift-checking against the Zod schemas. That pays
  off once the API surface changes often enough that hand-maintenance
  becomes the bottleneck. It is not the bottleneck today.

## Decisions

**One hand-written OpenAPI 3.0 YAML file, not a generator.** The repo has
no schema-to-OpenAPI tool today (for example `zod-to-openapi`). Adding one
for about 15 routes costs more than transcribing them by hand from
`src/http/routes.ts`'s existing comments and `src/http/errors.ts`'s status
map. OpenAPI is the format every common HTTP tool already reads: Swagger
UI, Postman, and code generators. The file works with no extra tooling.

Two rejected alternatives:
- **Derive the spec from the Zod request schemas with `zod-to-openapi`.**
  This keeps request bodies in sync automatically. Response shapes, error
  mappings, and auth requirements would still need hand-authoring. The
  saving is smaller than the setup cost.
- **A plain Markdown reference instead of OpenAPI.** Simpler to write, but
  no tool can import Markdown to generate API bindings. Both options run
  to about the same length, so Markdown saves nothing.

## Risks / Trade-offs

- [The document drifts from `src/http/routes.ts` as routes change] →
  Mitigation: none automated, by design (see Non-Goals). The author
  updates `docs/openapi.yaml` by hand alongside any route change. A stale
  doc is a known, accepted cost. That stays true until the API surface
  changes often enough to justify tooling.
- [Hand transcription introduces a schema mismatch on day one] →
  Mitigation: tasks.md includes a validation step. It lints
  `docs/openapi.yaml` against the OpenAPI 3.0 schema. The author runs it
  before marking the change complete.

## Migration Plan

No migration. This adds one new file and touches no runtime code or
database schema. The Roadmap task (tasks.md section 3) updates
`ROADMAP.md`. Deploying it is committing the changes.

## Open Questions

None. This document resolves the three corrections above: route list,
404, and login's status source. None stays open. Remaining implementation
is a transcription task from `src/http/routes.ts`, `src/http/errors.ts`,
and `src/auth/login.ts`.
