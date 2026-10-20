<!-- antislop: allow-file passive-voice -->
<!-- The scenario and requirement text below is copied from the live spec; only the 127.0.0.1 cause differs. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: The devcontainer permits every frontend dev origin

The devcontainer's `CORS_ALLOWED_ORIGINS` value SHALL list the
`http://localhost:<port>` origin of every frontend package's dev server. Each
of them can then call the engine's HTTP wrapper from a browser, with no
per-contributor setting change.

It SHALL list the `http://127.0.0.1:<port>` origin of that same dev server too.
The manual checklist mandates that address. The bring-up publishes every port
on the IPv4 loopback address alone. A browser following the checklist sends an
origin the first form does not cover. One browser package therefore
contributes two entries.

In a checkout whose host address differs from the listening port, the
allowlisted origin SHALL carry the host address `worktree-isolation` derives.
The browser reaches the dev server there, so that address is the origin the
request arrives with.

The value MUST use the allowlist form that `configurable-cors-origins` already
specifies, a comma-separated origin list. It MUST NOT use the `*` wildcard.
That wildcard would work today. It is also mutually exclusive with the
credentialed CORS a future cookie-backed `ActorResolver` would need.

A change that alters a package's assigned port SHALL carry the matching
allowlist change. So SHALL one that adds or removes a frontend package.

#### Scenario: Any frontend calls the engine from a browser

- **WHEN** a browser on the assigned dev origin issues a
  cross-origin request to the engine running in the devcontainer
- **THEN** the response carries `Access-Control-Allow-Origin` echoing that
  origin, along with `Vary: Origin`

#### Scenario: An unlisted origin is still refused

- **WHEN** a browser on an origin absent from the allowlist issues the same
  request
- **THEN** no `Access-Control-Allow-Origin` header is emitted and the browser
  blocks the response, unchanged from the behavior
  `configurable-cors-origins` specifies

#### Scenario: Adding a frontend package

- **WHEN** a frontend workspace package is added
- **THEN** its assigned dev origin is added to `CORS_ALLOWED_ORIGINS` in the
  same change that adds it

#### Scenario: Removing a frontend package

- **WHEN** a frontend workspace package is deleted
- **THEN** its origin is removed from `CORS_ALLOWED_ORIGINS` in the same
  change that deletes it

#### Scenario: The allowlist carries a worktree's browser origin

- **WHEN** a checkout whose derived host address differs from the listening
  port brings its stack up
- **THEN** `CORS_ALLOWED_ORIGINS` names that host address, under both
  `localhost` and `127.0.0.1`

### Requirement: The manual checklist states its address and its one conflict

`docs/browser-checks.md` SHALL open with the operating rules a manual run
needs.

It SHALL name `127.0.0.1` as the address, never `localhost`. The bring-up
binds every published port on the IPv4 loopback address alone, and `localhost`
can resolve to `::1` first, where nothing listens. The port itself is
per checkout. The bring-up publishes the ports `worktree-isolation` derives,
through the Pod spec it generates. It prints them at the end of its run. The
checklist SHALL say so, and SHALL name the generated spec.

It SHALL also say the engine serves the bundle from `WEB_ROOT`.

It SHALL state that a contributor must build the frontend bundle first. The
engine serves `packages/web/dist`, a build output the repository does not
track. It answers every navigation with a JSON 404 when that directory is
absent.

It SHALL state that no `bun test` run may overlap a manual run. The dev
server's outbox poller claims rows the suite drives.

Each entry SHALL state what to open, what to do, and what a pass looks like.
Each entry SHALL name the change that first asked for it.

#### Scenario: A contributor opens an area

- **WHEN** a contributor follows the checklist
- **THEN** the file gives `127.0.0.1`, not `localhost`, and says the bring-up
  prints the port

#### Scenario: A reader learns where the port comes from

- **WHEN** a contributor reads the operating rules
- **THEN** the file names the bring-up as what publishes the ports, and names
  the generated Pod spec

#### Scenario: A manual run needs a build

- **WHEN** a contributor has not run the frontend build
- **THEN** the checklist says to build it first, and names why: the engine
  serves `packages/web/dist`

#### Scenario: A manual run and a test run do not overlap

- **WHEN** a dev server answers the published port
- **THEN** the checklist forbids a `bun test` run until that server stops

#### Scenario: An entry keeps its origin

- **WHEN** a reader asks why an entry exists
- **THEN** the entry names the change that first asked for the check
