# Spec Delta

## ADDED Requirements

### Requirement: The CI workflow grants its token read access only

The hosted CI workflow SHALL grant its token read access to repository contents
and nothing else, at workflow level. Every checkout step SHALL set
`persist-credentials: false`. Every action SHALL be pinned to a full commit sha,
with a comment that names the release.

#### Scenario: The token reads contents alone

- **WHEN** a contributor reads the workflow file
- **THEN** it declares `permissions` with `contents: read` at its top level
- **AND** it grants no job a wider permission

#### Scenario: A checkout leaves no token in the mounted repository

- **WHEN** a job checks out the repository
- **THEN** the step sets `persist-credentials: false`, so the token never reaches the `.git` the devcontainer mounts

#### Scenario: Every action names a sha

- **WHEN** a step names an action with `uses`
- **THEN** the reference ends in a 40-character commit sha
- **AND** a comment on the line names the release that sha belongs to

### Requirement: Dependabot updates the lockfile the install reads

`.github/dependabot.yml` SHALL declare the `bun` package ecosystem for each
directory that holds a manifest the root `bun.lock` covers. It SHALL NOT declare
the `npm` ecosystem for those directories. The `github-actions` ecosystem stays.

#### Scenario: Every manifest directory uses the bun ecosystem

- **WHEN** a contributor reads `.github/dependabot.yml`
- **THEN** the root, `packages/form-ui` and `packages/web` each appear with `package-ecosystem: "bun"`
- **AND** no entry names `npm`

### Requirement: The test preload leaves no standing credential

A test preload that creates a login role SHALL give it a password drawn fresh
for each run. It SHALL NOT use a fixed password. It SHALL hand the password to
the suite through the process environment. A suite that needs the role SHALL
skip when the environment has no password.

#### Scenario: The server refuses the retired fixed password

- **WHEN** a client connects as the audit probe role with the password `probe`
- **THEN** the server refuses the connection

#### Scenario: A run without the password skips the probe suite

- **WHEN** the preload could not set the role's password
- **THEN** the privileges suite skips, as it does when the role is absent
