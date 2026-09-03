## MODIFIED Requirements

### Requirement: form-ui exports the design token module

`packages/form-ui` SHALL export a token module beside its renderer. The
module SHALL declare every design token the two web packages share, as typed
variable groups. Each value SHALL alias the matching custom property in the
shell's `tokens.css`. The module SHALL follow the compiler's token-file
naming rule. A consumer's build can then resolve it across the workspace
link.

The package SHALL declare the style runtime as a peer dependency. It SHALL
stay source-only. The consumer's build compiles its styles and its
token module through the workspace link. The package needs no build step of
its own.

#### Scenario: A consumer resolves the token module

- **WHEN** `packages/web` imports the accent token from form-ui
- **THEN** the production build compiles the reference and the rendered
  element carries the accent color `tokens.css` declares

#### Scenario: form-ui still has no build step

- **WHEN** a contributor edits the token module
- **THEN** the consumer's next dev-server reload shows the change with no
  intermediate build command

#### Scenario: form-ui still depends on nothing in web

- **WHEN** a contributor opens `packages/form-ui`'s `package.json`
- **THEN** `packages/web` does not appear among its dependencies or peers

## REMOVED Requirements

### Requirement: form-ui ships one stylesheet for both consumers

**Reason**: `form-ui.css` is deleted. The field renderer and the path
buttons compile from StyleX style objects, reading `form-ui`'s own token
module, per `web-styling`'s "Component styles compile from source"
requirement. The fact this requirement protected — that the studio area's
Player and the app area render identically styled forms — still holds; the
replacement requirement below states it against the new mechanism.

**Migration**: A consumer importing `form-ui/form-ui.css` (there was
exactly one: `packages/web/src/main.tsx`) drops that import. No hand-written
stylesheet replaces it; both consumers get compiled styles automatically
through the shared component tree, the same way they already share
`Chrome.tsx`'s compiled header.

## ADDED Requirements

### Requirement: form-ui's field renderer and path buttons compile from StyleX

`packages/form-ui`'s field renderer (`FieldForm`, `FieldInput`, `NoteText`)
and `PathButtons` SHALL declare their styles as typed StyleX style objects,
reading `packages/form-ui/src/tokens.stylex.ts`. `packages/form-ui` SHALL
ship no hand-written stylesheet. The studio area's Player and the app
area's Task screen, both consumers of these components, SHALL therefore
render identically styled forms with no stylesheet import of their own.

A layout choice with a fixed, small set of outcomes — how many grid
columns a form or a group draws, how wide a field spans — SHALL be chosen
in application code among named StyleX styles, not read from a DOM
attribute by a stylesheet. `FieldForm` MAY still render a `data-*`
attribute carrying that same value, as a plain rendering fact a test or a
future consumer can read; no stylesheet, compiled or hand-written, SHALL
select on it.

#### Scenario: The renderer ships no CSS file

- **WHEN** `packages/form-ui`'s `package.json` exports are inspected
- **THEN** no `./form-ui.css` (or other stylesheet) export is present

#### Scenario: Both consumers render identically without importing a stylesheet

- **WHEN** the studio area's Player and the app area's Task screen each
  render the same step's form
- **THEN** both are styled by `form-ui`'s own compiled styles alone, with
  no `form-ui`-provided stylesheet imported by either

#### Scenario: A column or span choice compiles from a style, not a selector

- **WHEN** `FieldForm` renders at `columns: 2`
- **THEN** the two-column layout comes from a StyleX style the component
  selected in code
- **AND** no compiled or hand-written rule in the bundle selects on a
  `data-columns` or `data-span` attribute

### Requirement: Path-submit buttons accept a style prop for their wrapper

`PathButtons` SHALL accept an optional style prop applying to its wrapper
element, composed after the component's own default wrapper style, so a
caller MAY extend or override that layout without `form-ui` declaring a
variant on its own behalf. Its button element's className is unaffected by
this prop.

`PathButtons`' button element SHALL keep a plain, literal className for
the shared control style it does not own. `form-ui` SHALL NOT declare a
compiled style for that class.

#### Scenario: A caller extends the wrapper's style

- **WHEN** a caller renders `PathButtons` and passes a style
- **THEN** the rendered wrapper carries both the component's own compiled
  style and the caller's, with the caller's applied after it

#### Scenario: The default wrapper needs no caller-supplied style

- **WHEN** a caller renders `PathButtons` with no style prop
- **THEN** the wrapper renders with `form-ui`'s own default layout, exactly
  as it did before this change

#### Scenario: The button's shared control class stays literal

- **WHEN** `PathButtons` renders a submit button
- **THEN** the button element carries the same literal control className it
  carried before this change, unaffected by the new style prop
