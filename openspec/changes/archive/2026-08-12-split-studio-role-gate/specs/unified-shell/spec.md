## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: Areas are gated by the same roles the HTTP layer enforces

The shell SHALL declare, in one place, the roles that reveal each area. The app
area needs only a session. The admin area needs `system:admin` or
`system:datalists`. The studio area needs `system:developer`, `system:author`
or `system:templates`. The reporting area needs `system:reports`.

The declaration SHALL carry a set of roles per area, and an actor holding any
one of them SHALL enter. The same declaration SHALL drive the area navigation,
the `/` redirect and the guard on a direct hit.

The admin area carries two roles because the data list screens live in it while
their maintainers must not hold `system:admin`. Area entry is therefore the
weaker gate, and each screen keeps its own role check. See the `admin-app`
capability.

The studio area carries three roles for the same reason. The templates screen
lives in it, and a template curator must not hold `system:developer`. The
authoring screens live in it too. An author must not hold `system:developer`
either, since that role also opens migration planning. Area entry is the weaker
gate there too, so the studio area declares a per-screen role map of its own.

This gating is rendering logic. It SHALL NOT be the only enforcement: the
engine still answers `403` to a direct API call.

#### Scenario: The shell refuses a direct hit on a forbidden area

- **WHEN** an actor holding neither `system:admin` nor `system:datalists`
  navigates directly to `/admin`
- **THEN** the shell shows an explanatory state rather than the admin screens

#### Scenario: The data list role opens the admin area

- **WHEN** an actor holding only `system:datalists` navigates to `/admin`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The template role opens the studio area

- **WHEN** an actor holding only `system:templates` navigates to `/studio`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The author role opens the studio area

- **WHEN** an actor holding only `system:author` navigates to `/studio`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The shell refuses a direct hit on the studio area

- **WHEN** an actor holding none of `system:developer`, `system:author` and
  `system:templates` navigates directly to `/studio`
- **THEN** the shell shows an explanatory state rather than the studio screens

#### Scenario: The server is still the enforcement point

- **WHEN** an actor without `system:admin` calls an admin route directly, past
  any browser
- **THEN** the engine answers `403`, unchanged by this capability

### Requirement: The studio area gates each screen by role

The studio area SHALL declare a role map keyed by screen, in
`packages/web/src/areas/studio/routing.ts`. The map SHALL carry a set of roles
per screen. An actor holding any one of them SHALL reach that screen.

The admin area's map carries one role per screen, because its two roles
partition its screens cleanly. The studio area's two authoring roles do not
partition its screens, so its map carries a set.

The map SHALL admit `system:developer` and `system:author` to four screens.
Those four are the process list, the editor, the versions screen and the
player. The map SHALL put the migration screen and the tools screen behind
`system:developer` alone. The map SHALL put the templates screen behind
`system:templates`.

The map SHALL drive the area navigation and the guard on a direct hit. An actor
reaching a screen the map denies SHALL see an explanatory state rather than the
screen. That state SHALL name the roles that admit the screen.

The area's default route is the process list, which the map denies a curator.
The area SHALL therefore move an actor stranded on that default to the
templates screen. The admin area already does this for a maintainer stranded
on the instances list. Without the move, a curator meets a refusal as the
first screen after login. An author needs no such move, because the map admits
that role to the default route.

This gate exists because the area entry now admits three roles. Without the
map, a template curator would reach every authoring screen in the studio area.
An author would reach migration planning.

The map is rendering logic. The engine's role check on each studio route stays
the enforcement.

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

#### Scenario: An author sees the four authoring screens

- **WHEN** an actor holding only `system:author` enters the studio area
- **THEN** the navigation offers the process list and the tools screen is absent

#### Scenario: An author lands on the process list

- **WHEN** an actor holding only `system:author` logs in and the shell sends
  them to the studio area
- **THEN** the process list renders and no explanatory state renders

#### Scenario: An author cannot open the migration screen directly

- **WHEN** an actor holding only `system:author` navigates directly to a
  migration screen or to the tools screen
- **THEN** the shell shows an explanatory state naming the missing role

#### Scenario: The server still enforces the studio routes

- **WHEN** an actor holding only `system:templates` calls a studio route the map
  hides, past any browser
- **THEN** the engine answers `403`
