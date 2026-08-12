<!-- antislop: allow-file passive-voice -->
<!-- The base spec at openspec/specs/http-wrapper/spec.md carries this same
     directive, for the same reason: SHALL-form normative spec prose. -->

## ADDED Requirements

### Requirement: A route handler takes its database from the request, not from construction

`createServer` SHALL still build the route table once. Each handler SHALL take
the database as a parameter the dispatcher supplies per request. No handler
SHALL capture a handle from the enclosing scope.

The handler signature already carries a parameter only one route reads. A
handler needing no database declares no such parameter. That is how a handler
needing no client address already behaves.

With SaaS mode off the dispatcher SHALL supply the process database on every
request. That is the handle those closures captured before, so nothing
changes.

#### Scenario: The dispatcher supplies the database

- **WHEN** a request reaches a route handler
- **THEN** that handler receives the database its request resolved to

#### Scenario: A single-tenant deployment behaves as before

- **WHEN** the server runs with SaaS mode off
- **THEN** every handler receives the process database
- **AND** every existing route answers as it did before this change
