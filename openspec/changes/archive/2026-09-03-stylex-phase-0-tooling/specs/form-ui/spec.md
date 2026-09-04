## ADDED Requirements

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

The `./form-ui.css` export SHALL remain until the renderer's own styles
migrate in a later phase.

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
