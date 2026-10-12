# Tasks

## 1. The instant check and typed cursors

- [ ] 1.1 Add `src/instant.ts` with `isInstant` and `parseInstant` (design decisions 5 and 6). A unit test rejects `"gestern"`, `"1"`, `2026-02-30` and `2026-13-01`.
- [ ] 1.2 In the same test, accept `2026-10-11T10:00:00.123Z` and `2026-10-11 10:00:00.123456+00`.
- [ ] 1.3 Change `decodeCursor` in `src/pagination.ts` to take an array of kinds: `timestamp`, `int32`, `int64`, `text`. A unit test gives each kind one accepted and one rejected value.
- [ ] 1.4 Move every `decodeCursor` call site to kinds read off its SQL cast. The sites are `queries.ts`, `record.ts`, `internal.ts` (`pagedRead`), `admin-queries.ts` (three), `groups.ts` and `users.ts`.
- [ ] 1.5 For each listing, a test sends a cursor with a wrong value and expects 400.
- [ ] 1.6 Add the `ponytail:` comment on `isInstant` that names its ceiling. Verify with `git grep -n 'ponytail:' -- src`.

## 2. The error surface

- [ ] 2.1 Wrap the `fetch` closure in `createServer` in a try. The catch returns `toResponse(mapError(err, ctx), allowedOrigins, origin)`.
- [ ] 2.2 A test gives the server a database handle that throws. It expects a JSON 500 with CORS headers and no `message`.
- [ ] 2.3 Set `development: false` on `Bun.serve`. Add `ENV NODE_ENV=production` to `docker/engine.Dockerfile`. A test reads the Dockerfile text and expects the line.
- [ ] 2.4 Reject a NUL byte in the login email in `handleLogin`, before the try count.
- [ ] 2.5 A test sends the NUL-byte login through `createServer` and expects the JSON 400 `request-shape` envelope. A second test shows the try count stays unchanged.
- [ ] 2.6 Wrap the `getInstanceView` call in the cascade-loop branch of `handleSubmit`. A test makes the read fail and expects the mapped error.

## 3. JWT algorithms and expiry

- [ ] 3.1 Pass `algorithms: ["HS256"]` on the local branch of `src/auth/jwt.ts`. A test signs a local-issuer token with HS512 and expects `ActorResolutionError`.
- [ ] 3.2 Pass the asymmetric list and `requiredClaims: ["exp"]` on the external branch.
- [ ] 3.3 Tests cover an external token with no `exp`, one with an HMAC header, and a valid one that still resolves.

## 4. Report date bounds

- [ ] 4.1 Make `routes.ts` import `parseInstant` from `src/instant.ts`. The existing `GET /instances` date tests still pass.
- [ ] 4.2 Refine `createdAfter` and `createdBefore` in `reportQuerySchema` with `isInstant`. Tests cover create, save, draft preview and column choices with `"letzte Woche"`.
- [ ] 4.3 Assert both bounds in `buildInstanceWhere`.
- [ ] 4.4 A test inserts a report row with a bad bound directly. It runs the report as a viewer and expects 400 with no `unhandled error` log entry.

## 5. Claim on an unknown id

- [ ] 5.1 Make `loadForClaim` throw `NotFoundError`. Add the local catch to the three wrappers in `src/runtime/claims.ts` (design decision 7).
- [ ] 5.2 Add tests for claim, release and delegate on `inst_doesnotexist`. A non-admin gets 403 `authorization`. An administrator gets the `NotFoundError` answer. The log has no `unhandled error` entry.

## 6. Documentation

- [ ] 6.1 Document the new 400 on login, cursors and report bounds in `docs/openapi.yaml`. Document the 403 on claim, release and delegate there too. Verify with the openapi test in the suite.
- [ ] 6.2 Strike this change's entry in the audit index in `docs/decisions.md`. Rewrite the C-17 note to say the answer shipped.
- [ ] 6.3 Run the antislop linter on every Markdown file the change touches, with the push-gate range command from `CLAUDE.md`.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`.
- [ ] 7.2 Run `bun run build`.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set through `scripts/test-gated.sh` in the devcontainer.
- [ ] 7.4 Run the prose and whitespace gates on the host over the push range.
