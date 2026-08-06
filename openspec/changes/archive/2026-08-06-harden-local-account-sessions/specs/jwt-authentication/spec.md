## ADDED Requirements

### Requirement: The resolver re-reads the account behind every locally issued token

For a token whose `iss` is the local issuer, the resolver SHALL look the
subject up in the account directory. It SHALL do so on every resolution. A
subject the directory holds as disabled SHALL raise `ActorResolutionError`.
The HTTP wrapper answers that error with `401`. A subject the directory does
not hold at all SHALL raise the same error. A deleted account is not a live
one.

The lookup is one indexed read by `user_id`, against a table that stays small
by construction. The resolver SHALL NOT cache the answer. A cached answer
would restore the gap this requirement closes. It would hold that gap open
for as long as the entry lives.

An externally issued token SHALL keep today's behavior. Its identity provider
owns revocation, and this engine holds no directory entry for that subject.

#### Scenario: A disabled account loses a live session

- **WHEN** an operator disables an account, and a request then arrives
  carrying that account's unexpired locally issued token
- **THEN** the resolver raises `ActorResolutionError`, and the request gets
  `401`

#### Scenario: An enabled account keeps its session

- **WHEN** a request arrives carrying a valid locally issued token for an
  account the directory holds as enabled
- **THEN** the resolver returns the `Actor` it returns today

#### Scenario: A deleted account loses a live session

- **WHEN** a request arrives carrying a valid locally issued token whose
  subject no longer appears in the directory
- **THEN** the resolver raises `ActorResolutionError`

#### Scenario: An externally issued token skips the directory

- **WHEN** a request arrives carrying a token from a configured external
  issuer
- **THEN** the resolver verifies it against that issuer's key set alone, and
  reads no directory entry

### Requirement: The composition root wires the account lookup

`resolveAuthResolver` (`src/http/server.ts`) SHALL take the database handle.
It SHALL give the resolver it builds a lookup that reads `auth_users` through
that handle. A resolver this function returns SHALL therefore apply the
requirement above. Without this, that requirement states a capability
`jwtResolver` carries and no deployment uses.

`jwtResolver` without such a lookup SHALL keep today's behavior and read no
directory. That is the shape a unit test uses. It is also the shape any
caller holding no database uses.

#### Scenario: The server's own resolver reads the directory

- **WHEN** `resolveAuthResolver` builds a resolver from `AUTH_JWT_SECRET`,
  and a request carries a locally issued token for a disabled account
- **THEN** the resolver raises `ActorResolutionError`

#### Scenario: A resolver built without the lookup reads no directory

- **WHEN** a caller builds a resolver from `jwtResolver` with a local signing
  key and no account lookup
- **AND** a request carries a valid locally issued token
- **THEN** the resolver returns an `Actor` and issues no query
