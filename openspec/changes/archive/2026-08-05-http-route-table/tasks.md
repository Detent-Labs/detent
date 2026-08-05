## 1. The matching helpers

- [x] 1.1 Add `type Route = { method, segments, handler }` to
  `src/http/server.ts`, above `createServer`. The handler returns
  `Promise<HttpResult | HttpBinaryResult>` and takes `(params, req)`.
- [x] 1.2 Add `seg(pattern: string): string[]`, splitting on `/` and dropping
  empties. It runs at table construction, never per request.
- [x] 1.3 Add `match(segments: string[], parts: string[]): string[] | null`.
  Compare length first, then each literal segment. Collect a `:` segment's
  value into the returned array, in pattern order.

## 2. The table

- [x] 2.1 Build `routes: Route[]` inside `createServer`, before the returned
  `fetch`. Transcribe every entry from the current handler chain at lines
  399-598, in that order, closing over the dependencies each handler reads.
- [x] 2.2 Spread the `POST /auth/login` entry conditionally on `loginSecret`,
  so an unset secret leaves the path in no entry.
- [x] 2.3 List `GET` before `POST` for three patterns: `/processes`,
  `/instances/:instanceId/comments` and `/instances/:instanceId/attachments`.
  The derived preflight then emits `"GET, POST"`.
- [x] 2.4 Confirm the table holds every route the old chain held. Count the
  entries against the 49 handler branches at lines 399-598.
- [x] 2.5 Run `bun run typecheck`. `noUnusedLocals` reports any handler
  import no table entry names.

## 3. The dispatcher

- [x] 3.1 Keep the navigation branch, the three probe branches, the static
  branch and the 404 exactly as they are.
- [x] 3.2 Delete the `OPTIONS` if-chain at lines 289-396. Replace it with:
  on `OPTIONS`, collect the entries whose segments match `parts`, and answer
  `preflight(matched.map((r) => r.method).join(", "))` when any matched.
- [x] 3.3 Delete the handler if-chain. Replace it with a loop over `routes`.
  Take the first entry whose method equals `req.method` and whose segments
  match, then await its handler.
- [x] 3.4 Run the result through `isBinaryResult` once, at that single exit,
  and drop the per-route branch on the attachment download.

## 4. Tests

- [x] 4.1 Add a test in `test/reporting-routes.test.ts` that
  `OPTIONS /reporting/processes` answers `204` with
  `Access-Control-Allow-Methods: GET`. This is the gap the derivation closes.
- [x] 4.2 Add a test in the same file that
  `OPTIONS /reporting/:processId/cycle-time` answers the same way.
- [x] 4.3 Add a test that `OPTIONS /metrics` gets the unmatched-route 404.
  Match the two `livez`/`readyz` tests in `test/health.test.ts`.

## 5. Documentation

- [x] 5.1 Update `src/http/server.ts`'s header comment. Today it calls the
  file wiring around `routes.ts`. State that the route table is the one place
  a route's method and path shape appear.
- [x] 5.2 Amend `docs/current-state.md` line 2176. It records that a route
  needs its own `OPTIONS` preflight entry. State that the derived preflight
  removes that failure mode.
- [x] 5.3 Append a `## HTTP route table (\`http-route-table\`)` section to
  `docs/current-state.md`, following the one-section-per-change convention.
- [x] 5.4 Update the Purpose in
  `openspec/specs/http-route-handling-consolidation/spec.md`. It names
  `src/http/errors.ts` and `src/http/routes.ts`. Add `src/http/server.ts` and
  the fourth duplication, route dispatch stated twice.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`. Report what it printed.
- [x] 6.2 Run the FULL `bun test` with `DATABASE_URL` set, inside the
  devcontainer. Report the pass count AND the skip count. A single-file rerun
  is not the signal.
- [x] 6.3 Run the antislop linter over `proposal.md`, `design.md`,
  `tasks.md`, both spec deltas and `docs/current-state.md`.
- [x] 6.4 Run `git diff --check`.
- [x] 6.5 Run `git ls-files --eol`. Read the `w/` column for CRLF.
- [x] 6.6 Start the server with `WEB_ROOT` set. Load the admin area in a
  browser. No test covers the navigation-before-routing branch or the
  `/admin/*` collision.
