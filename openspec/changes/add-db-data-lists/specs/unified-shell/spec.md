## MODIFIED Requirements

<!-- antislop: allow-file passive-voice sentence-length run-ons frozen-verbs -->
<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/unified-shell/spec.md. Only the shape of
     the declaration and the admin area's entry change. -->

### Requirement: Areas are gated by the same roles the HTTP layer enforces

The shell SHALL declare, in one place, the roles that reveal each area: the app
area needs only a session, the admin area `system:admin` or
`system:datalists`, the studio area `system:developer`, and the reporting area
`system:reports`. The declaration SHALL carry a set of roles per area, and an
actor holding any one of them SHALL enter. The same declaration SHALL drive the
area navigation, the `/` redirect and the guard on a direct hit.

The admin area carries two roles because the data list screens live in it while
their maintainers must not hold `system:admin`. Area entry is therefore the
weaker gate, and each screen keeps its own role check. See the `admin-app`
capability.

This gating is display logic. It SHALL NOT be the only enforcement: the engine
still answers `403` to a direct API call.

#### Scenario: A direct hit on a forbidden area is refused

- **WHEN** an actor holding neither `system:admin` nor `system:datalists`
  navigates directly to `/admin`
- **THEN** the shell shows an explanatory state rather than the admin screens

#### Scenario: The data list role opens the admin area

- **WHEN** an actor holding only `system:datalists` navigates to `/admin`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The server is still the enforcement point

- **WHEN** an actor without `system:admin` calls an admin route directly, past
  any browser
- **THEN** the engine answers `403`, unchanged by this capability
