## ADDED Requirements

### Requirement: The account menu shows the running build's version

The account menu SHALL show the build version as a bare mono-face line
below the Logout entry. A hairline rule SHALL separate the two. The line
SHALL carry no label. It SHALL show for every signed-in actor, regardless
of role.

The version string SHALL be `Major.Minor.Revision.BuildHash`, read from the
repository's `VERSION` file at `packages/web` build time. It stays fixed
for the life of that build. The line SHALL NOT carry `role="menuitem"`: it
names no action. It sits outside the menu's interactive semantics even
though it renders inside the same popup.

#### Scenario: Any signed-in actor sees the build version

- **WHEN** a signed-in actor holding any role opens the account menu
- **THEN** the menu shows a mono-face line below Logout carrying the
  build's `Major.Minor.Revision.BuildHash` string
- **AND** that line carries no `role="menuitem"`

#### Scenario: The version line survives a rebuild

- **WHEN** `packages/web` is rebuilt against a different `VERSION` file
- **THEN** the account menu's version line shows the new build's string
