## MODIFIED Requirements

<!-- antislop: allow-file passive-voice sentence-length run-ons frozen-verbs em-dash synonym-rotation -->
<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/admin-app/spec.md. Only the two-role
     entry rule and its scenarios change. -->

### Requirement: An actor without the admin role sees an explanatory empty state

After a successful login, the shell SHALL read the roles carried by the login
response and, when neither `system:admin` nor `system:datalists` is present,
SHALL render a single explanatory screen stating that the account lacks the
operator role — not a partially populated UI, and not a redirect back to login
(the credential is valid).

An actor who holds exactly one of the two SHALL enter the area and reach the
screens that role gates. The operations screens SHALL stay behind
`system:admin`, and the data list screens behind `system:datalists`. A screen
the actor's role does not gate SHALL show the same explanatory state rather
than a partially populated UI.

This client-side check SHALL be presentational only; the server-side
`requireRole` on every `/admin/*` route remains the enforcement.

#### Scenario: A participant logs into the admin area

- **WHEN** an actor whose roles include neither `system:admin` nor
  `system:datalists` logs in
- **THEN** the explanatory screen is shown and no operations screen is reachable

#### Scenario: An operator logs in

- **WHEN** an actor holding `system:admin` logs in
- **THEN** the operations screens are reachable

#### Scenario: A data list maintainer reaches only their screens

- **WHEN** an actor holding `system:datalists` and not `system:admin` logs in
- **THEN** the data list screens are reachable and the operations screens show
  the explanatory state

## ADDED Requirements

### Requirement: A Data lists screen maintains value lists

The admin area SHALL carry an overview screen listing every data list, and a
detail screen for one list. The detail screen SHALL change the list's label,
its description, and its values. It SHALL also report which processes
reference the list.

The detail screen SHALL mark an inactive value as inactive rather than hide
it. An operator then sees what a running instance can still hold. Saving
values sends the whole set, matching the route that replaces them.

Both screens SHALL sit behind `system:datalists`, not behind `system:admin`.
An actor without that role SHALL see the explanatory empty state the area
already shows for a missing role.

#### Scenario: The overview reaches the detail screen
- **WHEN** an authorized actor selects a list on the overview
- **THEN** the detail screen opens for that list

#### Scenario: The detail screen marks an inactive value
- **WHEN** a list holds an inactive value
- **THEN** the detail screen shows it and marks it inactive

#### Scenario: The detail screen names the processes that use the list
- **WHEN** a published body references the list
- **THEN** the detail screen names that process

#### Scenario: An actor without the data list role sees an empty state
- **WHEN** an actor holding `system:admin` but not `system:datalists` opens
  either screen
- **THEN** the area shows its explanatory empty state
