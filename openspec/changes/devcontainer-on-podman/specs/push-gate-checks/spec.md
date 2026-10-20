# Spec Delta

## MODIFIED Requirements

### Requirement: A gate that needs no container runs on the host

A gate that needs only git and a shell SHALL run on the host. It runs before the
hook starts the container checks. A gate that needs Bun SHALL run inside the
devcontainer, through the `podman exec` the hook already uses.

A container gate SHALL reach the pod the derivation `worktree-isolation`
specifies, and SHALL NOT name a pod or a container itself.

Host placement buys two things. A contributor with a stopped container still gets
those findings. The checks that cost milliseconds run before the ones that cost
minutes.

A gate SHALL NOT fall back to the host when it needs the container. The push-gate
requirement in `development-toolchain` already forbids that fallback, for the
typecheck and the suite, for this reason.

#### Scenario: A stopped container still reports the host gates

- **WHEN** a contributor pushes while the devcontainer is down
- **THEN** the host gates run and report their findings
- **AND** the preflight then refuses the push for the container checks

#### Scenario: A container gate does not degrade to the host

- **WHEN** a gate needs Bun and the container is unavailable
- **THEN** the push stops
- **AND** that gate does not run against a host Bun

#### Scenario: A container gate reaches the pushing checkout

- **WHEN** a container gate runs from a linked worktree
- **THEN** it execs into that worktree's own `app` container, not another
  checkout's

### Requirement: No tracked file carries an absolute home-directory path

A gate SHALL reject a tracked file that holds an absolute path into a user's home
directory, on any platform. It SHALL match each of these spellings. The Windows
drive form, in either letter case. That form takes forward slashes, single
backslashes or the doubled backslashes of a JSON string. The Git Bash and WSL
form, where the drive letter stands in a leading path segment. The macOS
`/Users/<name>` form. The Linux `/home/<name>` form.

Commit e152f9c removed two such paths. One sat in a skill file and carried the
Windows account name. The other sat in thirteen shell examples in a plan document.
A path of that shape works on one machine and on no other. It also discloses the
account name to everyone who clones the repository.

The gate SHALL read tracked files only. Untracked local state and ignored files
carry machine paths by design.

Some tracked paths describe a container filesystem rather than a contributor's
machine. The devcontainer image's `node` user and `root` are container users.
Archived changes quote `/home/node/.claude`, the mount a retired
`devcontainer.json` declared. The gate SHALL exclude those paths, and the
change SHALL name each exclusion. Without the exclusion this gate lands red,
which the arrives-green requirement forbids.

#### Scenario: A container filesystem path raises no finding

- **WHEN** a tracked file under an excluded path names a container home directory
- **THEN** the gate raises no finding, and the push proceeds

#### Scenario: A committed machine path blocks the push

- **WHEN** the pushed range adds a tracked file holding a home-directory path
- **THEN** the gate rejects the push and names the file and line
- **AND** it names the machine-path rule

#### Scenario: An ignored file carries a machine path freely

- **WHEN** an untracked or ignored file holds a home-directory path
- **THEN** the gate raises no finding

#### Scenario: A Git Bash path blocks the push

- **WHEN** a tracked file holds `/<drive letter>/Users/<name>`
- **THEN** the gate rejects the push and names the file

#### Scenario: A macOS path blocks the push

- **WHEN** a tracked file holds `/Users/<name>` at the start of a path
- **THEN** the gate rejects the push and names the file

#### Scenario: A lowercase drive path blocks the push

- **WHEN** a tracked file holds a drive path whose `users` directory is lowercase
- **THEN** the gate rejects the push and names the file

#### Scenario: A JSON-escaped Windows path blocks the push

- **WHEN** a tracked file holds a Windows home path with each backslash doubled
- **THEN** the gate rejects the push and names the file
