# Authorize the instance-read and assignment-less submit paths

## Why

Two adjacent holes in the same seam: nothing decides *whether this actor may
touch this instance* on the two runtime-API entry points a participant reaches.

`getInstanceView(instanceId, actor, registry, db)` takes `actor` but makes no
permission decision with it — it uses it only to build the CEL guard context
for `resolveFields`/`resolveAvailablePaths` (`src/runtime/api.ts:530-541`).
`handleGetInstanceView` resolves the actor and calls straight through with no
`requireRole` and no relationship check (`src/http/routes.ts:65-77`). The
response carries every resolved field value out of `instance.data` plus
`availablePaths`. That is inconsistent with this repo's own authorization
spec, which gates the two *weaker* reads: `GET /instances` with `scope=all`
and `GET /instances/:id/record` both require `system:admin`, and the record
route is specified to answer 403 *even for an instance the actor started*.
So the audit trail is admin-only while the actual field values — salary,
disciplinary detail, expense lines — are readable one route over by any
account holding a valid token. Instance ids are not enumerable, but they leak
routinely through `packages/app` URLs, links and support tickets, and an actor
who was legitimately a candidate on step 1 keeps unrestricted read access for
the life of the instance, long after it moves to steps they have no relation
to.

The submit path has the mirror-image gap. Claimant enforcement is wrapped in
`if (instance.assignment) { ... }` (`api.ts:586-589`). `Step.assignment` is
optional, so a step authored without one accepts a submission from any actor
that authenticates — no candidacy, no `startedBy`, no role. That is deliberate
and documented, but the consequence is that omitting one optional authoring
key silently makes an approval step world-writable with no publish-time
diagnostic. The test that pins the behavior creates the instance *as* the
candidate and submits *as* the candidate, so it cannot distinguish "outsider
allowed" from "starter allowed" and proves nothing about outsiders.

Together they compose: the same actor reads the view — including
`availablePaths` — and then drives the instance through it. Both are inside a
stage `ROADMAP.md:167-179` marks Authorization DONE.

## What Changes

- `getInstanceView` gains an object-level authorization predicate, enforced
  inside the runtime API (the documented library seam, where `cancelInstance`
  already authorizes) rather than in `src/http/routes.ts`. An actor may read
  an instance when any of these holds: they carry `system:admin`; they are
  `instance.startedBy`; they are the current claimant; or they are an eligible
  candidate on the current step's assignment. Otherwise `AuthorizationError`,
  already mapped to 403 at `src/http/errors.ts:58`.
- The candidate/claimant arms are evaluated against the *current* step's
  assignment state, so access follows the work rather than outlasting it: a
  past candidate loses the read when the instance moves on.
- `submitAndTransition` gains a floor for the assignment-less case: when
  `instance.assignment` is unset, the actor must be `instance.startedBy` or
  carry `system:admin`. The claimant rules for an assignment-bearing step are
  untouched.
- `isEligibleCandidate` (`src/engine/transition.ts:75-77`) is reused for the
  candidate arm so the read predicate cannot drift from `claimStep`'s.
- The `authorization` spec, currently silent on `GET /instances/:id`, states
  the visibility rule and its relationship to the admin-gated record route.

## Capabilities

### New Capabilities

None. This closes gaps in `authorization` and `runtime-api`, both of which
exist.

### Modified Capabilities

- `authorization`: adds a requirement that reading one instance is
  object-level authorized by relationship (admin / starter / claimant /
  current candidate), and that an actor with no relationship is refused
  identically whether or not the instance exists.
- `runtime-api`: `getInstanceView` becomes an authorized read rather than an
  open one; `submitAndTransition`'s "a step with no declared assignment is
  unaffected" scenario is replaced by the starter-or-admin floor.

## Impact

- `src/runtime/api.ts` — the predicate in `getInstanceView`, the floor in
  `submitAndTransition`, one import from `src/engine/transition.ts`.
- No HTTP-layer change: `AuthorizationError` already maps to 403 and
  `handleGetInstanceView` already resolves the actor.
- **BREAKING for API consumers** that read an instance they have no
  relationship to. `packages/app` is unaffected — it reaches a task from a
  `scope=mine` inbox (claimed-by-me or I-am-a-candidate) and navigates away
  after submitting rather than re-reading the view. `packages/admin` reads
  instances with `system:admin`. `packages/studio` does not read instance
  views.
- Tests: an HTTP 403 test for a third-party actor on `GET /instances/:id`
  mirroring the existing record-route test, runtime-API tests for each arm of
  the predicate, and a submit test asserting the already-defined `outsider`
  fixture is rejected on an assignment-less step.
