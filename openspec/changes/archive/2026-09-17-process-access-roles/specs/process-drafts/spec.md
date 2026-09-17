## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: Draft routes are exposed behind the developer role

`src/http/studio-routes.ts` SHALL expose four routes: `GET /drafts`,
`GET /drafts/:processId`, `PUT /drafts/:processId` and
`DELETE /drafts/:processId`. `src/http/server.ts` SHALL dispatch them together
with their CORS preflight. They SHALL stay out of `src/http/routes.ts`, so that
file stays the participant-facing surface.

Every one of these routes SHALL resolve the actor first. `ADMIN_ROLE` alone
SHALL admit all four, with no further role check. Every other actor SHALL
instead need `DEVELOPER_ROLE` or `AUTHOR_ROLE`. One named predicate SHALL
carry that second check, with no intervening policy abstraction. The
predicate SHALL name that one pair, so a later route cannot reach for it and
quietly widen itself.

Holding `DEVELOPER_ROLE` or `AUTHOR_ROLE` alone SHALL NOT admit
`GET /drafts/:processId`, `PUT /drafts/:processId` or
`DELETE /drafts/:processId` for a process that already has a draft or a
published version. The actor SHALL also appear on that process's Developer
list, per the `process-access-roles` capability. This added check does not
apply when `ADMIN_ROLE` already admitted the call, per the paragraph above.

`PUT /drafts/:processId` for a processId with no existing draft and no
published version is a process creation. It SHALL additionally need
`CREATE_ROLE`, on top of `DEVELOPER_ROLE` or `AUTHOR_ROLE`. `ADMIN_ROLE`
grants no exception here, unlike the other three routes above. The
Developer-list check above SHALL NOT apply here either. No Developer list
exists yet for a process that does not exist yet. On success
the engine SHALL add the calling actor to the new process's Developer list.
Neither the draft nor the Developer-list entry SHALL persist without the
other.

`GET /drafts` SHALL return only the drafts of the processes on the actor's
own Developer list. An actor holding `ADMIN_ROLE` SHALL see every draft.

An unresolvable credential SHALL yield 401. A resolved actor holding neither
role SHALL yield 403. The existing `src/http/errors.ts` mapping produces both
answers. An absent draft on `GET /drafts/:processId` SHALL yield 404.

A malformed envelope on a `PUT` SHALL yield 400. A stale revision on a `PUT`
SHALL yield 409. A `PUT`, a `GET` or a `DELETE` failing the Developer-list
check SHALL yield 403. The same holds for a `PUT` failing the `CREATE_ROLE`
check on a new process.

A draft holds unfinished, private work. `system:templates` SHALL still reach
no draft route.

#### Scenario: A developer creates a new process

- **WHEN** an actor holding `system:developer` and `system:create` PUTs a
  draft for a processId with no draft and no published version
- **THEN** the response is 200
- **AND** the actor is on the new process's Developer list

#### Scenario: An author creates a new process

- **WHEN** an actor holding `system:author` and `system:create` PUTs a draft
  for a processId with no draft and no published version
- **THEN** the response is 200
- **AND** the actor is on the new process's Developer list

#### Scenario: The engine refuses process creation without the create role

- **WHEN** an actor holding `system:developer` alone PUTs a draft for a
  processId with no draft and no published version
- **THEN** the response is 403
- **AND** the engine writes no draft

#### Scenario: A developer reads and writes a draft

- **WHEN** an actor holding `system:developer` and on that process's
  Developer list PUTs a draft for an existing process, then GETs it
- **THEN** both responses are 200 and the GET returns what the PUT sent

#### Scenario: An author reads and writes a draft

- **WHEN** an actor holding `system:author` and on that process's Developer
  list PUTs a draft for an existing process, then GETs it
- **THEN** both responses are 200 and the GET returns what the PUT sent

#### Scenario: The engine refuses an unlisted developer

- **WHEN** an actor holds `system:developer`
- **AND** the actor does not appear on that process's Developer list
- **AND** the actor calls `GET`, `PUT` or `DELETE /drafts/:processId` for an
  existing draft
- **THEN** the response is 403

#### Scenario: An admin reaches a draft with no Developer list

- **WHEN** an actor holding `ADMIN_ROLE` calls `GET /drafts/:processId` for a
  process whose Developer list is empty
- **THEN** the response is 200

#### Scenario: The drafts list narrows to the actor's own processes

- **WHEN** an actor holding `system:developer` and on process A's Developer
  list, but not process B's, calls `GET /drafts` while both have drafts
- **THEN** the response lists process A's draft
- **AND** the response omits process B's draft

#### Scenario: An admin sees every draft in the list

- **WHEN** an actor holding `ADMIN_ROLE` calls `GET /drafts` while drafts
  exist for processes the actor is not on the Developer list of
- **THEN** the response lists every one of those drafts

#### Scenario: The engine refuses an actor holding neither authoring role

- **WHEN** an authenticated actor holding neither `system:developer`,
  `system:author`, nor `ADMIN_ROLE` calls any of the four draft routes
- **THEN** the response is 403

#### Scenario: The engine refuses a curator

- **WHEN** an actor holding only `system:templates` calls any of the four draft
  routes
- **THEN** the response is 403

#### Scenario: The engine refuses an anonymous caller

- **WHEN** a request without a resolvable credential reaches any draft route
- **THEN** the response is 401

<!-- antislop: allow trailing-negation -->
<!-- title matches the archived requirement's scenario exactly, per OpenSpec's MODIFIED-block rule. -->
#### Scenario: A stale revision is a conflict, not a 500

- **WHEN** a `PUT /drafts/:processId` from a listed developer carries a
  revision older than the stored one
- **THEN** the response is 409 and the engine leaves the stored draft as it was

#### Scenario: A malformed envelope is a 400

- **WHEN** a `PUT /drafts/:processId` from a listed developer carries a
  non-object `body`, a non-object `layout` or a non-integer `revision`
- **THEN** the response is 400 and the engine writes no draft and changes none

#### Scenario: An absent draft is a 404

- **WHEN** a listed developer calls `GET /drafts/:processId` for a process
  with no draft and a published version
- **THEN** the response is 404
