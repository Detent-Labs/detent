## MODIFIED Requirements

### Requirement: The reporting routes expose the three views and the process list

The HTTP surface SHALL expose four read-only routes under `/reporting`: a
process listing, and one route per view. Each view route SHALL take the
process id in the path. Each SHALL also take the optional range bounds as
ISO date query parameters. Every route SHALL be a `GET`, and SHALL mutate
nothing. The reports role SHALL gate every route, per the `authorization`
capability. The process listing SHALL return the same processes the
existing engine-wide listing returns.

The three per-process views SHALL need one more gate: the `read` permission
over the named process, per the `authorization` capability's process-scoped
gate. A caller holding the reports role but no `read` permission over the
named process SHALL receive `403`, not the view's result.

This tightens a route that used to answer any reports-role holder, for any
process id. An installation restores an affected caller's access with a
`read` grant scoped to the process, or with the operator role.

A request naming a process id that does not exist SHALL return `404`. A
request whose range bounds are not parseable ISO dates SHALL return `400`
and run no query. The same holds for a request whose start bound is after
its end bound.

#### Scenario: Each view is reachable over HTTP

- **WHEN** an actor holds the reports role and `read` over the named process
- **AND** that actor requests the cycle-time, bottleneck or SLA route for
  that process
- **THEN** each returns `200` with that view's result

#### Scenario: An unknown process id is a 404

- **WHEN** an actor holds the reports role and `read` over the named process
- **AND** that actor requests a view for a process id that does not exist
- **THEN** the response is `404`

<!-- Title copies the live spec's existing scenario name verbatim; archive sync needs it unchanged. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A malformed range is rejected

- **WHEN** a request carries a range bound that is not a valid ISO date
- **OR** a request's start bound comes later than its end bound
- **THEN** the response is `400`, and no query runs

#### Scenario: The routes mutate nothing

- **WHEN** a caller calls any `/reporting/*` route
- **THEN** no instance, definition, draft, outbox row or timer changes state

#### Scenario: The reports role alone does not reach a process's view

- **WHEN** an actor holds the reports role but no `read` permission over the
  requested process
- **AND** that actor requests the cycle-time, bottleneck or SLA route for
  that process
- **THEN** the response is `403`
- **AND** the view's result is not returned
