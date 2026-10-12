# Tasks

## 1. The instant check and typed cursors

- [ ] 1.1 Add `src/instant.ts` with `isInstant` and `parseInstant` (design decisions 5 and 6). A unit test rejects `"gestern"`, `"1"`, `2026-02-30`, `2026-13-01`, `0000-01-01T00:00:00Z`, `2026-10-11T10:00:00+16:00` and `2026-10-11 10:00:00+99`.
- [ ] 1.2 In the same test, accept `2026-10-11T10:00:00.123Z`, `2026-10-11 10:00:00.123456+00` and `2026-10-11T10:00:00+15:59`.
- [ ] 1.3 Change `decodeCursor` in `src/pagination.ts` to take an array of kinds: `timestamp`, `int32`, `int64`, `text`. The `text` kind rejects a NUL character. A unit test gives each kind one accepted and one rejected value. Land 1.3 and 1.4 in one commit, because the signature change fails typecheck until the call sites move.
- [ ] 1.4 Move every `decodeCursor` call site to kinds read off its SQL cast. The eight sites are `queries.ts`, `record.ts`, `internal.ts` (`pagedRead`), `admin-queries.ts` (three), `groups.ts` and `users.ts`.
- [ ] 1.5 For each listing, a test sends a cursor with a wrong value and expects 400. One of them uses a NUL character in a text position.
- [ ] 1.6 Add the `ponytail:` comment on `isInstant` that names its ceiling: leap seconds and zone names. Verify with `git grep -n 'ponytail:' -- src`.

## 2. The error path

- [ ] 2.1 Wrap the `fetch` closure in `createServer` in a try. Import `mapError` from `./errors.js` and `errorContext` from `./routes.js`. The catch returns `toResponse(mapError(err, errorContext(req)), allowedOrigins, origin)`.
- [ ] 2.2 Test the catch with `POST /auth/login` through `createServer` and a database handle that throws `new Error("relation secret_table")`. Expect status 500, `error.type` `internal`, no `message` key and the allowed-origin header. Use `spyOn(console, "error")` to expect a log line with the HTTP verb and the path.
- [ ] 2.3 Set `development: false` on `Bun.serve`. Add `ENV NODE_ENV=production` to `docker/engine.Dockerfile`. Two text-level tests read `docker/engine.Dockerfile` and `src/http/server.ts` and expect those two settings, the technique `test/openapi-exclusions.test.ts` uses.
- [ ] 2.4 Reject a NUL byte in the login email in `handleLogin`, before either rate-limit window records a try.
- [ ] 2.5 A test sends the NUL-byte login through `createServer` and expects the JSON 400 `request-shape` envelope. It reuses the throwing database handle from 2.2 to show that no query runs. A second test sends six such requests, `MAX_ATTEMPTS` plus one, and expects six 400 answers.
- [ ] 2.6 Wrap the `getInstanceView` call in the cascade-loop branch of `handleSubmit`. A test wraps `sql` in a `Proxy` that throws on the `instance_drafts` read of `getInstanceView` and forwards everything else. It expects the mapped 500.
- [ ] 2.7 Start `bun run serve` with `NODE_ENV=production`. Send `POST /auth/login` with a wrong password and expect a JSON 401 and the usual startup output.

## 3. JWT algorithms and expiry

- [ ] 3.1 Pass `algorithms: ["HS256"]` on the local branch of `src/auth/jwt.ts`. A test signs a local-issuer token with HS512 and expects `ActorResolutionError`.
- [ ] 3.2 Pass the asymmetric list, `Ed25519` included, and `requiredClaims: ["exp"]` on the external branch.
- [ ] 3.3 Tests cover an external token with no `exp` and a valid one that still resolves. A third test sends an HMAC header to the external branch. Name it a regression guard. jose refuses that header already, so the test proves nothing about the new option.

## 4. Report date bounds

- [ ] 4.1 Make `routes.ts` import `parseInstant` from `src/instant.ts`. The existing `GET /instances` date tests still pass. Grep `test/` and `packages/web` for `createdAfter` and `createdBefore` values. The web client sends `toISOString()` only. The tests send ISO strings and one `created_at::text` form.
- [ ] 4.2 Refine `createdAfter` and `createdBefore` in `reportQuerySchema` with `isInstant`. Tests cover create, save, draft preview and column choices with `"letzte Woche"`.
- [ ] 4.3 Assert both bounds in `buildInstanceWhere`.
- [ ] 4.4 A test inserts a report row with a bad bound directly. It grants a viewer `read` on the process and runs the report. It expects 400 on `/reporting/reports/:id/table` and on the CSV route. It uses `spyOn(console, "error")` to expect no `unhandled error` entry. A viewer without `read` keeps the empty table.

## 5. Claim on an unknown id

- [ ] 5.1 Make `loadForClaim` throw `NotFoundError`. Add the local catch to the three wrappers in `src/runtime/claims.ts` (design decision 7).
- [ ] 5.2 Add tests for claim, release and delegate on `inst_doesnotexist`. A non-admin gets 403 `authorization` over HTTP and `AuthorizationError` from the function. An administrator gets the `NotFoundError` answer. Expect no `unhandled error` log entry.

## 6. Documentation

- [ ] 6.1 In `docs/openapi.yaml`, document the NUL-byte 400 on `POST /auth/login`. Document the wrong-value 400 on the `cursor` query of list instances, comments, attachments and the record. Document the unknown-id 403 on claim, release and delegate. Report bounds and admin cursors stay out of the file. It excludes `reporting/*` and `admin/*`. Check the YAML diff by eye.
- [ ] 6.2 Strike this change's entry in the audit index in `docs/decisions.md`. Rewrite the C-17 note and the WRITE-1 sentence that says an unknown id answers 500, so both say the answer shipped.
- [ ] 6.3 Add `src/instant.ts` to the Runtime API Layer paths in `docs/current-state.md`.
- [ ] 6.4 Run the antislop linter on every Markdown file the change touches, with the push-gate range command from `CLAUDE.md`.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`.
- [ ] 7.2 Run `bun run build`.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set through `scripts/test-gated.sh` in the devcontainer.
- [ ] 7.4 Run the prose and whitespace gates on the host over the push range.
