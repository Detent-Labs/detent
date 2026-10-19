## MODIFIED Requirements

### Requirement: A third reserved role gates every operator-facing route

The engine SHALL define `ADMIN_ROLE = "system:admin"` in
`src/auth/authorize.ts`, alongside `PUBLISH_ROLE` and `CANCEL_ANY_ROLE`. It
SHALL check it with the same direct `requireRole` call. There is no policy
engine, no role hierarchy and no extension point. Every `/admin/*` route
SHALL need it, except the data list routes. The `authorization` capability's
`system:datalists` requirement gates those.

The check SHALL run after the actor resolves and before the route reads or
writes anything. An unresolvable credential therefore still gets a 401, and
an insufficient one a 403.

Holding `system:admin` SHALL NOT imply `system:publish` or
`system:cancel-any`; the three roles are independent strings on `Actor.roles`.

<!-- antislop: allow passive-voice - OpenSpec matches a MODIFIED block's scenario names against the live spec, so this heading keeps its wording -->
#### Scenario: An authenticated actor without the role is refused

- **WHEN** a caller requests an `/admin/*` route other than a data list route
- **AND** its credential resolves, and its `roles` lack `"system:admin"`
- **THEN** the response is 403 with a typed error body, and the route runs no
  query and no update

<!-- antislop: allow passive-voice - OpenSpec matches a MODIFIED block's scenario names against the live spec, so this heading keeps its wording -->
#### Scenario: An unresolvable credential is refused before the role is considered

- **WHEN** a caller requests an `/admin/*` route with no resolvable credential
- **THEN** the response is 401

#### Scenario: The role does not imply the other two

- **WHEN** an actor holding only `"system:admin"` requests `POST /processes`
- **THEN** the response is 403, unchanged by this capability
