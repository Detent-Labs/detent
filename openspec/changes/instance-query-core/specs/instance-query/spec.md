## MODIFIED Requirements

### Requirement: List instance summaries with filters

The Runtime API Layer SHALL expose a read that returns a page of instance
summaries. A summary carries the instance's identity and lifecycle state:
`instanceId`, `processId`, `version`, `status`, `currentStepId`,
`transitionSeq`, `assignment` (candidates and claim state), `startedBy`,
`createdAt`, `currentStepEnteredAt`, `processLabel`, `stepLabel` and
`processBaseLocale`. A summary SHALL NOT carry the instance `data` payload
unless the caller opts in through `includeData`.

`processLabel` and `stepLabel` are `LocalizedText`. The read resolves both
through the existing cached definition store, against the pinned version body.
`processBaseLocale` is that same body's `baseLocale`. The summary includes it
so a caller resolves `processLabel` and `stepLabel` against the correct
fallback locale without a second request. The summary SHALL expose no other
part of the process body, guards and action configs included.

The read SHALL accept these optional filters: `processId`, `version`, `status`
(one or more of the instance statuses), `currentStepId`, `startedBy`,
`claimedBy`, `assignedTo`, `excludeInstanceId` and `dataWhere`. It SHALL
combine them conjunctively.

`assignedTo` SHALL match an instance under either of two conditions. That actor
holds the claim on its current step. Or its current step carries no claim and
lists that actor's id among its assignment candidates. Together those two form
the participant inbox predicate.

The read SHALL additionally accept `scope: "mine"`. That applies the identical
inbox predicate against the calling actor. The read resolves that actor from
the request's credential, not from a client-supplied id. A caller MUST NOT be
able to substitute `scope=mine` for the effect of an arbitrary `assignedTo`
value belonging to another actor.

`scope: "mine"` resolves a full `Actor`, id and roles, rather than a bare id
string. So its inbox predicate additionally matches an unclaimed instance that
lists any of the actor's roles among its assignment candidates. That is the
same id-or-role eligibility `claimStep` already applies through
`isEligibleCandidate`. A bare `assignedTo=<id>` filter carries no role list to
check against. It therefore matches by id alone, identically for a claimed and
an unclaimed instance.

`excludeInstanceId` SHALL omit the named instance from the result. `dataWhere`
SHALL carry comparisons against the instance `data` payload. The
`instance-data-query` capability defines their semantics. The comparisons join
the other filters conjunctively.

`includeData` SHALL stay off unless the caller sets it. When the caller sets
it, each non-degraded summary SHALL additionally carry the instance's `data`
payload. A degraded summary SHALL NOT carry `data`, whatever `includeData`
says. A degraded item cannot resolve the values its caller would read.

With no filters the read SHALL return every instance, subject to paging. The
read SHALL NOT scope results to the calling actor implicitly.

A matched instance's summary can fail to resolve. That happens when its pinned
`(processId, version)` has no resolvable published body. It also happens when
its `currentStepId` is absent from that body's steps. The read SHALL NOT fail
the whole page over a failure like this. Every other instance in the same page
SHALL resolve and return normally.

The read SHALL accept one further filter, `includeDegraded`. No query parameter
exposes it. See the `http-wrapper` capability for how a caller sets it. When
`includeDegraded` is true, the failed item SHALL come back as a degraded
summary carrying `instanceId`, `processId`, `version`, `status`,
`currentStepId`, `transitionSeq`, `startedBy`, `createdAt`, and a reason.

A degraded summary SHALL NOT carry `processLabel`, `stepLabel` or
`processBaseLocale`. When `includeDegraded` is false or absent, the read SHALL
omit the failed item from the page instead. Omitting it SHALL NOT pull extra
rows to keep the page at its requested `limit`. The page may come back shorter
than `limit` even while more matching instances exist.

#### Scenario: Listing every instance

- **WHEN** the read runs with no filters and three instances exist
- **THEN** it returns all three summaries
- **AND** no returned summary carries a `data` field

#### Scenario: Filtering by process and status

- **WHEN** the read runs with a `processId` and `status: ["running"]`
- **THEN** it returns the running instances of that process
- **AND** it omits a completed instance of that process
- **AND** it omits a running instance of another process

#### Scenario: Filtering by current step

- **WHEN** the read runs with a `currentStepId`
- **THEN** it returns the instances parked on that step alone

#### Scenario: Filtering by version

- **WHEN** the read runs with a `processId` and `version: 2`
- **THEN** it returns the instances pinned to version 2 of that process
- **AND** it omits an instance of that process pinned to version 1

#### Scenario: Filtering by a data comparison

