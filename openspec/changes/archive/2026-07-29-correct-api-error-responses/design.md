## Context

`http-wrapper` established the mapping discipline: the Runtime API Layer
throws typed errors, `mapError` turns each into a status and a body shape, and
everything else falls through to 500. The fallback was written when
"everything else" meant the Runtime API Layer's own untyped not-found
`Error`s, and the spec pinned that case explicitly (500 with the message, not
404) because at the time the message *was* the useful part.

Since then the surface has grown — admin routes, studio routes, drafts,
migration plans, a login route, plugin handlers, and a much larger `Bun.sql`
footprint — while the fallback branch has not. It now reflects any throw from
any of them, and it is the only branch in the file that leaks text the engine
did not choose to expose.

The other three defects are the same class from the input side: a value
arriving from a client is trusted (`as {...}`, `JSON.parse`), or a state check
that exists in the engine is not made at the boundary that reports to the
client.

## Goals / Non-Goals

**Goals:**

- A 500 tells the operator what happened and the client only that something
  did.
- A client mistake is a 4xx, consistently across routes.
- An operation that did nothing does not report success.

**Non-Goals:**

- Changing not-found from 500 to 404. It is deliberate, spec-pinned and
  tested; this change preserves it by typing it, and records the question.
- Structured logging, log levels, or a logging abstraction. Observability is
  ROADMAP stage 15. `console.error` at one site is the smallest thing that
  removes "zero server-side trace", and it is trivially replaceable when the
  real thing lands.
- Auditing every remaining untyped `throw new Error(...)` in the engine. Only
  the Runtime API Layer's not-found throws are typed here, because they are
  the ones the spec pins to a response shape.
- Changing the engine-level non-running no-op. It is correct for internal
  idempotent re-entry — a timer firing against an instance a cascade already
  completed must not throw — and the fix belongs at the boundary that has a
  caller to answer.

## Decisions

**Log at the fallback, return nothing but the type.** The two halves are one
decision: the message has to go somewhere, and the server is the correct
somewhere. Returning `{ error: { type: "internal" } }` matches
`ConcurrencyConflict`'s existing message-free shape, so no new body shape is
introduced. Threading the request method and path into the log costs one
parameter from `server.ts` and is what makes the log entry actionable —
without it, an operator has a stack and no request.

**Type the not-found throws rather than special-casing them in the
fallback.** The alternative — keep the fallback message-bearing for `Error`s
originating in `api.ts` — is undecidable at the catch site. A `NotFoundError`
in `src/errors.ts` (beside `RequestShapeError`) added to `MESSAGE_ERRORS` at
status 500 keeps the pinned scenario exactly, while everything genuinely
unexpected goes message-free. The spec scenario and its pinning test are
updated to name the typed error, which is a strictly better pin: it now
asserts the engine's intent rather than the absence of a mapping.

**Keep not-found at 500.** Changing it to 404 is defensible and is what most
APIs do, but it is a contract change for every consumer and its rationale is
recorded in the http-wrapper design. Doing it inside a change about error
*hygiene* would smuggle a semantic decision through. Recorded as an open
question.

**Reject non-running at the runtime-API boundary, not in the route.** Same
argument as everywhere else in this repo: the runtime API is the documented
library seam, and a second in-process caller must get the same answer as an
HTTP one. `InstanceNotRunningError` carries the instance id and the observed
status, so a client can tell "already finished" from "cancelled".

**409, not 404 or 422.** The instance exists and the request is well-formed;
what fails is a state precondition. That is exactly what
`NotClaimedError`/`NotClaimantError` (403 on a *permission* precondition) and
`GuardRefused`/`DraftConflictError` (409) already model, and 409 is the one
that says "the resource is not in a state that permits this".

**The concurrent-submit test changes to one fulfilled, one 409.** This is the
sharpest edge of the change and it is the reason the existing test is quoted
in the proposal. Today the loser's data is discarded under a 200; after this,
the loser is told. Both participants submitted in good faith and the second
one's work is gone either way — the difference is whether their client can
tell them so and re-drive them to the current state. There is no third option
that keeps the data, because the step it belonged to has already been left.

**Validate the cursor in one place and delete the duplicate.** The helper pair
exists twice, verbatim, in `api.ts` and `admin-queries.ts`. Fixing it twice
would double the defect's surface at the moment we touch it; extracting it
into one module is the smaller diff over the change's lifetime and is already
an outstanding finding in `PONYTAIL-AUDIT.md`. The validation itself is
deliberately shallow — "a JSON array of N strings" — because that is exactly
what the encoder produces and what the callers destructure. A cursor whose
*values* are stale or nonsensical remains a legitimate empty page, not an
error: keyset pagination has always had that property.

**Zod for the two request bodies, not hand-written checks.** `handlePublish`
already parses its body with Zod and raises `RequestShapeError`; matching it
keeps one idiom at the boundary. The schemas are deliberately loose about
`data` (`z.record(z.unknown())`), because the *field-level* validation is
`validateSubmissionData`'s job and duplicating it at the transport edge would
create two places to change a rule.

## Risks / Trade-offs

- **A client that showed `error.message` on a 500 now shows nothing** →
  Intended. The SPAs map `error.type` through their own localized catalog, so
  they are unaffected; an out-of-tree consumer loses text it should not have
  had, and the operator gains the same text in the log.
- **A submission racing to a just-completed instance now fails visibly**
  where it previously appeared to succeed → The point of the change. Clients
  should refetch the view on a 409, which `packages/app`'s `withErrorHandling`
  already does for its sibling errors.
- **`console.error` in a library** — the engine is embeddable, and a host may
  not want the engine writing to stderr → Accepted for now: a silent failure
  path is worse than an opinionated one, and ROADMAP stage 15 will replace it
  with an injectable sink. Confining it to the single fallback branch keeps
  that replacement to one call site.
- **Typing the not-found throws touches twelve sites in `api.ts`** → Mechanical,
  and `tsc` plus the existing 500-asserting tests cover it. Only the sites the
  spec's not-found scenario describes need to change; the rest may stay untyped
  and go message-free, which is the correct outcome for them.
- **A 400 where a 500 used to be may look like a regression to a monitoring
  rule** counting 4xx → It is the fix: caller errors stop firing server-fault
  alerts.

## Migration Plan

No data or schema change.

1. Land the typed errors and the mapping together with the updated
   http-wrapper scenarios, so the spec and the code never disagree.
2. Update `test/runtime-api.test.ts:652-675` in the same commit, deliberately,
   with the reason in the commit message — it is the current contract.
3. Announce the two breaking response changes to any out-of-tree consumer: a
   409 on a non-running instance, and a message-free 500 body.
4. Rollback is reverting the commit; no persisted state is involved.

## Open Questions

- Should not-found be 404 rather than 500? The rationale for 500 predates the
  admin and studio surfaces, where "no such draft"/"no such process" is an
  ordinary client condition rather than an engine fault. Worth its own change;
  typing the error here is the prerequisite either way.
- Should `PinMismatch` also stop carrying both definition hashes to the
  client? It is a genuine engine fault and its detail is operator-shaped, not
  client-shaped. Left alone here because it is a *typed*, deliberate mapping
  rather than a fallback leak — changing it is a decision about that mapping.
