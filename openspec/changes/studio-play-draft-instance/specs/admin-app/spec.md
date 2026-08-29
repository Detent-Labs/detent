## MODIFIED Requirements

### Requirement: All instances are listable with filters and paging

The `/admin/instances` screen SHALL list every instance via `GET /instances`
with `scope=all`. It SHALL expose five of the filters `InstanceListFilter`
supports: process, status, current step, `startedBy` and `claimedBy`. It SHALL
expose cursor paging. It SHALL NOT filter to the operator's own assignments;
that is the participant app's view.

The list SHALL visually distinguish a test instance from an ordinary
instance, so an operator can tell at a glance which rows are which. It SHALL
NOT hide test instances from this list by default: an operator debugging a
draft needs to find its test instance without first reaching for a filter
toggle. It SHALL also let the operator narrow the list to test instances
only or to ordinary instances only, as one more filter dimension alongside
the five above.

<!-- antislop: allow passive-voice - the live spec writes this paragraph verbatim -->

Filter and paging state SHALL live in a pure module under the area's
`screens/` directory with `bun:test` coverage, following
`packages/web/src/areas/app/screens/inboxLogic.ts`. Components themselves are
not required to be tested.

#### Scenario: Listing every instance

<!-- antislop: allow passive-voice - the delta copies this scenario from the live spec verbatim -->
- **WHEN** the operator opens the instances screen
- **THEN** instances started by other actors are listed

#### Scenario: Narrowing by status

- **WHEN** the operator selects a status filter
- **THEN** the request carries the corresponding `status` parameter and the
  list narrows

#### Scenario: Paging forward

- **WHEN** more instances match than the page limit
- **THEN** a next-page control requests the same route with the returned cursor

#### Scenario: Test instances show alongside ordinary ones, identifiably

- **WHEN** the instances list holds both ordinary and test instances and the
  operator opens the screen with no filter applied
- **THEN** both kinds are shown, and the test instances are identifiable as
  such at a glance, without narrowing the list first
