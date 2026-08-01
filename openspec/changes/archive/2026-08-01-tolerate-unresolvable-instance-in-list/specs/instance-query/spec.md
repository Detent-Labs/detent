<!-- antislop: allow-file all -->
<!--
  This delta copies the existing "List instance summaries with filters"
  requirement verbatim, per the MODIFIED-requirements workflow, and extends
  it in its established WHEN/THEN scenario convention. See
  admin-app/spec.md for the same file-wide allowance on the same grounds.
-->

## MODIFIED Requirements

### Requirement: List instance summaries with filters

The Runtime API Layer SHALL expose a read that returns a page of instance
summaries. A summary carries the instance's identity and lifecycle state —
`instanceId`, `processId`, `version`, `status`, `currentStepId`,
`transitionSeq`, `assignment` (candidates and claim state), `startedBy`,
`createdAt`, `currentStepEnteredAt`, `processLabel`, `stepLabel`,
`processBaseLocale` — and SHALL NOT carry the instance `data` payload.
`processLabel` and `stepLabel` are `LocalizedText`, resolved through the
existing cached definition store against the pinned version body;
`processBaseLocale` is that same body's `baseLocale`, included so a caller can
resolve `processLabel`/`stepLabel` with the correct fallback locale without a
second request. No other part of the process body (guards, action configs) is
exposed through the summary.

The read SHALL accept these optional filters, combined conjunctively:
`processId`, `status` (one or more of the instance statuses), `currentStepId`,
`startedBy`, `claimedBy`, and `assignedTo`. `assignedTo` SHALL match an
instance whose current step is claimed by that actor, OR whose current step is
unclaimed and lists that actor's id among its assignment candidates — the
participant inbox predicate. The read SHALL additionally accept `scope: "mine"`,
which applies the identical inbox predicate against the calling actor resolved
from the request's credential rather than a client-supplied id; a caller MUST
NOT be able to substitute `scope=mine` for the effect of an arbitrary
`assignedTo` value belonging to another actor. Because `scope: "mine"`
resolves a full `Actor` (id and roles) rather than a bare id string, its
inbox predicate additionally matches an unclaimed instance that lists any of
the actor's roles among its assignment candidates — the same id-or-role
eligibility `claimStep` already applies (`isEligibleCandidate`). A bare
`assignedTo=<id>` filter has no role list to check against and so matches by
id only, identically for a claimed or an unclaimed instance.

With no filters the read SHALL return every instance, subject to paging. The
read SHALL NOT scope results to the calling actor implicitly.

If a matched instance's summary cannot be produced, because its pinned
`(processId, version)` has no resolvable published body, or because its
`currentStepId` is absent from that body's steps, the read SHALL NOT fail
the whole page over it. Every other instance in the same page SHALL resolve
and return normally regardless.

The read SHALL accept one further filter, `includeDegraded`, not exposed as
a query parameter (see the `http-wrapper` capability for how a caller sets
it). When `includeDegraded` is true, the failed item SHALL come back as a
degraded summary: `instanceId`, `processId`, `version`, `status`,
`currentStepId`, `transitionSeq`, `startedBy`, `createdAt`, and a failure
reason. A degraded summary SHALL NOT carry `processLabel`, `stepLabel`, or
`processBaseLocale`. When `includeDegraded` is false or absent, the failed
item SHALL be omitted from the page instead. Omitting it SHALL NOT reduce
the page below its requested `limit` by requesting extra rows to
compensate; the page may come back shorter than `limit` even when more
matching instances exist.

#### Scenario: Listing every instance

- **WHEN** the read is called with no filters and three instances exist
- **THEN** all three summaries are returned
- **AND** no returned summary carries a `data` field

#### Scenario: Filtering by process and status

- **WHEN** the read is called with a `processId` and `status: ["running"]`
- **THEN** only running instances of that process are returned
- **AND** a completed instance of that process is excluded
- **AND** a running instance of another process is excluded

