## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: Draft routes are exposed behind the developer role

`src/http/studio-routes.ts` SHALL expose four routes: `GET /drafts`,
`GET /drafts/:processId`, `PUT /drafts/:processId` and
`DELETE /drafts/:processId`. `src/http/server.ts` SHALL dispatch them together
with their CORS preflight. They SHALL stay out of `src/http/routes.ts`, so that
file stays the participant-facing surface.

Every one of these routes SHALL resolve the actor and then admit
`DEVELOPER_ROLE` or `AUTHOR_ROLE`. One named predicate SHALL carry that check,
with no intervening policy abstraction. The predicate SHALL name that one
pair, so a later route cannot reach for it and quietly widen itself.

An unresolvable credential SHALL yield 401. A resolved actor holding neither
role SHALL yield 403. The existing `src/http/errors.ts` mapping produces both
answers. `GET /drafts/:processId` for an absent draft
SHALL yield 404. A `PUT` carrying a malformed envelope SHALL yield 400, and one
carrying a stale revision SHALL yield 409.

A draft holds unfinished, private work. `system:templates` SHALL still reach
no draft route.

#### Scenario: A developer reads and writes a draft

- **WHEN** an actor holding `system:developer` PUTs a draft and then GETs it
- **THEN** both responses are 200 and the GET returns what the PUT sent

#### Scenario: An author reads and writes a draft

- **WHEN** an actor holding only `system:author` PUTs a draft and then GETs it
- **THEN** both responses are 200 and the GET returns what the PUT sent

#### Scenario: The engine refuses an actor holding neither authoring role

- **WHEN** an authenticated actor holding neither `system:developer` nor
  `system:author` calls any of the four draft routes
- **THEN** the response is 403

#### Scenario: The engine refuses a curator

- **WHEN** an actor holding only `system:templates` calls any of the four draft
  routes
- **THEN** the response is 403

#### Scenario: The engine refuses an anonymous caller

- **WHEN** a request without a resolvable credential reaches any draft route
- **THEN** the response is 401

#### Scenario: A stale revision is a conflict, not a 500

- **WHEN** a `PUT /drafts/:processId` carries a revision older than the stored
  one
- **THEN** the response is 409 and the engine leaves the stored draft as it was

#### Scenario: A malformed envelope is a 400

- **WHEN** a `PUT /drafts/:processId` carries a non-object `body`, a
  non-object `layout` or a non-integer `revision`
- **THEN** the response is 400 and the engine writes no draft and changes none

#### Scenario: An absent draft is a 404

- **WHEN** `GET /drafts/:processId` names a process with no draft
- **THEN** the response is 404
