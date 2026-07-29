## Context

`authorization` (archived change `2026-07-27-admin-shell-and-ops`) gated the
operator-facing reads: `GET /instances` with `scope=all` and
`GET /instances/:id/record` require `system:admin`, and `scope=mine` stays open
to every authenticated actor because the *server* decides what "mine" means
(claimed by that actor, or unclaimed with that actor among the current step's
candidates). That work treated the instance **list** as the disclosure surface
and left `GET /instances/:id` — the single-instance view — as it was: open to
any authenticated caller who has the id.

The result is an inversion. `getInstanceRecord` returns the merged
transition/event record — ids, timings, causes, action outcomes — and is
admin-only. `getInstanceView` returns the resolved *values* of the current
step's fields out of `instance.data`, plus the manual paths available to the
caller, and is ungated. The weaker read is gated; the stronger one is not.

`submitAndTransition` is the same seam from the write side. Claim enforcement
landed with `assignment-claim-enforcement` and is correct for a step that
declares an `assignment`. For a step that does not, the function performs no
actor check at all — the documented rationale being that an assignment-less
step is "unrestricted". Unrestricted was never meant to include actors with no
relationship to the instance; it meant "no candidate list to satisfy".

## Goals / Non-Goals

**Goals:**

- Reading one instance requires a relationship to it, decided in one place,
  with the same candidate predicate `claimStep` uses.
- An assignment-less step cannot be submitted by an actor unrelated to the
  instance.
- A caller with no relationship learns nothing from the failure about whether
  the instance exists.

**Non-Goals:**

- Field-level or step-level visibility ("this actor may read fields A and B").
  Visibility is already expressible per step through the view's CEL `visible`,
  and a second, actor-shaped layer on top is a different capability.
- Changing `listInstances`, `scope=mine`, or the record route. All three are
  specified, tested and correct; this change only makes the single-instance
  read consistent with them.
- A history-derived "anyone who ever acted on this instance" rule. See
  Decisions.
- Revoking access held by a token that was issued before this change. The
  predicate is evaluated per request, so it takes effect immediately for every
  request; no token or session change is involved.

## Decisions

**Enforce inside `getInstanceView`, not in `src/http/routes.ts`.**
The runtime API is the documented in-process library seam — `packages/*` reach
it over HTTP, but the engine's own callers and any future non-HTTP consumer do
not. `cancelInstance` already authorizes there (`api.ts:630-660`), so the
precedent and the shape both exist. Putting the check in the route handler
would leave the library entry point open and split authorization across two
layers with no rule saying which one owns it.

**Four arms: admin, starter, claimant, current candidate.** Each corresponds
to a relationship the instance record already carries, so the predicate needs
no new state and no extra query: `actor.roles.includes(ADMIN_ROLE)`,
`instance.startedBy === actor.id`, `instance.assignment?.claimedBy ===
actor.id`, and `isEligibleCandidate(actor, instance.assignment?.candidates ??
[])`. The last arm reuses `src/engine/transition.ts:75-77` verbatim rather
than restating "id or role match against a flat namespace", so the read
predicate cannot drift from the claim predicate — a drift would mean an actor
who may claim a step may not read it, or the reverse.

**Access follows the current step, not the history.** A candidate on step 1
who never claimed anything loses the read when the instance advances to step 2.
The alternative — "any actor who appears anywhere in the instance's history" —
was rejected on three grounds: it needs a scan of `history_entries` on every
view read (an unindexed one, until `PERF-1` lands); it grants access that only
ever grows, which is the exact property that makes the current gap
uncomfortable; and it cannot be evaluated from the instance row the read
already loads. The cost is real and is stated as a risk below.

**Non-disclosure ordering mirrors `cancelInstance`.** An admin-role caller
takes a load-first path where a missing instance surfaces as today's
not-found. Every other caller loads inside a `try`, and a load failure
collapses into the *same* `AuthorizationError` a relationship failure
produces, so "no such instance" and "not yours" are indistinguishable. Without
this, the 403/500 split turns the view route into an instance-existence
oracle, which is precisely what `api.ts:642-647` already argues for cancel.

