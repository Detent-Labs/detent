## Why

`instance-visibility-set` gave every instance a principal set and one reader,
`GET /instances?scope=visible`. The direct read did not move. `getInstanceView`
still admits the starter, the current claimant and the current candidates.
An approver from last week finds the case in the visible list. They open it
and get a 403. The list and the detail disagree. The proposal of that change
named this widening as its own review.

## What Changes

- `loadInstanceForActor` consults the principal set. An ordinary instance
  admits a non-administrative actor on one of two grounds. First, a live
  assignment on the current step, as claimant or eligible candidate. Second,
  participation: the actor started the instance or matches one of its
  principals, and holds no revocation on it.
- A revocation now reaches the direct read. A revoked actor with no live
  assignment gets the `AuthorizationError` an unrelated actor gets. The
  starter is not exempt. A live assignment outranks the revocation and clears
  nothing. The list already follows that rule.
- The past candidate keeps the read. The `authorization` scenario that
  promised the opposite keeps its header, since openspec refuses a dropped
  scenario. It now covers the revoked past candidate. A scenario that admits
  the unrevoked one stands beside it.
- `getInstanceView`, `postComment`, `listComments`, `uploadAttachment`,
  `listAttachments` and `getAttachment` all widen, since they share the
  loader. `getInstanceRecord` keeps its narrower audit-trail rule.
- A test instance keeps today's rule, its own `startedBy` alone.
- The actor's principal set resolves in one place. A helper beside
  `getGroupsForMember` returns the actor's id, roles and group ids. The
  `scope=visible` route and `listMyReports` build that list inline today.
  Both move onto the helper.
- No transition, claim or cancel rule moves. `claimStep`,
  `submitAndTransition` and `cancelInstance` keep their own predicates. The
  two participant writes behind the loader, `postComment` and
  `uploadAttachment`, widen with the read.
- No definition contract change, no new relation, no UI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authorization`: the requirement on reading one instance by relationship
  gains the principal-set ground and the revocation rule. It loses the
  past-candidate refusal.
- `runtime-api`: the `getInstanceView` requirement and the assignment-state
  requirement restate the rule they cite.
- `instance-visibility-set`: a new requirement. The direct read consults the
  set, under the same revocation and live-assignment rules as the list read.

## Impact

- `src/runtime/api.ts`: `loadInstanceForActor`, `listMyReports`.
- `src/auth/groups.ts`: one new exported helper.
- `src/http/routes.ts`: the `scope=visible` branch moves onto the helper.
- `test/`: the direct-read tests that encode the past-candidate refusal flip.
  New tests cover a past participant, a revoked participant, a revoked
  claimant, a granted actor and a revoked starter.
- `docs/decisions.md`, `docs/current-state.md`, `ROADMAP.md` and
  `tmp/offene-items.md` carry passages that describe the old direct read.
  Each one changes.
- Cost: no extra query for a live claimant or candidate. The starter pays
  the denial probe, since a revocation now reaches the starter. Everyone
  else pays the group lookup and the two-probe query.
