<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: form-ui is a source-only workspace package with no build step

`packages/form-ui` SHALL be a Bun workspace package whose `exports` map points
directly at its `.tsx`/`.ts` source files, the same convention the engine
package uses for its own exports — no bundling or compilation step between
editing a source file and a consumer seeing the change. It SHALL NOT depend on
`packages/web`, so the dependency direction (`web → form-ui →
workflow-engine`) cannot be inverted.

`packages/form-ui` SHALL stay its own package. It SHALL NOT move inside
`packages/web`, because both of its consumers, the app area and the studio
area's Player, must keep importing one renderer.

#### Scenario: form-ui has no application dependency

- **WHEN** `packages/form-ui`'s `package.json` dependencies are inspected
- **THEN** `packages/web` does not appear among them

#### Scenario: A source edit is visible without a build step

- **WHEN** a `.tsx` file inside `packages/form-ui` is edited
- **THEN** a consumer importing that module via the workspace `exports` map
  sees the change on its next dev-server reload, with no intermediate build
  command required

### Requirement: Required and invalid state are conveyed programmatically, not only visually

Every control `form-ui` renders SHALL carry `aria-required` when the resolved
view marks the field required, and `aria-invalid` when issues are attached to
it, on **every** rendering branch — the seven type branches and the group
members alike. The visual required marker (`*` with a `title`) SHALL remain,
but SHALL NOT be the only signal.

The native `required` attribute MAY be set where it does not introduce
browser-native submission blocking; the engine is the validator, and a native
block would prevent the submission the server is meant to judge. When in
doubt, `aria-required` alone is correct.

`form-ui` is deliberately the one renderer shared by the app area and the
studio area's Player, so this reaches every participant-facing form at once.

#### Scenario: A required field announces that it is required

- **WHEN** a screen-reader user focuses a field the current step's view marks
  required
- **THEN** it is announced as required

#### Scenario: An invalid field announces that it is invalid

- **WHEN** a field has attached issues
- **THEN** it is announced as invalid, and its description names them

#### Scenario: Every branch is covered

- **WHEN** any of the rendered field types — including a group's members and
  the free-text fallback branch — is required or invalid
- **THEN** the same attributes are present; no branch is exempt

#### Scenario: Native validation does not pre-empt the server

- **WHEN** a form with a required-but-empty field is submitted
- **THEN** the submission still reaches the engine, which is what decides
  whether it is valid

### Requirement: form-ui ships one stylesheet for both consumers

`form-ui` SHALL ship the CSS for everything it renders (fields, groups,
validation errors, path buttons) as part of the package, so both the studio
area's Player and the app area CAN render forms with
identical structure and identical styling — a shared component tree without
a shared stylesheet would still let the two areas' rendering drift visually.
The stylesheet SHALL be imported once, at `packages/web/src/main.tsx`, rather
than once per consuming area: one bundle now carries both consumers, so a
second import would be the same sheet twice.

#### Scenario: The end-user app imports the shared stylesheet

- **WHEN** `packages/web`'s entry point is inspected
- **THEN** it imports `form-ui/form-ui.css`

#### Scenario: Both consumers import the same stylesheet

- **WHEN** the studio area's Player and the app area each render a step form
  via `form-ui`
- **THEN** both are styled by the same `form-ui`-provided stylesheet, not two
  independently maintained copies
