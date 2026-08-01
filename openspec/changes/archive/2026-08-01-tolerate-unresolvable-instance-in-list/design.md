## Context

`listInstances` (`src/runtime/api.ts:779-828`) queries `instances` rows.
It maps each row through `toSummary` (`src/runtime/api.ts:191-211`) inside
a `Promise.all`. `toSummary` calls `store.resolveBody(inst.processId,
inst.version)` and throws `NotFoundError` if that returns nothing. It also
throws a plain `Error` if `inst.currentStepId` is absent from the resolved
body's steps. Either throw escapes the `Promise.all` uncaught.
`handleListInstances` (`src/http/routes.ts:297`) then never gets a `Page`
back. The request falls through to a generic 500.

`NotFoundError` already carries a settled, unrelated design decision. A
single-instance read (`getInstanceView`, `getInstanceRecord`) maps it to
500 instead of 404. That choice is deliberate.
`openspec/changes/archive/2026-07-29-correct-api-error-responses/design.md`
records that decision. It stays untouched here. This change only stops
that failure, and its sibling step-mismatch failure, from leaving
`listInstances` at all. It intercepts them before they would ever reach
that HTTP-layer mapping.

See `proposal.md` for the motivating incident. It also explains why this
is data drift from outside the engine's own operations. It is not a
routine consequence of using it.

`GET /instances` has two independent frontend consumers, not one.
`packages/web/src/areas/admin` (`InstancesScreen.tsx`) calls it with
`scope=all`. `packages/web/src/areas/app` (the participant inbox,
`TasksScreen.tsx`/`inboxLogic.ts`) calls it with `scope=mine`.

The participant inbox reads `processLabel`/`stepLabel` off every item
without a null check. Handing it a degraded item would force it to
change too, for a failure mode it cannot act on. This design gates
visibility instead. Only the admin path's shape changes.

## Goals / Non-Goals

**Goals:**
- One instance's summary-resolution failure degrades that item, not the page,
  for a caller allowed to see the diagnosis.
- The degraded item names the instance and the failure reason, so an operator
  can act on it.
- A `scope=mine` caller's page, and its existing `InstanceSummary` type,
  need no change at all. A failed item is absent from it.
- A genuinely unexpected exception, anything other than the two known
  causes, still fails the whole request loudly, regardless of scope.

**Non-Goals:**
- No change to the 500-for-`NotFoundError` decision on single-instance reads.
- No cleanup or repair tooling for the dangling data itself. A degraded item
  is diagnostic, not corrective.
- No visual design for the admin UI's treatment of a degraded row beyond
  "renders without crashing." Follow the existing dead-letter-row pattern in
  the outbox screen.
- No new authorization mechanism. Visibility reuses the `scope=all` /
  `ADMIN_ROLE` check `http-wrapper` already makes.

## Decisions

**Catch two named failure types at the call site, not a blanket catch.**
`listInstances` wraps each `toSummary` call. It catches `NotFoundError` and
a new `StepNotInBodyError` specifically. Anything else rethrows and still
500s the page.

This design rejects a blanket `catch` around `toSummary`. A blanket catch
would also swallow a real bug, a DB failure inside `resolveBody`, for one.
It would repaint that bug as a diagnostic "degraded" row instead of a loud
failure. Only the two already-understood, already-named causes degrade.

**Replace the bare `Error` at line 195 with `StepNotInBodyError`.** A bare
`Error` cannot be caught selectively. Catching it also catches unrelated
bugs. `StepNotInBodyError` is a small class local to `runtime/api.ts`,
with no cross-module caller. It does not belong in `src/errors.ts`. That
module exists to break import cycles between modules that throw and
modules that map.

