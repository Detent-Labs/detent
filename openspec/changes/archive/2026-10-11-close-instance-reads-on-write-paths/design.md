# Design

## Context

`loadInstanceForActor` (`src/runtime/internal.ts`) holds the read rule. Its
order is: administrator, test-instance starter, live assignment, then
participation unless a revocation names the actor. `buildVisibleRowSet`
(`src/runtime/queries.ts`) applies the same rule to the visible scope. See
`proposal.md` for the motivation.

Seven code paths skip that rule today.

- `cancelInstance` loads through `loadInstanceForRead`, which checks nothing.
  The engine returns the whole `Instance`.
- `claimStep`, `releaseClaim` and `delegateClaim` return the engine's
  `Instance` too.
- `buildInstanceWhere` has no revocation term, so `scope=started` ignores one.
- `getInstanceRecord` loads through `loadInstanceForRead`. Its starter branch
  tests `startedBy` alone.
- `changeVisibility` loads through `loadInstanceForRead`. A missing instance
  raises `NotFoundError`, which `mapError` turns into a 500.
- `submitAndTransition` and `saveInstanceDraft` raise `InstanceNotRunningError`
  with the status before any read check. They raise `NotFoundError` for an
  unknown id.
- `POST /instances/:id/submit` returns the full `Instance`. The owner ruled
  that route out of this change.

Seven web client calls reach the four write routes. Each types its result
`Promise<void>` and drops the body. Two test files read the runtime wrappers'
results: `assignment.runtime-api.test.ts` and `draft-test-instances.test.ts`.
They read `assignment` and `status` only. Four more files import the wrappers
from `src/runtime/api.js` and discard the result. The other test files that
call these names use the engine functions, which do not change.

The owner and the coordinator ruled on 2026-10-11. The response shape is the
write result, in the Runtime API and over HTTP. A revoked starter's row
disappears from the started scope, and a live assignment outranks the
revocation. CLAIM-1 stays separate.

A revoked starter gets the opaque 403 on a finished instance. Claim, release
and delegate keep their order. Cancel on a non-running instance keeps its
idempotent no-op. The submit route stays out.

## Goals / Non-Goals

**Goals:**

- Cancel, claim, release and delegate return no member of the instance that a
  read would refuse.
- A revocation holds on every read path the audit found.
- A write call reveals a finished instance's status to readers only.

**Non-Goals:**

- The submit route's body. A writer who may not read gets the full `Instance`
  there. The owner ruled it out of this change, and `docs/decisions.md`
  records it as an open entry.
- CLAIM-1. A candidate can still claim a test instance it cannot open. The
  fix needs a ruling: refuse the claim or admit the read. The entry stays in
  `docs/decisions.md`.
- Claim, release and delegate keep their order: status check first. The
  `runtime-api` boundary requirement sets it, and a 403 for a claim lost to a
  cancel would change what the task screen shows. The unknown-id 500 on those
  routes belongs to `harden-http-error-surface`. That change answers the opaque
  403, as this change does for submit, draft and the visibility routes.
- `not-claimed` and `not-claimant` stay distinct from `authorization`. The
  task screen reads those types, so a full collapse would break it. An open
  entry in `docs/decisions.md` records the remaining existence answer.
- A revocation withdraws no write authority on a running instance.
- No web source change.

## Decisions

### 1. One write result type, built field by field

`src/runtime/internal.ts` gains
`type InstanceWriteResult = { instanceId: InstanceId; status: Instance["status"]; transitionSeq: number; assignment?: AssignmentState }`
and `toWriteResult(instance)`. The function copies `instanceId`, `status` and
`transitionSeq` by name. It adds `assignment` only when the instance is
running and holds a non-null assignment. The stored value is often an explicit
`null`, and it must not reach the wire. The function never spreads the
instance, so a member added to `Instance` later cannot leak.

A finished instance can still carry a terminal step's assignment. Omitting it
unless the instance runs keeps `claimedBy` and `candidates` away from a
`system:cancel-any` holder who cancels a finished instance.

`cancelInstance`, `claimStep`, `releaseClaim` and `delegateClaim` return the
type. `src/runtime/api.ts` exports it. The route handlers pass it through, so
the HTTP body and the in-process result match.

