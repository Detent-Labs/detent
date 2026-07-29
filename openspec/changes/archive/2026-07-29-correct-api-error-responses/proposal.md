# Say what actually happened at the HTTP boundary

## Why

Four defects in how the boundary answers. Each turns a caller's mistake, or a
no-op, into the wrong answer — and in one direction the wrong answer is a
success.

**The 500 fallback reflects arbitrary internal error text while logging
nothing.** `mapError`'s final branch returns `err.message` verbatim for every
unrecognized throw (`errors.ts:80-81`). The passthrough is deliberate for the
narrow untyped *not-found* case — the `http-wrapper` spec pins it — but the
branch is unconditional, so it also reflects whatever `Bun.sql`, `JSON.parse`
or a plugin handler throws, and Postgres errors carry relation, column and
constraint names. `PinMismatch` separately returns a 500 carrying both
definition hashes. Meanwhile the HTTP layer logs nothing at all: the only
`console.` calls in `src/` are `src/auth/cli.ts` and the startup banner. The
asymmetry is backwards — the client gets the diagnostic detail and the
operator gets nothing, so a probing campaign and a genuine production fault
both leave zero server-side trace, on a server whose `/admin/*` routes exist
to give operators visibility.

**Submitting to a non-running instance discards the data and returns 200.**
`commitManualTransition` opens with `if (instance.status !== "running") return
instance;` (`transition.ts:447`). `submitAndTransition` row-locks the instance,
resolves and hash-checks the body, enforces the claim, validates the data, and
calls it — without ever inspecting `instance.status`. For a `cancelled`,
`completed` or `faulted` instance the call returns the untouched instance, the
transaction commits zero writes, and `routes.ts:90` returns it as a normal
200. `updateAssignment` has the same shape for claim/release
(`transition.ts:870`). The engine-level no-op is deliberate and tested; the
API-boundary consequence is not. `test/runtime-api.test.ts:652-675` encodes it
exactly: two concurrent submissions both resolve fulfilled, one commits, and
the loser relies on "commitManualTransition's existing non-running no-op" — a
lost update reported as success, with the losing participant's form data
discarded under a 200. The permanent variant is a `faulted` instance: every
later submission returns 200 forever with the data thrown away.

**Request bodies are cast, not parsed.** `POST /instances/:id/submit` and
`POST /processes/:id/instances` both do `(await req.json()) as {...}` with no
validation (`routes.ts:89`, `:59`). Two traced failures: a submit with no
`data` reaches `validateSubmissionData`, whose `Object.keys(data)` throws
`TypeError` — mapped to 500; and malformed JSON throws `SyntaxError` from
`req.json()` — also 500, while `handlePublish` and `handleLogin` deliberately
map exactly that condition to 400 `request-shape`. The same client error is a
400 on publish and a 500 on submit. The repo already has the tool:
`RequestShapeError` is used by `parseLimit`/`parseStatuses`/`parseScope`.

**Pagination cursors are client blobs decoded with `JSON.parse`.**
`decodeCursor` base64url-decodes and parses caller-controlled input with no
shape check (`api.ts:163-165`), and the destructured elements go straight into
Postgres casts. A cursor that is not base64, not JSON, or JSON of the wrong
shape produces an uncaught `SyntaxError` or a Postgres cast error — both 500,
on a route any authenticated actor reaches with `scope=mine`, on every scroll.
(SQL injection is not possible; Bun.sql tagged templates parameterise.) The
same helper pair is duplicated verbatim in `src/engine/admin-queries.ts:44-48`,
already flagged as duplication in `PONYTAIL-AUDIT.md` finding 9 — so the fix
belongs in one extracted copy, not two.

## What Changes

- The 500 fallback logs server-side (`console.error` with the error, its
  stack, and the request method and path) and returns `{ error: { type:
  "internal" } }` with **no message** — the message-free shape
  `ConcurrencyConflict` already uses.
- A typed `NotFoundError` in `src/errors.ts` replaces the untyped throws in
  `src/runtime/api.ts` and maps to 500 with a message, so the spec-pinned
  not-found behavior survives the fallback becoming message-free. Its status
  is unchanged (500, not 404) — that is a separate decision, recorded as an
  open question rather than made here.
- A typed `InstanceNotRunningError`, thrown at the runtime-API boundary when
  an operation targets a non-running instance, mapped to 409. The engine-level
  no-op stays for internal idempotent re-entry.
- Both cast request bodies are parsed with Zod and raise `RequestShapeError`
  (400), exactly as `handlePublish` already does.
- `decodeCursor` validates: base64url decode and `JSON.parse` inside a
  `try`, the decoded value checked as a string array of the expected arity,
  `RequestShapeError` otherwise. The duplicated helper pair is extracted to
  one module and imported by both callers.

## Capabilities

### Modified Capabilities

- `http-wrapper`: the error-mapping table gains `NotFoundError` and
  `InstanceNotRunningError`; the catch-all fallback stops reflecting internal
  message text and starts logging it; create and submit bodies are validated;
  a malformed cursor is a 400.
- `runtime-api`: an operation against a non-running instance is rejected at
  the boundary rather than silently succeeding.

The cursor rule is specified under `http-wrapper` rather than `instance-query`
because what changes is the *response* a malformed cursor produces; the
listing semantics `instance-query` describes are untouched, and a stale cursor
remains a legitimate empty page.

## Impact

- `src/http/errors.ts` — the fallback branch, two new mappings.
- `src/errors.ts` — `NotFoundError`, `InstanceNotRunningError`.
- `src/runtime/api.ts` — the untyped throws become typed; the status check in
  `submitAndTransition` and `updateAssignment`'s callers; `decodeCursor`
  removed in favour of the shared helper.
- `src/engine/admin-queries.ts` — imports the shared helper instead of its
  copy.
- `src/http/routes.ts` — two Zod parses; `src/http/server.ts` — threading
  method and path into the fallback log.
- **BREAKING for API consumers** in two ways, both deliberate: a submission to
  a non-running instance now answers 409 instead of 200, and a 500 body no
  longer carries `error.message`. Clients that displayed the internal message
  will show a generic failure instead — `packages/*/src/errors.ts` already
  maps `type` to a localized string, so the SPAs are unaffected.
- `test/runtime-api.test.ts:652-675` must change to assert one fulfilled and
  one 409. That test *is* the current contract, so the change is deliberate,
  not an adjustment to make a suite pass.
- Interacts with `authorize-instance-access`: that change modifies the same
  `runtime-api` submit requirement, so this one deliberately expresses the
  non-running rule as its own requirement covering submit, claim and release
  rather than editing that text a second time.
