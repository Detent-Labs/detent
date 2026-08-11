## ADDED Requirements

### Requirement: A system:author role gates the no-code authoring subset

`AUTHOR_ROLE = "system:author"` SHALL admit every route a person needs to build
a process without a developer. Those are the four draft routes, the publish
route beside `system:publish`, `GET /registry`, the two template reads and the
published version body.

Three routes outside the studio prefix join that set, because the studio
screens call them:

- `GET /admin/data-lists`, which fills the `"db.list"` picker in the data-source
  panel. It already admits `system:developer` for that one reason.
- `GET /instances/:id/record` for an instance the actor started, which the
  Player renders beside the form. The requirement below carries that rule.
- `GET /processes/:processId/versions`, which needs a session and no reserved
  role, so it admits this role already.

`GET /registry` belongs in the set on purpose. Two callers read it. One is the
Tools screen. The other is the studio inspector's plugin-config form, which
turns a registered type's config schema into a form. An author who cannot
call that route falls back to raw JSON for every action config. Avoiding that
fallback is why the role exists.

`system:author` SHALL NOT admit the two migration-plan routes or the orphan-key
scan. Those three stay behind `system:developer` alone. An analyst authors a
process. That work must not carry the power to rewrite the state of every
running instance on a version.

`system:author` SHALL NOT admit any data list write, nor any other `/admin/*`
route. The read is the whole grant there, matching what `system:developer`
already holds.

The role SHALL imply nothing else, and no other reserved role SHALL imply it.
An actor holding `system:author` alone SHALL NOT publish, cancel an instance,
administer an account or write a template.

The grant widens. No route this role reaches becomes closed to any role that
reached it before.

#### Scenario: An author reads and writes a draft

- **WHEN** an actor holding only `system:author` PUTs a draft and then GETs it
- **THEN** the engine authorizes both requests

#### Scenario: An author reads the registry

- **WHEN** an actor holding only `system:author` calls `GET /registry`
- **THEN** the engine authorizes the request and answers with the
  config-schema descriptions

#### Scenario: An author reaches no migration route

- **WHEN** an actor holding only `system:author` calls either migration-plan
  route or the orphan-key scan
- **THEN** the response is `403` in each case

#### Scenario: The author role implies nothing

