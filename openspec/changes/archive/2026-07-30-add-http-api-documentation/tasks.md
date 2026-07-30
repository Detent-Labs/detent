## 1. OpenAPI document

- [x] 1.1 Create `docs/openapi.yaml` with `openapi: 3.0.x`, `info`, and
      `servers` sections.
- [x] 1.2 Add `POST /auth/login`: request/response schemas, no auth
      requirement, statuses 400/401/429 built directly in
      `src/auth/login.ts` (this route bypasses `src/http/errors.ts`).
- [x] 1.3 Add `POST /processes` and `GET /processes`: `system:publish` on
      the POST, no requirement on the GET.
- [x] 1.4 Add `GET /processes/:id/versions`.
- [x] 1.5 Add `POST /processes/:processId/instances`.
- [x] 1.6 Add `GET /instances/:id` (no auth requirement) and `GET
      /instances` (filters, pagination). Note that `scope=mine` is open to
      any authenticated actor, but `scope=all` and an omitted `scope`
      alike require `system:admin` (`server.ts::handleListInstances`).
- [x] 1.7 Add `POST /instances/:id/submit`, `/claim`, `/release`: no
      reserved-role requirement, assignment/claim errors per
      `assignment-claim-enforcement`.
- [x] 1.8 Add `POST /instances/:id/delegate`: the calling actor must hold
      the current claim (`NotClaimantError`, 403); no reserved role.
- [x] 1.9 Add `POST /instances/:id/comments` and `GET
      /instances/:id/comments`: no reserved role, participant-visibility
      rules per `getInstanceView`'s access check, `text` capped at 10,000
      characters (400 on violation).
- [x] 1.10 Add `POST /instances/:id/cancel`: the `system:cancel-any` role,
      or `startedBy === actor.id`, per `authorization`.
- [x] 1.11 Add `GET /instances/:id/record`: the `system:admin` role, or
      `system:developer` together with `startedBy === actor.id`
      (`runtime/api.ts::getInstanceRecord`).
- [x] 1.12 Add `GET /livez` and `GET /readyz`: no auth requirement.
- [x] 1.13 For every route except login, list the error statuses
      `src/http/errors.ts` returns for it, drawn from 400, 401, 403, 409,
      422, 500, each with a one-line trigger. Do not list 404 on any
      route: `src/http/errors.ts` never maps a specific route to it, and a
      not-found instance or process returns 500 by design. Do not list
      429 on any route but login: it is not part of `errors.ts`'s
      mapping.
- [x] 1.14 Confirm `admin/*`, `drafts/*`, `migration-plans/*`, and
      `registry` appear nowhere in the document.

## 2. Validation

- [x] 2.1 Lint `docs/openapi.yaml` against the OpenAPI 3.0 schema (for
      example `npx @redocly/cli lint docs/openapi.yaml`, run once, no new
      dependency retained). Valid, 0 errors. 3 accepted warnings remain
      (a missing `info.license`, no meaningful license to state for an
      internal API; and `operation-4xx-response` on `GET /livez`/`GET
      /readyz`, which by design never return one).
- [x] 2.2 Run the antislop linter on any prose sections of the document
      (`info.description`, route `summary`/`description` fields) and fix
      any findings.

## 3. Roadmap

- [x] 3.1 Update `ROADMAP.md` stage 22 from "design DONE, implementation
      NOT STARTED" to DONE, noting the `add-http-api-documentation`
      OpenSpec change and `docs/openapi.yaml`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer. Engine + all four
      frontend packages exit 0.
- [x] 4.2 Run the full `bun test` suite in the devcontainer with
      `DATABASE_URL` set. Confirm no named test fails. A docs-only change
      should not affect any test outcome. 1300 pass, 0 fail, across 79
      files — unaffected, as expected for a docs-only change.