#### Scenario: Filtering by current step

- **WHEN** the read is called with a `currentStepId`
- **THEN** only instances currently parked on that step are returned

#### Scenario: The inbox predicate matches a claimed instance

- **WHEN** an instance's current step is claimed by actor A
- **AND** the read is called with `assignedTo: A`
- **THEN** that instance is returned

#### Scenario: The inbox predicate matches an unclaimed candidate instance

- **WHEN** an instance's current step is unclaimed and lists actor A as a candidate
- **AND** the read is called with `assignedTo: A`
- **THEN** that instance is returned

#### Scenario: The inbox predicate excludes an instance claimed by someone else

- **WHEN** an instance's current step lists actor A as a candidate but is claimed by actor B
- **AND** the read is called with `assignedTo: A`
- **THEN** that instance is not returned

#### Scenario: Filters combine conjunctively

- **WHEN** the read is called with both `assignedTo: A` and `status: ["running"]`
- **AND** a completed instance is claimed by A
- **THEN** that completed instance is not returned

#### Scenario: A summary carries resolved process and step labels

- **WHEN** the read is called and an instance's current process/step have
  `LocalizedText` labels in the pinned version body
- **THEN** the returned summary's `processLabel` and `stepLabel` carry those
  `LocalizedText` maps, and `processBaseLocale` matches the pinned body's
  `baseLocale`

#### Scenario: A summary carries the current step's entry time

- **WHEN** an instance has transitioned into its current step
- **THEN** the returned summary's `currentStepEnteredAt` reflects that
  transition's timestamp, not the instance's `createdAt`

#### Scenario: scope=mine resolves the same predicate as assignedTo for the caller

- **WHEN** the read is called with `scope: "mine"` by an authenticated actor A
  who is the claimant or an unclaimed candidate of an instance's current step
- **THEN** that instance is returned, identically to calling the read with
  `assignedTo: A`

#### Scenario: scope=mine ignores a client-supplied actor id

- **WHEN** the read is called with `scope: "mine"` by authenticated actor A
- **THEN** the predicate is evaluated against A, resolved from the request's
  credential, with no way for the request to substitute a different actor id

#### Scenario: scope=mine's inbox predicate also matches by role, not id alone

- **WHEN** an instance's current step is unclaimed and lists role R (not
  actor A's id) among its assignment candidates
- **AND** the read is called with `scope: "mine"` by authenticated actor A,
  who holds role R
- **THEN** that instance is returned
- **AND** an equivalent bare `assignedTo: A` call (no role list available)
  does not return it

#### Scenario: With includeDegraded, an unresolvable body degrades instead of failing the page

- **WHEN** the read is called with `includeDegraded: true` and one matched
  instance's pinned `(processId, version)` has no published body
- **THEN** the read still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the failure
- **AND** every other instance in the page returns as a normal summary

#### Scenario: With includeDegraded, a missing current step degrades instead of failing the page

- **WHEN** the read is called with `includeDegraded: true` and one matched
  instance's `currentStepId` is not among the steps of its pinned body
- **THEN** the read still returns 200 with a full page
- **AND** that instance's item is a degraded summary naming the failure

#### Scenario: A degraded summary omits label fields

- **WHEN** the read returns a degraded summary
- **THEN** that item carries no `processLabel`, `stepLabel`, or
  `processBaseLocale`
- **AND** it still carries `instanceId`, `processId`, `version`, `status`,
  `currentStepId`, `transitionSeq`, `startedBy`, and `createdAt`

#### Scenario: Without includeDegraded, an unresolvable instance is silently omitted

- **WHEN** the read is called with `includeDegraded` false or absent, and
  one matched instance's pinned `(processId, version)` has no published body
- **THEN** the read still returns 200
- **AND** that instance is absent from `items`
- **AND** no item in the page is a degraded summary
- **AND** every other matched instance returns as a normal summary
