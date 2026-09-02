## Context

`loadInstanceForActor` (`src/runtime/api.ts`) authorizes every
participant-facing direct read: `getInstanceView`, `postComment`,
`listComments`. It admits `ADMIN_ROLE` without a read. Then it loads the
instance and tests three in-memory facts: `startedBy`, `assignment.claimedBy`,
and `isEligibleCandidate` over `assignment.candidates`. A test instance
short-cuts to `startedBy` alone.

`instance-visibility-set` added two relations. `instance_principals` has the
primary key `(instance_id, principal)`. `instance_principals_denied` has the
primary key `(actor_id, instance_id)`. Four write points fill the first, and
one consumer reads both: the `scope=visible` list. Its design fixed two rules
this change carries over unchanged. A revocation names the actor. A live
assignment outranks a revocation without clearing it.

Three sites build the actor's principal list inline today:
`handleListInstances` for `scope=visible`, `listMyReports`, and now this
loader.

## Goals / Non-Goals

**Goals:**

- The direct read and the visible list agree on every ordinary instance.
- A revocation reaches the direct read, the starter included.
- No extra query for a live claimant or candidate. The starter pays the
  denial probe, since the owner's decision makes a revocation reach the
  starter.
- One function resolves an actor's principals.

**Non-Goals:**

- Any write rule. `claimStep`, `submitAndTransition`, `cancelInstance` and
  `getInstanceRecord` keep their predicates.
- The report builder. Change 3 filters it per row.
- A screen. Item 31 builds the participant list.
- A cache of group membership. The lookup is one indexed query.

## Decisions

### The check is an ordered fallback, not one predicate

The loader keeps its in-memory tests first and adds the set as the last step:

1. `ADMIN_ROLE`: load directly, no further test.
2. Test instance: `startedBy` alone, unchanged.
3. Live assignment: `claimedBy === actor.id` or `isEligibleCandidate`. Admit.
   This step never reads a revocation. That is how "live assignment outranks
   a revocation" falls out with no special case.
4. Participation: one query. It admits a match on the actor's principal set
   or on `startedBy`. A denial row naming the actor on this instance blocks
   it.
5. Otherwise the existing `AuthorizationError`.

Steps 3 and 4 differ in whether a revocation applies. That ordering is the
whole rule. One merged SQL predicate would have to choose. Either the denial
subtraction lands outside the live branch, or the live predicate appears in
SQL a second time beside `isEligibleCandidate`. The loader's comment already
warns against two predicates for one rule.

The alternative was one `EXISTS ... OR ... AND NOT EXISTS` statement over
`instances`. Change 1 measured it as the slowest form. It also duplicates the
candidate predicate in SQL. Rejected.

### The query is two primary-key probes

```sql
SELECT EXISTS (SELECT 1 FROM instance_principals
                WHERE instance_id = $1 AND principal = ANY($2)) AS matched,
       EXISTS (SELECT 1 FROM instance_principals_denied
                WHERE instance_id = $1 AND actor_id = $3) AS denied
```

Both probes bind the leading primary-key column. Neither depends on the size
of the actor's principal set beyond the `ANY` list. No new index.

`startedBy === actor.id` stays an in-memory `OR` beside `matched`. Then
`denied` applies to both. Every instance created since Change 1 holds the
starter as a principal row, and so does every backfilled one. The in-memory
test only covers an instance the backfill script never reached. The denial
still applies to that starter. That is the point of the owner's decision.

### The group lookup runs only on the fallback path

`getGroupsForMember` is one query over `groups.members`. It runs after steps
1 to 3 fail, never before. A claimant or a candidate pays nothing new.

### One helper resolves the principal set

`actorPrincipals(actor, db)` in `src/auth/groups.ts`, beside
`getGroupsForMember`, returns `[actor.id, ...actor.roles, ...groupIds]`.
`handleListInstances` and `listMyReports` build that list inline today. Both
move onto the helper. Three sites is the threshold for a shared function. The
spec names it so a fourth site cannot drift.

### The past-candidate scenario flips, and the test flips with it

`authorization/spec.md` promised "A past candidate loses the read when the
instance moves on". Change 1's step entry added that candidate to the set.
Under this change they keep the read. The old scenario keeps its header,
since openspec refuses a dropped scenario. It now covers the revoked past
candidate. A scenario that admits the unrevoked one stands beside it.

The test that encodes the old promise changes its expectation in the same
commit.

`startedBy === actor.id` skips the group lookup and runs the `denied` probe
alone. The starter needs no principal match, only the absence of a denial.

`scope=mine` keeps its behaviour and stops listing at that moment. The two
scopes answer two questions. One asks "what needs me now". The other asks
"what did I take part in". The direct read follows the second.

### A test instance stays narrow

Step entry writes principals for a test instance too. `applyStepEntry` does
not branch on `kind`. The loader still refuses everyone but the starter.
Reading the set there would let a candidate open a draft's test run.
`draft-test-instances` decided against that. The write lands and the loader
ignores it. That costs nothing and keeps `applyStepEntry` free of a `kind`
branch.

## Risks / Trade-offs

- **A backfill never run** leaves a pre-Change-1 participant refused as
  today, the starter aside. Same as the list. No regression.
- **Comments and attachments widen with the view.** A past participant can
  comment on an idle instance. They can upload a file to it too. That is the intended reading of
  "took part in". `getInstanceRecord` keeps the audit-trail rule. The record
  does not widen.
- **A group lookup on every refusal path.** An unrelated actor probing ids now
  costs two queries per probe. Both are primary-key or
  array-containment lookups. Acceptable.

## Migration Plan

No schema change, no data change. Deploy the code. An existing revocation
starts applying to the direct read at that moment. That is the owner's
decision from 2026-09-01, taking effect where a participant first notices it.

## Open Questions

Which side is right when the live-assignment predicates disagree? The loader
tests `isEligibleCandidate`, which matches id and roles on a step whether or
not somebody claims it. The list tests SQL, which matches the full principal
array and requires an unclaimed step. A revoked group member on an unclaimed
step is therefore listed and refused. Nothing records which answer is correct,
and no caller has asked yet.

None that block. Should `scope=mine` drop a revoked claimant too? That
question waits for the day someone revokes a live assignee and expects the
task to leave their inbox. Change 1 decided the engine never hands out a task
nobody can open. So the inbox keeps it.
