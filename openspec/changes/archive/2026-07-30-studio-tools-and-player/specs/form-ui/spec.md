<!-- antislop: allow-file all -->

## MODIFIED Requirements

### Requirement: form-ui is a source-only workspace package with no build step

`packages/form-ui` SHALL be a Bun workspace package whose `exports` map points
directly at its `.tsx`/`.ts` source files, the same convention the engine
package uses for its own exports — no bundling or compilation step between
editing a source file and a consumer seeing the change. It SHALL depend on
neither `packages/app` nor `packages/studio`, so the dependency direction
(`app → form-ui → workflow-engine`, `studio → form-ui`) cannot be inverted.

#### Scenario: form-ui has no application dependency

- **WHEN** `packages/form-ui`'s `package.json` dependencies are inspected
- **THEN** neither `packages/app` nor `packages/studio` appears among them

#### Scenario: A source edit is visible without a build step

- **WHEN** a `.tsx` file inside `packages/form-ui` is edited
- **THEN** a consumer importing that module via the workspace `exports` map
  sees the change on its next dev-server reload, with no intermediate build
  command required

### Requirement: form-ui ships one stylesheet for both consumers

`form-ui` SHALL ship the CSS for everything it renders (fields, groups,
validation errors, path buttons) as part of the package, so both
`packages/studio`'s Player and the end-user app CAN render forms with
identical structure and identical styling — a shared component tree without
a shared stylesheet would still let the two apps' rendering drift visually.
Both consumers SHALL import `form-ui/form-ui.css`. `packages/editor`'s Player
never did (a known, documented gap: its forms rendered unstyled), and that
gap does not carry forward when the Player is carried over to
`packages/studio` — Studio's Player SHALL import the stylesheet at its own
entry point, closing the gap rather than reproducing it.

#### Scenario: The end-user app imports the shared stylesheet

- **WHEN** `packages/app`'s entry point is inspected
- **THEN** it imports `form-ui/form-ui.css`

#### Scenario: Both consumers import the same stylesheet

- **WHEN** `packages/studio` and `packages/app` each render a step form via
  `form-ui`
- **THEN** both import the same `form-ui`-provided stylesheet, not two
  independently maintained copies