- **WHEN** an actor whose `roles` is exactly `["system:author"]` reaches
  `requireRole(actor, PUBLISH_ROLE)`, `requireRole(actor, ADMIN_ROLE)`,
  `requireRole(actor, DEVELOPER_ROLE)` or `requireRole(actor, TEMPLATES_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the author role

- **WHEN** `requireRole(actor, AUTHOR_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]`, exactly `["system:developer"]` or
  exactly `["system:templates"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: An author seeds a draft from a template

- **WHEN** an actor holding only `system:author` calls `GET /templates`, `GET
  /templates/:key` or `GET /processes/:processId/versions/:version`
- **THEN** the engine authorizes each request

#### Scenario: An author writes no template

- **WHEN** an actor holding only `system:author` calls `PUT /templates/:key` or
  `DELETE /templates/:key`
- **THEN** the response is `403` in both cases

#### Scenario: An author publishes only with the publish role

- **WHEN** an actor holding only `system:author` calls `POST
  /drafts/:processId/publish`
- **THEN** the response is `403`
- **AND** the engine authorizes that same actor once they also hold
  `system:publish`

#### Scenario: An author reads the data list keys

- **WHEN** an actor holding only `system:author` calls `GET /admin/data-lists`
- **THEN** the engine authorizes the request

#### Scenario: An author writes no data list

- **WHEN** that same actor calls a data list write route
- **THEN** the response is `403`

#### Scenario: An author reads the record of an instance they started

- **WHEN** an actor holding only `system:author` calls `GET
  /instances/:id/record` for an instance whose `startedBy` matches their id
- **THEN** the engine authorizes the request

#### Scenario: An author reads no record of an instance they did not start

- **WHEN** that same actor calls the record route for an instance whose
  `startedBy` names somebody else
- **THEN** the engine throws `AuthorizationError`

## MODIFIED Requirements

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define eight reserved role strings in `src/auth/authorize.ts`:

- `PUBLISH_ROLE = "system:publish"`
- `CANCEL_ANY_ROLE = "system:cancel-any"`
- `ADMIN_ROLE = "system:admin"`
- `DEVELOPER_ROLE = "system:developer"`
- `REPORTS_ROLE = "system:reports"`
- `DATALISTS_ROLE = "system:datalists"`
- `TEMPLATES_ROLE = "system:templates"`
- `AUTHOR_ROLE = "system:author"`

These SHALL be the only roles this capability defines. No role hierarchy,
wildcard or general permission model SHALL exist. In particular no one of them
SHALL imply any other.

The `system:` prefix is a naming convention only. It marks these
engine-reserved roles off from the free-form business roles a deployment
assigns for `Step.assignment`, such as `"finance-approver"`. Nothing enforces
the prefix structurally, since `Actor.roles` and `auth_users.roles` stay plain
`string[]`.

#### Scenario: The module exports the reserved role constants

- **WHEN** a reader inspects `src/auth/authorize.ts` for its exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"`,
  `REPORTS_ROLE` with value `"system:reports"`, `DATALISTS_ROLE` with value
  `"system:datalists"`, `TEMPLATES_ROLE` with value `"system:templates"` and
  `AUTHOR_ROLE` with value `"system:author"`

#### Scenario: The admin role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The developer role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` or `requireRole(actor,
  ADMIN_ROLE)` runs for an actor whose `roles` is exactly
  `["system:developer"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The reports role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)`, `requireRole(actor, ADMIN_ROLE)`
  or `requireRole(actor, DEVELOPER_ROLE)` runs for an actor whose `roles`
  is exactly `["system:reports"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: No other reserved role implies the reports role

- **WHEN** `requireRole(actor, REPORTS_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]`, exactly `["system:developer"]`,
  exactly `["system:publish"]` or exactly `["system:cancel-any"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: The data list role implies nothing

- **WHEN** `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor,
  DEVELOPER_ROLE)` or `requireRole(actor, CANCEL_ANY_ROLE)` runs for an
  actor whose `roles` is exactly `["system:datalists"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the data list role

- **WHEN** `requireRole(actor, DATALISTS_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]` or exactly `["system:developer"]`
- **THEN** it throws `AuthorizationError` in both cases

#### Scenario: The template role implies nothing

- **WHEN** an actor whose `roles` is exactly `["system:templates"]` reaches
  `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor, DEVELOPER_ROLE)` or
  `requireRole(actor, PUBLISH_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the template role

- **WHEN** an actor whose `roles` is exactly `["system:admin"]`, exactly
  `["system:developer"]` or exactly `["system:datalists"]` reaches
  `requireRole(actor, TEMPLATES_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

### Requirement: The developer role gates the authoring surface

`DEVELOPER_ROLE` SHALL admit every studio route. It SHALL be the only role the
two migration-plan routes and the orphan-key scan admit. Every other studio
route SHALL admit `system:author` as well. The three studio reads the
`system:templates` requirement below names SHALL admit that role too.

`DEVELOPER_ROLE` SHALL NOT grant any operation the other reserved roles gate.
Publishing a process body SHALL keep its separate need for `system:publish`.
The operator reads and the `/admin/*` routes SHALL keep their need for
`system:admin`.

No route loses a caller. Every account holding `system:developer` reaches
exactly what it reached before. An operator grants studio access through the
existing `src/auth/cli.ts set-roles`.

#### Scenario: A developer reaches the authoring surface

- **WHEN** an actor holding `system:developer` calls a studio route
- **THEN** the engine authorizes the request

#### Scenario: A developer does not thereby gain publish or admin rights

- **WHEN** an actor holding only `system:developer` calls `POST /processes` or
  an `/admin/*` route
- **THEN** the response is 403

#### Scenario: The developer role alone reaches the migration routes

- **WHEN** an actor holding `system:developer` calls either migration-plan
  route or the orphan-key scan
- **THEN** the engine authorizes the request
- **AND** the engine refuses the same call from an actor holding only
  `system:author`

#### Scenario: No existing caller loses a route

- **WHEN** this change lands
- **THEN** every account holding `system:developer` still reaches every studio
  route it reached beforehand

### Requirement: A system:templates role gates template maintenance

`system:templates` SHALL gate both template write routes, `PUT /templates/:key`
and `DELETE /templates/:key`. It SHALL admit both template read routes, `GET
/templates` and `GET /templates/:key`, together with `system:developer` and
`system:author`. Those two roles read a template so that every author can seed
a process from one.

The narrow grant is the point. Staff who curate a template must not gain the
power to publish a process. They must not gain the power to cancel an instance
or to administer an account.

`system:templates` SHALL also admit `GET
/processes/:processId/versions/:version`, the published body a curator creates
a template from, together with `system:developer` and `system:author`. It SHALL
NOT admit any draft route. A draft holds unfinished, private work. A published
body is the one every participant already runs.

The role mirrors `system:datalists`, including the read asymmetry. It implies
nothing, and no other reserved role implies it.

#### Scenario: The role gates a template write
- **WHEN** an actor holding `system:templates` writes a template
- **THEN** the route accepts the write

#### Scenario: A developer does not inherit template write access
- **WHEN** an actor holding only `system:developer` writes a template
- **THEN** the route answers with an authorization error

#### Scenario: An admin does not inherit template write access
- **WHEN** an actor holding only `system:admin` deletes a template
- **THEN** the route answers with an authorization error

#### Scenario: A developer reads the template list
- **WHEN** an actor holding only `system:developer` calls `GET /templates`
- **THEN** the route returns the list

#### Scenario: An author reads the template list
- **WHEN** an actor holding only `system:author` calls `GET /templates`
- **THEN** the route returns the list

#### Scenario: A curator reads one template
- **WHEN** an actor holding only `system:templates` calls `GET /templates/:key`
- **THEN** the route returns that template

#### Scenario: The role opens no other route surface
- **WHEN** an actor whose `roles` is exactly `["system:templates"]` calls `POST
  /processes`, any `/admin/*` route, or any `/reporting/*` route
- **THEN** the response is `403` in each case

#### Scenario: The role reads a published version's body
- **WHEN** an actor holding only `system:templates` calls `GET
  /processes/:processId/versions/:version`
- **THEN** the route returns the body

#### Scenario: The role opens no other studio route
- **WHEN** that same actor calls a studio route outside the four template
  routes and the published version body
- **THEN** the response is `403`

### Requirement: A developer may read the record of an instance they started, without the reserved role

`getInstanceRecord` (`src/runtime/api.ts`) SHALL first try
`requireRole(actor, ADMIN_ROLE)`. When that throws `AuthorizationError`,
`getInstanceRecord` SHALL NOT propagate the rejection. It SHALL instead load
the instance and SHALL permit the read when `instance.startedBy === actor.id`
and `actor.roles` includes `DEVELOPER_ROLE` or `AUTHOR_ROLE`. Either authoring
role therefore reads the record of an instance created through its own Studio
Player session, without holding `system:admin`. The Player renders that record
beside the form, and both roles reach the Player.

This bypass SHALL be `getInstanceRecord`-specific, mirroring `cancelInstance`'s
existing starter bypass for `system:cancel-any`. It SHALL NOT extend to any
other operator-facing read or route. It SHALL NOT let either authoring role
read the record of an instance it did not start.

A caller satisfying neither `ADMIN_ROLE` nor the authoring-and-starter pair
SHALL learn nothing about the target instance from a failed try. Two cases
SHALL collapse to the same `AuthorizationError`. One is an unresolvable
instance id. The other is a resolvable instance that is neither theirs nor
readable by role.

That preserves the guarantee this capability already holds for
`cancelInstance`. The engine rejects a role-less caller before any instance
state becomes observable to it.

This addition leaves the requirement above untouched, the one gating `GET
/instances/:id/record` behind `system:admin`. An actor holding none of
`system:admin`, `system:developer` and `system:author` still gets
`AuthorizationError`, even for an instance they themselves started. The "same
participant cannot read a record" scenario stays true, since that actor holds
no authoring role either.

#### Scenario: A developer reads the record of an instance they started

- **WHEN** an actor holding `system:developer` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` matches their id
- **THEN** the call succeeds and returns the merged record

#### Scenario: An author reads the record of an instance they started

- **WHEN** an actor holding `system:author` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` matches their id
- **THEN** the call succeeds and returns the merged record

#### Scenario: A developer cannot read a record of an instance they did not start

- **WHEN** an actor holding `system:developer` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` does not match their
  id
- **THEN** it throws `AuthorizationError`

#### Scenario: An author cannot read a record of an instance they did not start

- **WHEN** an actor holding `system:author` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` does not match their
  id
- **THEN** it throws `AuthorizationError`

#### Scenario: A participant with no authoring role is still refused, even for their own instance

- **WHEN** an actor holding none of `system:admin`, `system:developer` and
  `system:author` calls `getInstanceRecord` for an instance they themselves
  started
- **THEN** it throws `AuthorizationError`, unchanged from this capability's
  existing behavior
