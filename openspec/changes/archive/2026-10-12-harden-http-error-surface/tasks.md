# Tasks

## 1. The instant check and typed cursors

- [x] 1.1 Add `src/instant.ts` with `isInstant` and `parseInstant` (design decisions 5 and 6). A unit test rejects `"gestern"`, `"1"`, `2026-02-30`, `2026-13-01`, `0000-01-01T00:00:00Z`, `2026-10-11T10:00:00+16:00` and `2026-10-11 10:00:00+99`.
- [x] 1.2 In the same test, accept `2026-10-11T10:00:00.123Z`, `2026-10-11 10:00:00.123456+00` and `2026-10-11T10:00:00+15:59`.
- [x] 1.3 Change `decodeCursor` in `src/pagination.ts` to take an array of kinds: `timestamp`, `int32`, `int64`, `text`. The `text` kind rejects a NUL character. A unit test gives each kind one accepted and one rejected value. Land 1.3 and 1.4 in one commit, because the signature change fails typecheck until the call sites move.
- [x] 1.4 Move every `decodeCursor` call site to kinds read off its SQL cast. The eight sites are `queries.ts`, `record.ts`, `internal.ts` (`pagedRead`), `admin-queries.ts` (three), `groups.ts` and `users.ts`.
- [x] 1.5 For each listing, a test sends a cursor with a wrong value and expects 400. One of them uses a NUL character in a text position.
- [x] 1.6 Add the `ponytail:` comment on `isInstant` that names its ceiling: leap seconds and zone names. Verify with `git grep -n 'ponytail:' -- src`.

## 2. The error path

- [x] 2.1 Wrap the `fetch` closure in `createServer` in a try. Import `mapError` from `./errors.js` and `errorContext` from `./routes.js`. The catch returns `toResponse(mapError(err, errorContext(req)), allowedOrigins, origin)`.
- [x] 2.2 Test the catch with `POST /auth/login` through `createServer` and a database handle that throws `new Error("relation secret_table")`. Expect status 500, `error.type` `internal`, no `message` key and the allowed-origin header. Use `spyOn(console, "error")` to expect a log line with the HTTP verb and the path.
- [x] 2.3 Set `development: false` on `Bun.serve`. Add `ENV NODE_ENV=production` to `docker/engine.Dockerfile`. Two text-level tests read `docker/engine.Dockerfile` and `src/http/server.ts` and expect those two settings, the technique `test/openapi-exclusions.test.ts` uses.
- [x] 2.4 Reject a NUL byte in the login email in `handleLogin`, before either rate-limit window records a try.
- [x] 2.5 A test sends the NUL-byte login through `createServer` and expects the JSON 400 `request-shape` envelope. It reuses the throwing database handle from 2.2 to show that no query runs. A second test sends six such requests, `MAX_ATTEMPTS` plus one, and expects six 400 answers.
- [x] 2.6 Wrap the `getInstanceView` call in the cascade-loop branch of `handleSubmit`. A test wraps `sql` in a `Proxy` that throws on the `instance_drafts` read of `getInstanceView` and forwards everything else. It expects the mapped 500. The test calls `handleSubmit` directly and never goes through `createServer`, because the dispatcher catch of 2.1 would hide a missing local try. It needs a submission that ends in `AutomaticCascadeLoop` (see `test/http.test.ts`). The `Proxy` throws on a statement that selects from `instance_drafts`. `begin` and every other member forward to the real handle.
- [x] 2.7 Start `bun run serve` in the devcontainer with `NODE_ENV=production`, `AUTH_JWT_SECRET` set and a free `PORT`. Send `POST /auth/login` with an unknown email and expect a JSON 401 and the usual startup output.

## 3. JWT algorithms and expiry

- [x] 3.1 Pass `algorithms: ["HS256"]` on the local branch of `src/auth/jwt.ts`. A test signs a local-issuer token with HS512 and expects `ActorResolutionError`.
- [x] 3.2 Pass the asymmetric list, `Ed25519` included, and `requiredClaims: ["exp"]` on the external branch.
- [x] 3.3 Tests cover an external token with no `exp` and a valid one that still resolves. A third test sends an HMAC header to the external branch. Name it a regression guard. jose refuses that header already, so the test proves nothing about the new option.

## 4. Report date bounds

- [x] 4.1 Make `routes.ts` import `parseInstant` from `src/instant.ts`. The existing `GET /instances` date tests still pass. Grep `test/` and `packages/web` for `createdAfter` and `createdBefore` values. The web client sends `toISOString()` only. The tests send ISO strings and one `created_at::text` form.
- [x] 4.2 Refine `createdAfter` and `createdBefore` in `reportQuerySchema` with `isInstant`. Tests cover create, save, draft preview and column choices with `"letzte Woche"`.
- [x] 4.3 Make `parseRange` in `src/http/reporting-routes.ts` test `from` and `to` with `isInstant` before `Date.parse`. A reporting-view test sends `from=0000-01-01` and expects 400.
- [x] 4.4 Assert both bounds in `buildInstanceWhere`.
- [x] 4.5 A test inserts a report row with a bad bound directly. It grants a viewer `read` on the process and runs the report. It expects 400 on `/reporting/reports/:id/table` and on the CSV route. It uses `spyOn(console, "error")` to expect no `unhandled error` entry. A viewer without `read` keeps the empty table.

## 5. Claim on an unknown id

- [x] 5.1 Make `loadForClaim` throw `NotFoundError`. Add the local catch to the three wrappers in `src/runtime/claims.ts` (design decision 7).
- [x] 5.2 Add tests for claim, release and delegate on `inst_doesnotexist`. A non-admin gets 403 `authorization` over HTTP and `AuthorizationError` from the function. An administrator gets the `NotFoundError` answer. Expect no `unhandled error` log entry.

## 6. Documentation

- [x] 6.1 In `docs/openapi.yaml`, document the NUL-byte 400 on `POST /auth/login`. Document the wrong-value 400 on the `cursor` query of list instances, comments, attachments and the record. Document the unknown-id 403 on claim, release and delegate. Report bounds and admin cursors stay out of the file. It excludes `reporting/*` and `admin/*`. Check the YAML diff by eye.
- [x] 6.2 Strike this change's entry in the audit index in `docs/decisions.md`. Rewrite the C-17 note and the WRITE-1 sentence that says an unknown id answers 500, so both say the answer shipped.
- [x] 6.3 Add `src/instant.ts` to the Runtime API Layer paths in `docs/current-state.md`.
- [x] 6.4 In `docs/runbooks/deployment.md`, say in the `AUTH_ISSUERS` row that an external token needs `exp` and an asymmetric algorithm. Fix any line that says the engine image sets no environment variable, because it sets `NODE_ENV=production`.
- [x] 6.5 Run the antislop linter on every Markdown file the change touches, with the push-gate range command from `CLAUDE.md`.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`.
- [x] 7.2 Run `bun run build`.
- [x] 7.3 Run the full `bun test` with `DATABASE_URL` set through `scripts/test-gated.sh` in the devcontainer.
- [x] 7.4 Run the prose and whitespace gates on the host over the push range.
