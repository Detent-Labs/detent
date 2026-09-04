## Purpose

The styling model for `packages/web` and `packages/form-ui`. Component
styles compile from source. One global stylesheet carries what a compiler
cannot express. Every later migration phase writes its delta against these
rules.

## ADDED Requirements

### Requirement: Component styles compile from source

A component in `packages/web` or `packages/form-ui` SHALL declare its styles
as typed style objects in its own module. The build SHALL compile those
objects to a static stylesheet. The runtime SHALL inject no style.

A style that names an unknown token SHALL fail typecheck. An invalid
property, or a conditional value without a default, SHALL fail the build.
Neither SHALL reach the browser.

A migrated element SHALL carry no class name from a hand-written stylesheet,
except a literal hook the requirement below names. A component migrates one
element at a time, so an unmigrated element in the same file keeps its
class.

#### Scenario: A wrong token name fails before the browser

- **WHEN** a component style references a token the token module does not
  declare
- **THEN** `bun run typecheck` fails on that line

#### Scenario: The production bundle injects no styles

- **WHEN** a contributor inspects the production bundle
- **THEN** no script inserts a stylesheet rule or a style element
- **AND** every compiled rule sits in the stylesheet `index.html` links

### Requirement: One global stylesheet carries what the compiler cannot

The shell SHALL keep one hand-written global stylesheet for the reset, the
`:focus-visible` ring and the element defaults. The compiler has no global
selector. That sheet SHALL stay under about 60 lines. Every other style
SHALL be a component style, once its phase migrates it.

A `prefers-reduced-motion` block belongs to the area whose animation it
suppresses. Those blocks migrate with their areas, not into this sheet.

#### Scenario: A reset rule lives in the global sheet

- **WHEN** a contributor looks for the universal `box-sizing` rule
- **THEN** it is in the global stylesheet and nowhere else

### Requirement: Two class names stay literal

`canvas-node` and `panzoom-exclude` SHALL remain literal class names beside
the compiled ones. The canvas focus selector and its accessibility tests
query the first. Panzoom reads the second at runtime. Neither MAY hash.

#### Scenario: Panzoom still excludes a node

- **WHEN** a canvas node renders after its styles compile
- **THEN** its group element carries the literal class `panzoom-exclude`

### Requirement: The token module lives in form-ui

One token module in `packages/form-ui` SHALL declare the design tokens.
Its values SHALL alias the custom properties in the shell's `tokens.css`.
That file stays authoritative, and dark mode carries over unchanged. Both
packages SHALL import tokens from that module.
`packages/form-ui` SHALL NOT import from `packages/web` to reach a token.

#### Scenario: Both packages read one token module

- **WHEN** a component in either package needs the accent color
- **THEN** it imports the token from the form-ui token module

#### Scenario: Dark mode follows the stylesheet

- **WHEN** the browser prefers a dark color scheme
- **THEN** a compiled style reading an aliased token shows the dark value
  `tokens.css` declares

### Requirement: The test runner sees readable class names, not compiled ones

Under `bun test`, a style object SHALL resolve to readable class names
derived from its keys. The test runner SHALL NOT run the style compiler.
A test SHALL NOT assert on a compiled class name.

#### Scenario: A component test renders without the compiler

- **WHEN** a test renders a migrated component
- **THEN** it renders without error
- **AND** its class attribute carries names derived from the style keys

### Requirement: Layers stay off while the global sheet has unlayered rules

The build SHALL NOT wrap compiled styles in cascade layers while the global
stylesheet has unlayered rules. Layered rules lose to unlayered ones, so the
global focus ring would outrank a component's own indicator. The
`spa-accessibility` capability requires each focus target inside a canvas to
suppress that global outline. Layers would defeat that suppression.

#### Scenario: The build emits no cascade layer

- **WHEN** the build runs while `global.css` holds unlayered rules
- **THEN** no compiled rule sits inside an `@layer` block

### Requirement: The compiled stylesheet lands where the page links it

The build SHALL name the stylesheet that receives compiled rules. It SHALL
be the stylesheet `index.html` links. The build SHALL verify that a known
compiled rule is present in that file and SHALL fail otherwise.

This requirement covers the styling model's own guarantee.
`development-toolchain`'s "The frontend build compiles component styles"
describes the same assertion, from the build pipeline's side. Keep both in
step if the assertion changes.

#### Scenario: A misplaced stylesheet fails the build

- **WHEN** the compiled rules land in a lazily loaded area stylesheet
- **THEN** the build fails and names the file it checked

### Requirement: A migrated screen passes a browser probe

Each migration phase SHALL check its screens in a real browser. The probe
SHALL read computed styles from the live DOM. It SHALL confirm that a
migrated element carries compiled class names only. It SHALL confirm that
the element's key values equal the declarations the phase deleted. It SHALL
confirm that hover and focus states fire. `docs/browser-checks.md` SHALL
carry the probe.

#### Scenario: A phase closes with a probe

- **WHEN** a phase finishes migrating its screens
- **THEN** the probe passes on each of them before the change archives
