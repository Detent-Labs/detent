## MODIFIED Requirements

<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/unified-shell/spec.md. Only the studio
     area's entry and its two new scenarios change. The directives below excuse
     that carried-over wording, nothing this change wrote. -->

### Requirement: Areas are gated by the same roles the HTTP layer enforces

<!-- antislop: allow passive-voice sentence-length run-ons frozen-verbs -->

The shell SHALL declare, in one place, the roles that reveal each area: the app
area needs only a session, the admin area `system:admin` or
`system:datalists`, the studio area `system:developer` or `system:templates`,
and the reporting area `system:reports`. The declaration SHALL carry a set of
roles per area, and an actor holding any one of them SHALL enter. The same
declaration SHALL drive the area navigation, the `/` redirect and the guard on a
direct hit.

<!-- antislop: allow passive-voice sentence-length -->

The admin area carries two roles because the data list screens live in it while
their maintainers must not hold `system:admin`. Area entry is therefore the
weaker gate, and each screen keeps its own role check. See the `admin-app`
capability.

The studio area carries two roles for the same reason. The templates screen
lives in it, and a template curator must not hold `system:developer`. Area entry
is the weaker gate there too, so the studio area declares a per-screen role map
of its own.

<!-- antislop: allow passive-voice -->

This gating is display logic. It SHALL NOT be the only enforcement: the engine
still answers `403` to a direct API call.

<!-- antislop: allow passive-voice -->

#### Scenario: A direct hit on a forbidden area is refused

- **WHEN** an actor holding neither `system:admin` nor `system:datalists`
  navigates directly to `/admin`
- **THEN** the shell shows an explanatory state rather than the admin screens

#### Scenario: The data list role opens the admin area

- **WHEN** an actor holding only `system:datalists` navigates to `/admin`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The template role opens the studio area

- **WHEN** an actor holding only `system:templates` navigates to `/studio`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The shell refuses a direct hit on the studio area

- **WHEN** an actor holding neither `system:developer` nor `system:templates`
  navigates directly to `/studio`
- **THEN** the shell shows an explanatory state rather than the studio screens

#### Scenario: The server is still the enforcement point

<!-- antislop: allow passive-voice -->

- **WHEN** an actor without `system:admin` calls an admin route directly, past
  any browser
- **THEN** the engine answers `403`, unchanged by this capability

## ADDED Requirements

### Requirement: The studio area gates each screen by role

The studio area SHALL declare a role map keyed by screen, in
`packages/web/src/areas/studio/routing.ts`. The map SHALL put the six existing
screens behind `system:developer`. Those six are the process list, the editor,
the versions screen, the migration screen, the tools screen and the player. The
map SHALL put the templates screen behind `system:templates`.

The map SHALL drive the area navigation and the guard on a direct hit. The admin
area's own map does the same. An actor reaching a screen the map denies SHALL
see an explanatory state rather than the screen.

The area's default route is the process list, which the map denies a curator.
The area SHALL therefore move an actor stranded on that default to the
templates screen. The admin area already does this for a maintainer stranded
on the instances list. Without the move, a curator meets a refusal as the
first screen after login.

This gate exists because the area entry now admits two roles. Without the map,
a template curator would reach every authoring screen in the studio area.

The map is display logic. The engine's role check on each studio route stays the
enforcement.

#### Scenario: A curator sees only the templates screen

- **WHEN** an actor holding only `system:templates` enters the studio area
- **THEN** the navigation offers the templates screen and none of the six others

#### Scenario: A curator lands on the templates screen, not on a refusal

- **WHEN** an actor holding only `system:templates` logs in and the shell
  sends them to the studio area
- **THEN** the templates screen renders
- **AND** the explanatory state for the process list does not render

#### Scenario: A curator cannot open an authoring screen directly

- **WHEN** an actor holding only `system:templates` navigates directly to the
  studio process list
- **THEN** the shell shows an explanatory state rather than the process list

#### Scenario: A developer keeps every authoring screen

- **WHEN** an actor holding only `system:developer` enters the studio area
- **THEN** the navigation offers all six existing screens

#### Scenario: A developer does not reach the templates screen

- **WHEN** an actor holding only `system:developer` navigates directly to the
  templates screen
- **THEN** the shell shows an explanatory state, while the process picker still
  reads `GET /templates` to seed a new process

#### Scenario: The server still enforces the studio routes

- **WHEN** an actor holding only `system:templates` calls a studio route the map
  hides, past any browser
- **THEN** the engine answers `403`
