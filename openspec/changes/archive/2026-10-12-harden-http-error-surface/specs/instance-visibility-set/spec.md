# Spec Delta

## ADDED Requirements

### Requirement: Claim, release and delegate refuse an unknown instance to a stranger

`claimStep`, `releaseClaim` and `delegateClaim` SHALL answer an instance id
that resolves to nothing, for a caller without `ADMIN_ROLE`, with
`AuthorizationError`. The message SHALL name the actor and the instance id and
nothing else. A caller with `ADMIN_ROLE` SHALL get `NotFoundError`, as the
direct read does. The typed claim refusals still tell a caller that an
instance exists. WRITE-1 in `docs/decisions.md` keeps that open.

#### Scenario: A stranger claiming an unknown instance gets the refusal

- **WHEN** an actor without `ADMIN_ROLE` calls `claimStep` on an instance id
  that resolves to nothing
- **THEN** the call throws `AuthorizationError`

#### Scenario: A stranger releasing an unknown instance gets the refusal

- **WHEN** an actor without `ADMIN_ROLE` calls `releaseClaim` on an instance
  id that resolves to nothing
- **THEN** the call throws `AuthorizationError`

#### Scenario: A stranger delegating on an unknown instance gets the refusal

- **WHEN** an actor without `ADMIN_ROLE` calls `delegateClaim` on an instance
  id that resolves to nothing
- **THEN** the call throws `AuthorizationError`

#### Scenario: An administrator gets not-found

- **WHEN** an actor with `ADMIN_ROLE` calls `claimStep` on an instance id that
  resolves to nothing
- **THEN** the call throws `NotFoundError`
