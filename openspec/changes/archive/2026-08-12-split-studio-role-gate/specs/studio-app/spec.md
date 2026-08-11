## MODIFIED Requirements

### Requirement: An authenticated actor without the developer role sees an explanatory empty state

The shell SHALL read the roles the login response carries. When the account
holds none of `system:developer`, `system:author` and `system:templates`, the
shell SHALL render an explanatory screen. That screen SHALL state that the
account lacks studio access. The shell SHALL NOT redirect to `/login`, because
the credentials are valid. It SHALL NOT render a partly populated screen.

An account holding `system:templates` alone SHALL enter the area and reach
the templates screen only. Every other studio screen SHALL refuse it and
SHALL state which role the account lacks.

An account holding `system:author` alone SHALL enter the area. It SHALL reach
the process list, the editor, the versions screen and the player. The
migration screen, the tools screen and the templates screen SHALL refuse it.
Each SHALL state which role the account lacks.

This client-side check only decides what the shell renders. Every studio route
SHALL stay gated server-side whatever the browser decides.

#### Scenario: A participant account learns why studio is empty

- **WHEN** an actor holding no studio role logs in to studio
- **THEN** an explanatory empty state renders
- **AND** the shell renders neither the login screen nor any process or draft
  data

#### Scenario: A curator enters the area and reaches one screen

- **WHEN** an actor holding only `system:templates` logs in to studio
- **THEN** the templates screen renders
- **AND** the process list refuses and names the missing role

#### Scenario: An author enters the area and reaches the process list

- **WHEN** an actor holding only `system:author` logs in to studio
- **THEN** the process list renders
- **AND** the migration screen refuses and names the missing role

#### Scenario: The frontend check is not the control

- **WHEN** a client that skipped the shell check calls a draft route directly
- **THEN** the server still answers 403