- **WHEN** the read runs with a `dataWhere` comparison naming a field id and a
  literal
- **THEN** it returns the instances whose `data` holds that value under that
  field id

#### Scenario: Excluding one instance by id

- **WHEN** the read runs with `excludeInstanceId` naming an instance that every
  other filter matches
- **THEN** it omits that instance
- **AND** it returns every other matching instance

#### Scenario: includeData stays off by default

- **WHEN** the read runs without `includeData`
- **THEN** no returned summary carries a `data` field

#### Scenario: includeData returns the data payload

- **WHEN** the read runs with `includeData: true`
- **THEN** each non-degraded summary carries the instance's `data` payload
- **AND** every other summary field stays as it was

#### Scenario: A degraded summary carries no data even with includeData

- **WHEN** the read runs with `includeData: true` and `includeDegraded: true`
- **AND** one matched instance pins a `(processId, version)` with no published
  body
- **THEN** that instance's item is a degraded summary carrying no `data` field

#### Scenario: The inbox predicate matches a claimed instance

- **WHEN** actor A holds the claim on an instance's current step
- **AND** the read runs with `assignedTo: A`
- **THEN** it returns that instance

#### Scenario: The inbox predicate matches an unclaimed candidate instance

- **WHEN** an instance's current step carries no claim and lists actor A as a
  candidate
- **AND** the read runs with `assignedTo: A`
- **THEN** it returns that instance

#### Scenario: The inbox predicate excludes an instance claimed by someone else

- **WHEN** an instance's current step lists actor A as a candidate, and actor B
  holds the claim
- **AND** the read runs with `assignedTo: A`
- **THEN** it omits that instance

#### Scenario: Filters combine conjunctively

- **WHEN** the read runs with both `assignedTo: A` and `status: ["running"]`
- **AND** actor A holds the claim on a completed instance
- **THEN** it omits that completed instance

#### Scenario: A summary carries resolved process and step labels

- **WHEN** the read runs, and an instance's current process and step carry
  `LocalizedText` labels in the pinned version body
- **THEN** the returned summary's `processLabel` and `stepLabel` carry those
  `LocalizedText` maps
- **AND** `processBaseLocale` matches the pinned body's `baseLocale`

#### Scenario: A summary carries the current step's entry time

- **WHEN** an instance has transitioned into its current step
- **THEN** the returned summary's `currentStepEnteredAt` reflects that
  transition's timestamp, not the instance's `createdAt`

#### Scenario: scope=mine resolves the same predicate as assignedTo for the caller

- **WHEN** authenticated actor A runs the read with `scope: "mine"`
- **AND** actor A is the claimant or an unclaimed candidate of an instance's
  current step
- **THEN** it returns that instance, identically to a call with `assignedTo: A`

#### Scenario: scope=mine ignores a client-supplied actor id

- **WHEN** authenticated actor A runs the read with `scope: "mine"`
- **THEN** it evaluates the predicate against A, resolved from the request's
  credential
- **AND** the request carries no way to substitute a different actor id

#### Scenario: scope=mine's inbox predicate also matches by role, not id alone

- **WHEN** an instance's current step carries no claim
- **AND** it lists role R rather than actor A's id among its candidates
- **AND** authenticated actor A, who holds role R, runs the read with
  `scope: "mine"`
- **THEN** it returns that instance
- **AND** an equivalent bare `assignedTo: A` call, carrying no role list, omits
  it

#### Scenario: With includeDegraded, an unresolvable body degrades instead of failing the page

- **WHEN** the read runs with `includeDegraded: true`
- **AND** one matched instance pins a `(processId, version)` with no published
  body
- **THEN** it still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the failure
- **AND** every other instance in the page returns as a normal summary

#### Scenario: With includeDegraded, a missing current step degrades instead of failing the page

- **WHEN** the read runs with `includeDegraded: true`
- **AND** one matched instance's `currentStepId` is absent from the steps of
  its pinned body
- **THEN** it still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the failure

#### Scenario: A degraded summary omits label fields

- **WHEN** the read returns a degraded summary
- **THEN** that item carries no `processLabel`, `stepLabel` or
  `processBaseLocale`
- **AND** it still carries `instanceId`, `processId`, `version`, `status`,
  `currentStepId`, `transitionSeq`, `startedBy` and `createdAt`

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: Without includeDegraded, an unresolvable instance is silently omitted

- **WHEN** the read runs with `includeDegraded` false or absent
- **AND** one matched instance pins a `(processId, version)` with no published
  body
- **THEN** it still returns 200
- **AND** `items` omits that instance
- **AND** no item in the page is a degraded summary
- **AND** every other matched instance returns as a normal summary
