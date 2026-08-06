## ADDED Requirements

### Requirement: A delegation to an unknown target maps to 422

`UnknownDelegateError` thrown by `delegateClaim` SHALL map to `422` with
`error.type` equal to `"unknown-delegate"`. The response SHALL carry the
error's message, which names the target id.

Every typed Runtime API Layer error has a status in `src/http/errors.ts`. An
error with no entry there falls to `500` with a message-free body. That body
tells an operator nothing about a target they mistyped.

`422` is the status this wrapper already gives a request whose shape is
right. The engine refuses its content, not its shape.

The browser package (`packages/web/src/api`) SHALL carry the same type. The
screen offering delegation then prints the message. It does not print a
generic internal error.

#### Scenario: An unknown delegate target maps to 422

- **WHEN** the claimant calls `POST /instances/:instanceId/delegate` from a
  deployment whose own actor ids resolve in the local account directory
- **AND** the `toActorId` it names does not resolve there
- **THEN** the response is `422` with `error.type` equal to
  `"unknown-delegate"`, and the body carries a message naming the target

#### Scenario: A non-claimant still gets 403

- **WHEN** a caller who does not hold the claim calls
  `POST /instances/:instanceId/delegate` with a `toActorId` the directory
  does not hold
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`, unchanged by the target
