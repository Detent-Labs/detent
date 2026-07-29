## 1. Two new typed errors

- [x] 1.1 Add `NotFoundError` to `src/errors.ts`, beside `RequestShapeError`
- [x] 1.2 Add `InstanceNotRunningError` there too, carrying the instance id
  and the observed status so a client can tell "finished" from "cancelled"
- [x] 1.3 Replace the not-found `throw new Error(...)` sites in
  `src/runtime/api.ts` (`:169`, `:215`, `:219`, `:481`, `:486`, `:574`,
  `:578`, `:597`) with `NotFoundError`. Leave the genuinely-internal ones
  (`:254` unregistered data-source type, `:292` defensive data-source lookup,
  `:320` step-not-in-body) untyped — they are engine faults and *should* go
  message-free

## 2. Fallback: log server-side, disclose nothing

- [x] 2.1 In `src/http/errors.ts`, add `NotFoundError` (500, `internal`) and
  `InstanceNotRunningError` (409, `instance-not-running`) to `MESSAGE_ERRORS`
- [x] 2.2 Rewrite the fallback at `:80-81` to return
  `{ error: { type: "internal" } }` with no message
- [x] 2.3 `console.error` in that branch with the error, its stack, and the
  request method and path — thread the latter two in from `server.ts` as a
  parameter to `mapError` (or a small context object), since `mapError`
  currently sees only the thrown value
- [x] 2.4 Update the module docblock (`errors.ts:1-8`), which describes the
  removed message passthrough as the design

## 3. Reject non-running operations at the boundary

- [x] 3.1 In `submitAndTransition`, after `parseInstance` at `api.ts:575`,
  throw `InstanceNotRunningError` when `instance.status !== "running"` —
  before the claim check, so a non-running instance answers the same way
  regardless of who asks
- [x] 3.2 Do the same for `claimStep` and `releaseClaim`. They delegate to
  `src/engine/transition.ts`, so add the check in the engine functions'
  locked read, or in the runtime-API wrappers — whichever keeps the engine's
  internal `updateAssignment` no-op intact for internal callers
- [x] 3.3 Leave `commitManualTransition`'s `if (instance.status !== "running")
  return instance;` (`transition.ts:447`) and `updateAssignment`'s equivalent
  (`:870`) exactly as they are, and comment why: internal idempotent re-entry
  must not throw

## 4. Parse the two cast request bodies

- [x] 4.1 In `src/http/routes.ts::handleSubmit` (`:89`), parse with
  `{ pathId: z.string(), data: z.record(z.unknown()).default({}) }`, raising
  `RequestShapeError` — mirroring `handlePublish` (`:221-225`)
- [x] 4.2 In `handleCreateInstance` (`:59`), parse with
  `{ version: z.number().int().positive().optional(), data:
  z.record(z.unknown()).optional() }`
- [x] 4.3 Catch the `req.json()` rejection in both and raise
  `RequestShapeError`, so malformed JSON is a 400 like it already is on
  publish and login
- [x] 4.4 Keep both schemas shallow: field-level validation stays in
  `validateSubmissionData`, and must not be duplicated at the transport edge

## 5. Validate and de-duplicate the cursor helpers

- [x] 5.1 Extract `encodeCursor`/`decodeCursor` into one module (they are
  duplicated verbatim in `src/runtime/api.ts:160-165` and
  `src/engine/admin-queries.ts:44-48` — `PONYTAIL-AUDIT.md` finding 9)
- [x] 5.2 In the extracted `decodeCursor`, wrap the decode and `JSON.parse` in
  a `try` and validate the result is an array of strings of the expected
  arity, raising `RequestShapeError` otherwise. Take the arity as a parameter —
  the instance listing and the admin listings encode different tuples
- [x] 5.3 Import it at all four call sites and delete both local copies
- [x] 5.4 Confirm a stale-but-well-formed cursor still yields an empty page
  rather than an error

## 6. Tests

- [x] 6.1 An unexpected internal failure returns `{ error: { type: "internal" } }`
  with no `message` — force one through a route with a deliberately broken
  dependency, not by mocking
- [x] 6.2 The typed not-found still answers 500 with a message: update the
  existing pinning test to name `NotFoundError` rather than relying on the
  fallback
- [x] 6.3 Submit to a cancelled instance is 409 `instance-not-running` and
  writes nothing; the same for a faulted instance, twice in a row
- [x] 6.4 Claim and release against a non-running instance are 409
- [x] 6.5 **Change** `test/runtime-api.test.ts:652-675` to assert one fulfilled
  and one `InstanceNotRunningError` — it currently asserts both fulfilled,
  which is the contract this change replaces. Do this deliberately, with the
  reason in the commit message
- [x] 6.6 Submit with no `data`, submit with no `pathId`, and malformed JSON on
  both submit and create: each 400 `request-shape`
- [x] 6.7 `GET /instances?cursor=%%%` is 400; a well-formed wrong-arity cursor
  is 400; an admin listing behaves identically
- [x] 6.8 Check `test/http.test.ts` for tests asserting `error.message` on a
  500 — each one is either a typed error (keeps its message) or the fallback
  (loses it), and must be re-read rather than adjusted

## 7. Documentation

- [x] 7.1 `docs/current-state.md`: the error-mapping entry — the two new
  types, the message-free fallback, and the fact that the HTTP layer now logs
- [x] 7.2 Note in the same entry that not-found remains 500 deliberately, so
  the next reader does not re-derive the question

## 8. Verification

- [x] 8.1 Run `bun run typecheck` from the repo root and confirm it passes
- [x] 8.2 Run the FULL `bun test` suite with `DATABASE_URL` set, from the repo
  root, and confirm it passes — check the skip count, not only the pass count
- [x] 8.3 Verify each new test fails without its fix, on a scratch copy of the
  tree — never by mutating the shared working tree