Alternative: narrow in the route handlers and keep `Instance` in the runtime.
That is the smaller diff. It leaves the leak open for a library caller. The
Runtime API Layer takes an actor so that it can enforce the rule.

Alternative: reuse `InstanceSummaryItem`. It carries labels, so each call
would resolve a body it does not need.

The engine functions keep returning `Instance`. They trust their caller, as
their doc comments state.

### 2. Cancel keeps its idempotent no-op

Cancel on a non-running instance still returns the write result with status
200. The coordinator ruled this on 2026-10-11 after reading three sources. The
`http-wrapper` requirement "Cancel an instance over HTTP" says a non-running
cancel SHALL succeed as a no-op. Two tests assert it, one of them a deliberate
regression test for the cancellable gate. The `cancellation` capability
resumes an incomplete child sweep when cancel runs again on a cancelled
parent.

The write result closes the leak. A completed instance yields `instanceId`,
`status` and `transitionSeq`. A holder of `system:cancel-any` already has
authority over every instance, so those facts disclose little. A starter whom
a revocation names gets decision 3 instead.

Alternative: raise `InstanceNotRunningError`, as `claimStep` does. The engine
would still resume the sweep before the wrapper throws. The change would
contradict the `http-wrapper` requirement and break the two tests.

### 3. The reader rule reuses `loadInstanceForActor`

`internal.ts` gains `throwToReader(err, actor, refusal, db)`. It calls
`loadInstanceForActor` for the error's instance. When that load throws
`AuthorizationError`, the function throws `refusal` in its place. Otherwise it
rethrows `err`. The status therefore reaches readers only.

Three call sites use it.

- `submitAndTransition` wraps its `withTransaction` call. It catches
  `InstanceNotRunningError` after the transaction rolls back, so the extra
  read has no row lock to wait on.
- `saveInstanceDraft` wraps its `requireSubmitAuthority` call the same way.
- `canActorCancelInstance` calls `loadInstanceForActor` for a starter on a
  non-running instance, before it returns true. The grant and role tests come
  first and skip this call. This path passes no `refusal` and keeps the read
  message.

Submit and form-draft save pass `submitRefusal(actor, instanceId)` as the
refusal. `src/runtime/instances.ts` gains that helper. It builds the
`AuthorizationError` that `requireSubmitAuthority` throws today, with the text
`actor '<id>' may not submit instance '<id>'`. `requireSubmitAuthority` and the
unknown-instance throw of decision 4 use it too. A stranger therefore reads one
message when the instance has finished, runs without an assignment, or does
not exist.

Reuse gives the rule for free. A starter passes unless a revocation names
them. A live assignment outranks the revocation. A claimant is a principal,
so the loser of a double submission still gets the 409. An unrelated actor
gets the opaque refusal.

Alternative: move the status check after `requireSubmitAuthority`. A finished
instance usually has no assignment, because a step entry writes
`next.assignment ?? null`. A claimant who is not the starter then fails the
no-assignment branch. The loser of a double
submission would see a 403 where it sees a 409 today.

### 4. Submit and form-draft save refuse an unknown id to a stranger

The unknown-instance throw in `submitAndTransition` and `saveInstanceDraft`
becomes `AuthorizationError` for a caller without `ADMIN_ROLE`. The error comes
from `submitRefusal`, so the message text matches the one `requireSubmitAuthority`
gives a known instance. An administrator keeps `NotFoundError`, the way
`loadInstanceForActor` lets one through. An administrator may read any
instance, so the not-found answer reveals nothing to that caller. The visibility
routes fold for administrators too, because their gate runs after the load. The body-missing `NotFoundError` stays as it is, so an engine error
does not turn into a 403.

The change closes one existence answer and leaves another. `not-claimed` and
`not-claimant` still tell a caller that an instance exists and has an
assignment. The task screen reads those types. An open entry records it.

### 5. The started scope subtracts the revocation in SQL

`InstanceListFilter` gains `notRevokedFor?: { actorId, principals }`.
`buildInstanceWhere` compiles it as one term. The instance passes when the
actor has no `instance_principals_denied` row for it. It also passes when the
live-assignment predicate matches. The subquery qualifies the outer column as
`instances.instance_id`, because the denial table has a column of the same
name.

