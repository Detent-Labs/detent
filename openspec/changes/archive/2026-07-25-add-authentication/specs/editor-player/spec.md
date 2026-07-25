## MODIFIED Requirements

### Requirement: Player connects to a running HTTP server with a persisted actor

The editor SHALL provide a Player screen where an author sets a server URL and
logs in with an email and password against `POST /auth/login`. The returned
token SHALL be sent as `Authorization: Bearer <token>` on every subsequent
Runtime API Layer call made through the HTTP wrapper; the actor identity comes
from the token, not from author-entered fields. `serverUrl` and the token SHALL
persist to `localStorage` so they survive a page reload without the author
logging in again. The previously persisted `actorId` and `actorRoles` fields
SHALL NO LONGER exist.

#### Scenario: The session persists across a reload
- **WHEN** an author logs in through the Player and reloads the page
- **THEN** the Player restores the same server URL and token without the author
  re-entering credentials

#### Scenario: Every call uses the token's actor
- **WHEN** an author creates an instance, opens an instance, or submits a
  transition
- **THEN** the request sent to the HTTP wrapper carries
  `Authorization: Bearer <token>` and no `X-Actor-Id` header

#### Scenario: Wrong credentials are reported, not persisted
- **WHEN** an author submits an email/password pair the server rejects
- **THEN** the Player reports a generic login failure and persists no token

## ADDED Requirements

### Requirement: A 401 from any route returns the Player to the login screen

The Player SHALL treat a `401` response from any route as an invalid session:
it SHALL discard the persisted token and return the author to the login screen.
The Player SHALL NOT track the token's remaining lifetime — expiry is handled
by this same path.

#### Scenario: An expired token returns the author to login
- **WHEN** a request made with a persisted token receives a `401`
- **THEN** the Player discards the token and shows the login screen

#### Scenario: The Player does not pre-empt expiry
- **WHEN** a token is nearing or past its 8-hour lifetime
- **THEN** the Player performs no client-side expiry check and only reacts to a
  `401`
