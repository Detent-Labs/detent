## ADDED Requirements

### Requirement: The header names the signed-in actor

The shell header SHALL render the signed-in actor's identity as text
immediately to the left of the account button. The account button SHALL
keep its own label unchanged.

The shell SHALL source the text from the session's `displayName`. Where
`displayName` is unset, the shell SHALL fall back to the session's
`actorId`. Two cases leave `displayName` unset. One is a federated actor,
whose account carries no `displayName`. The other is the window between
login and the `GET /account/me` hydration call resolving.

The shell SHALL render a set `displayName` in the body type face. It SHALL
render an `actorId` fallback in the mono type face.

#### Scenario: A hydrated actor's name shows beside the account button

- **WHEN** the signed-in actor's session carries a `displayName`
- **THEN** the header shows that name to the left of the account button, in
  the body face

#### Scenario: A federated actor's id shows beside the account button

- **WHEN** the signed-in actor holds a federated account, so the session
  never carries a `displayName`
- **THEN** the header shows the actor's `actorId` to the left of the account
  button, in the mono face

#### Scenario: The pre-hydration window shows the actor id

- **WHEN** an actor has logged in and the `GET /account/me` hydration call
  has not yet resolved
- **THEN** the header shows the actor's `actorId` to the left of the account
  button
- **AND** the header switches to the hydrated `displayName` once hydration
  resolves