**A runtime floor for the assignment-less submit, not (only) a publish-time
diagnostic.** Rejecting a manual-path step with no `assignment` at publish
would surface the authoring mistake earlier, but it cannot help any body
already published — published versions are immutable and their pinned
instances keep running — and it forbids a legitimate shape (a self-service
step on an instance the starter drives alone). The floor is what actually
closes the hole; a publish-time warning is a possible follow-up, not a
substitute. The floor is deliberately weaker than the claimant rule: starter
or admin, because those are the only relationships an assignment-less step
defines.

**Reuse `AuthorizationError`, add no new error type.** It is already mapped to
403 with `type: "authorization"` (`errors.ts:58`), already used by
`cancelInstance`, and already what the `authorization` spec's scenarios
assert. A new type would need a new HTTP mapping and a new client branch for
no additional information — the caller cannot act differently on "not a
candidate" than on "not the starter".

## Risks / Trade-offs

- **A participant who completed a middle step can no longer re-read that
  instance** (unless they started it) → Accepted, and the sharper edge of this
  change. It matches the record route, which is already stricter, and matches
  `scope=mine`, which stops listing the instance at the same moment for the
  same reason. `packages/app` navigates back to the inbox after a submission
  rather than re-reading the view, so no shipped screen regresses.
- **An out-of-tree API consumer that reads instance views with a bare token
  breaks** → Intended; it is the finding. Called out as BREAKING in the
  proposal, and the fix for a legitimate consumer is granting `system:admin`
  via `src/auth/cli.ts set-roles`, the same remedy the previous
  authorization tightening documented.
- **The admin arm makes `system:admin` a global data read** → Already true via
  `scope=all` and the record route; this adds no reach.
- **The non-disclosure collapse also swallows genuine engine faults** for a
  non-admin caller: `loadInstanceForRead` throws not only for a missing
  instance but for an unresolvable pinned body, and both become the same 403 →
  Accepted, and identical to what `cancelInstance`'s role-less path already
  does. It is bounded by the admin path, which still reports the real failure,
  and by the fact that such a fault is an operator concern rather than a
  participant one. The remedy if it ever bites is server-side logging on the
  collapse, which `ERR-3`'s change introduces for the 500 fallback anyway.
- **The submit floor changes an assignment-less step from "anyone
  authenticated" to "starter or admin"**, which could break a definition that
  relied on the open behavior deliberately → The correct authoring answer for
  a step that many actors may submit is a declared `assignment` with a
  candidate list, which is what the capability exists for. A definition
  relying on the open behavior is relying on an unenforced boundary.
- **Two checks now describe "may this actor act on this instance"** (the read
  predicate and the submit floor) and could drift → Bounded: they live in one
  file, twenty lines apart, and share `isEligibleCandidate`. Collapsing them
  into one helper is possible but they are deliberately *not* the same rule —
  reading is broader than writing — so a shared helper would need a mode flag
  and would read worse than two explicit predicates.

## Migration Plan

No data or schema migration. The predicate is evaluated per request against
state the instance row already carries.

1. Land the runtime-API change with its tests in one commit; there is no
   intermediate state where the spec and the code disagree.
2. Operators: grant `system:admin` to any integration account that reads
   instance views it has no relationship to, before deploying. This is
   observable in advance — such a caller is one that reads
   `GET /instances/:id` for instances it did not start and is not assigned.
3. Rollback is reverting the commit. Nothing is persisted, so a revert
   restores the prior behavior exactly.

## Open Questions

- Should `getInstanceRecord` be relaxed from admin-only to the same
  relationship predicate, so a starter can read their own instance's audit
  trail? Deliberately not decided here: the current 403-even-for-your-own
  behavior is explicitly specified and tested, and relaxing it is a separate
  decision about audit-trail visibility rather than part of closing this gap.
- Should a non-terminal step with manual paths and no `assignment` produce a
  publish-time diagnostic? Left open (see Decisions); it is additive and can
  land later without changing anything this change specifies.