The live-assignment predicate moves out of `buildVisibleRowSet` into a shared
fragment function. Both callers use it, so the visible scope and the started
scope cannot drift on that ground. The probe uses the table's primary key
`(actor_id, instance_id)`.

`handleListInstances` sets `notRevokedFor` for `scope=started`, and only when
the caller lacks `ADMIN_ROLE`. The direct read never refuses an administrator,
and `runReportQuery` already skips its narrowing the same way. The principals
are `[actor.id, ...actor.roles]`. That matches `isEligibleCandidate` on the
direct read and avoids the group lookup that `scope=visible` pays.

The candidate branch of the fragment still requires `claimedBy` to be unset.
The direct read admits a candidate whether or not someone claimed the step.
The base spec already records that divergence, and the new requirement keeps
it.

Alternative: filter after the page in memory. A page would then come back
short, and the cursor would skip rows. The note in `store.ts` says a denial
must never shorten a page.

### 6. The record read loads through `loadInstanceForActor`

In the author fallback of `getInstanceRecord`, `loadInstanceForActor` replaces
`loadInstanceForRead`. A failure still maps to the record-specific
`AuthorizationError`. The starter test stays. The administrator path is
untouched. A test instance admits its starter, so the Player keeps working.

### 7. Target validation mirrors `delegateClaim`

`changeVisibility` runs the check after the permission test, for revoke and
grant only. It calls `knownUserIds([actor.id, target])`. It throws
`UnknownActorError` when the directory knows the actor and not the target.

`UnknownActorError` lives in `src/errors.ts` with its sibling errors.
`src/runtime/api.ts` re-exports it, because tests import errors from there.
`src/http/errors.ts` maps it to 422 `unknown-actor`. `UnknownDelegateError`
stays as it is, because its type name is part of the delegate contract.

### 8. `changeVisibility` refuses an unknown instance

The load wraps in a `try`. A `NotFoundError` becomes the same
`AuthorizationError` that a failed `can` check throws, with the same message
text. Other errors propagate, so a database error stays a 500. An
administrator who mistypes an instance id now gets a 403.

### 9. Documentation

`docs/openapi.yaml` gains an `InstanceWriteResult` schema, and the four 200
responses point at it. It drops the "no-op" wording that implied an
`Instance` body. It replaces the three visibility `500` texts with `403`. It
adds the 422 to revoke and grant only. It updates the 403 and 409 texts of
submit, draft, cancel and record, and the `scope=started` description.

`docs/decisions.md` loses this change's audit-index entry. It gains two open
entries that describe no exploitation path, in the style of CLAIM-1. One
records the residual existence answer on the write routes. The other records
the submit route's answer to a writer who may not read.

`docs/browser-checks.md` gains the started-cases check beside the existing
involved-cases one. The `http-api-documentation` capability does not need a delta. It
requires coverage, and coverage holds.

## Risks / Trade-offs

- [A library caller read `data` from a write result] → The change is
  **BREAKING** and the proposal says so. Repo callers read four other members.
- [The reader rule adds a query] → The query runs on a refused write and on a
  starter's no-op cancel. A successful write pays nothing.
- [A cancel-any or cancel-grant holder still learns `status` and `transitionSeq`
  of a finished instance] → The role is operator-grade. Decision 2 gives the reasons.
- [A revoked starter who cancels a running instance and retries gets 200, then
  403] → The retry meets the finished-instance rule. A revocation still
  narrows reads alone.
- [The oracle shrinks and does not close] → `not-claimed` and `not-claimant`
  still separate a running assigned instance from a finished one. An open
  entry records this.
- [The shared fragment moves SQL that the plan guards in
  `test/instance-visibility.test.ts` measure] → Run those guards in the full
  suite. The new term folds to nothing when `notRevokedFor` is unset.
- [The started scope has no plan guard of its own] → Add a guard. It pins the
  denial probe to the primary key.
- [A revoked starter keeps write authority on a running instance] → The
  `instance-visibility-set` spec says a revocation narrows reads alone. This
  change keeps that.

## Migration Plan

No stored data changes. The change does not add a table, a column or an index.
A deployment takes the new code and nothing else. Rollback reverts the commit.
The write result is the only wire change, and the seven web calls ignore the
body.

## Open Questions

None.
