<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Player connects to a running HTTP server with a persisted actor

**Reason**: `packages/editor` is deleted; its Player is carried over into
`packages/studio` as `studio-player` (this change), reusing Studio's own
existing session mechanism rather than a separate persisted-actor scheme.

**Migration**: Use `studio-player`, which authenticates through the studio
shell's existing login/session (see `studio-app`).

### Requirement: A 401 from any route returns the Player to the login screen

**Reason**: `packages/editor` is deleted. `studio-app`'s existing "An
expired session returns to login" scenario (under "Studio authenticates
with the existing login and session mechanism") already covers this for
every studio route, including the new Player.

**Migration**: None.

### Requirement: Player creates a new process instance

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`.

**Migration**: Use `studio-player`'s "A Player screen drives a real instance
through the Runtime API Layer" requirement.

### Requirement: Player opens an existing instance by id

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`.

**Migration**: Use `studio-player`'s "A Player screen drives a real instance
through the Runtime API Layer" requirement.

### Requirement: Player renders the current step as a form

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`.

**Migration**: Use `studio-player`, which renders the current step through
`form-ui`, unchanged.

### Requirement: Field rendering is delegated to the shared form-ui package

**Reason**: `packages/editor` is deleted. `form-ui`'s own requirements
already govern this from the renderer's side; `studio-player` is the new
consumer.

**Migration**: See the `form-ui` capability, and `studio-player`'s reuse of
it.

### Requirement: Player submits only visible, editable fields

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`.

**Migration**: Use `studio-player`'s "A Player screen drives a real instance
through the Runtime API Layer" requirement.

### Requirement: Player always re-fetches the instance view after a mutation

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`.

**Migration**: Use `studio-player`'s "Submitting a step re-fetches the view"
scenario.

### Requirement: Player supports manual refresh with no polling

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`.

**Migration**: Use `studio-player`'s "A Player screen drives a real instance
through the Runtime API Layer" requirement.

### Requirement: Player maps and displays each HTTP error type distinctly

**Reason**: `packages/editor` is deleted; this behavior is carried over into
`studio-player`, and `spa-error-reporting` already governs failure-state
rendering across every browser package.

**Migration**: Use `studio-player`'s "An HTTP error renders as a named
state, not a crash" scenario, and the `spa-error-reporting` capability.

### Requirement: Player and Structure editor are independent, togglable modes

**Reason**: `packages/editor` is deleted. `packages/studio` already has a
Structure/JSON toggle (`studio-json-view`); `studio-player`'s "Player is one
of the edit screen's togglable surfaces" requirement extends the same
independence to Player and Tools.

**Migration**: Use `studio-player`'s toggling requirement.
