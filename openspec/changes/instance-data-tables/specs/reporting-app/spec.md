## MODIFIED Requirements

### Requirement: The frontend offers no way to change anything

The reporting frontend's cycle-time, bottleneck and SLA views SHALL issue
only read requests. None of the three SHALL present a control that
publishes, cancels, migrates, edits a definition, administers a user, or
changes an instance, and none SHALL reach any route outside the reporting
prefix other than the login endpoint.

The report builder screen (the `reporting-data-tables` capability) is the
one exception this area carries. It SHALL confine every mutating request it
issues to the `/reporting/reports` routes, and SHALL NOT reach any other
route capable of a write. It SHALL NOT relax the rule above for the three
existing views: none of them gains a write path because the area now carries
one elsewhere.

#### Scenario: Only read requests are issued

- **WHEN** every request the cycle-time, bottleneck or SLA screens can issue
  is inspected
- **THEN** each is a read request against a reporting route, apart from the
  login request

#### Scenario: No mutating control is offered

- **WHEN** the cycle-time, bottleneck or SLA screens are inspected
- **THEN** none presents a control that changes engine state

#### Scenario: The report builder's writes stay confined to its own routes

- **WHEN** every mutating request the report builder can issue is inspected
- **THEN** each targets a `/reporting/reports` route, and no mutating
  request reaches any route outside that set
