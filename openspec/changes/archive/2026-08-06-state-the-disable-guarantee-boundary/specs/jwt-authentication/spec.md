## MODIFIED Requirements

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

The window this closes is not zero. The resolver runs once per request, ahead
of the route handler. A request that has already passed it SHALL run to the
end under the rights it resolved. Every request that starts after the disable
commits SHALL get `401`.

The window is therefore the duration of one request in flight. This design
cannot make it shorter. A shorter one would need a second directory read
partway through a request, and no such read exists.

An action already in the outbox SHALL keep delivering after the disable. The
delivery worker resolves no actor. It claims a due row and calls that row's
handler (`src/engine/outbox.ts`). The disable reaches the requests an account
makes. It does not reach the side effects that account's earlier requests
enqueued.

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

#### Scenario: A request already past the resolver keeps its rights

- **WHEN** an actor holding `system:admin` disables its own account through
  `POST /admin/users/:id/disable`
- **THEN** that request answers `200` and writes the row, and the next request
  carrying the same token answers `401`

#### Scenario: An action enqueued before the disable still delivers

- **WHEN** an account's submission enqueues an outbox row, and an operator
  disables that account before the worker claims it
- **THEN** the worker delivers that row, and no directory read stands between
  the row and its handler