**A sibling type, not a widened `InstanceSummary`.** `InstanceSummary` stays
exactly as it is. A new `DegradedInstanceSummary` type carries `instanceId`,
`processId`, `version`, `status`, `currentStepId`, `transitionSeq`,
`startedBy`, `createdAt`, and a literal `reason`, plus a `degraded: true`
discriminant field absent from `InstanceSummary`. `listInstances` returns
`Page<InstanceSummary | DegradedInstanceSummary>`.

Alternative considered: add a `resolved: boolean` field to `InstanceSummary`
itself, and make the label fields optional. This design rejects that. It
would force every existing consumer of a successful summary to guard
against an `undefined` label. On that path, the label can never be
missing. The chosen shape leaves the common case's type untouched. It adds
a narrow, additive sibling for the rare case.

**`reason` is a literal union, not a free-text message.** `"missing-definition"
| "current-step-not-in-body"`, matching how `InstanceEvent` kinds and
`ActionOutcome` reasons stay enumerated elsewhere in this engine rather than
carrying an ad hoc string. A caller can switch on it. A human-readable
label lives in the UI, not the wire payload.

**Gate visibility with an `includeDegraded` filter field, set from the
route's existing `scope=all` check.** `InstanceListFilter` gains
`includeDegraded?: boolean`. `handleListInstances`
(`src/http/routes.ts:297`) sets it to `scope === "all"`, the same boolean
that already gates `requireRole(actor, ADMIN_ROLE)` at line 308. When
`includeDegraded` is false or absent, `listInstances` omits the failed item
from `items` instead of degrading it. This is the one route-level change
this design makes: one line in `handleListInstances`, not a new check.

Alternative considered: resolve the actor's role inside `listInstances`
itself. This design rejects that. The Runtime API Layer stays role-agnostic
everywhere else. `getInstanceRecord` is the one existing exception. Its own
two-path check is a documented, deliberate departure, not a pattern to
extend casually. A boolean filter, decided once at the HTTP boundary,
keeps that boundary in one place.

**Omitting an item may shorten a page below its `limit`.**
`listInstances` fetches no replacement row for one it drops. A
`scope=mine` caller can see fewer than `limit` items on a page even when
more instances exist. This matches how a filtered read already behaves.
No scenario in the existing spec guarantees a full page either.

## Risks / Trade-offs

[A real bug inside `resolveBody` gets misread as routine data drift] →
Mitigated by catching only `NotFoundError` and `StepNotInBodyError`. Every
other exception still fails the request the way it does today.

[An operator skims past a degraded row without noticing] → Out of scope for
this design. The admin UI task follows the existing dead-letter-row visual
pattern, which already exists to flag a bad row inline.

[Dangling instances pile up unfixed] → This inverts that risk, for the
caller who can act on it. It does not add to it. An admin-scoped list
today makes the *entire* list disappear. That hides the underlying drift
completely. A named, reasoned degraded row is strictly more visible than a
500 with no detail.

[A participant's task vanishes from their inbox without explanation] →
This is the trade-off the admin-only decision accepts. Today that same
task already fails the *entire* inbox with one generic failure. That hits
every one of that participant's tasks, not just the broken one. A missing
single row is narrower than a broken screen. The underlying drift stays
visible, to the admin who can fix it, not to the participant who cannot.

## Migration Plan

No data migration. The engine and `packages/web` ship from the same build
and the same `WEB_ROOT` deploy. There is no window where a new engine
serves an old frontend a shape it has never seen. Rollback is a plain
revert. The old `toSummary` throws again, the old 500 behavior returns,
and no persisted data needs to change either way.

`docs/openapi.yaml` updates in the same commit as the code change, not
separately. An OpenAPI document describing a shape the engine does not yet
return is worse than a stale one. A caller trusts it as current.

## Open Questions

Should a degraded instance get a dedicated admin action, redact or
force-migrate to a valid version? Right now it is only visible. This stays
deferred. Nothing in this change's specs, approach, or tasks depends on the
answer. It is also a separate capability, closer to
`admin-operations-api`'s redact action than to `instance-query`.
