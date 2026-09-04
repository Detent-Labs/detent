# web-styling

## Purpose

The styling model for `packages/web` and `packages/form-ui`. Component
styles compile from source. One global stylesheet carries what a compiler
cannot express. Every later migration phase writes its delta against these
rules.

## Requirements

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

### Requirement: A DOM-attribute variant becomes a code-side style choice

A hand-written stylesheet once picked a layout via a `data-*` attribute
selector. Once migrated, the component's own code SHALL pick among named
StyleX styles instead. The component MAY still render the same `data-*`
attribute as a plain fact. A test or another consumer can read it. No
compiled or hand-written stylesheet SHALL select on it after migration.

This does not extend a component's public props. The component decides
which named style applies. It reads a value it already computes. A
caller passes nothing new to get this.

An open-ended value has no fixed small set of outcomes at the type level.
It SHALL pick its style from a typed lookup instead of a ternary chain.
The lookup's key type SHALL name the exact values the migrated stylesheet
enumerated.

A value the lookup does not name SHALL fall back to a named neutral
style. Neither a throw nor a blank result is acceptable. This preserves
the CSS cascade behavior a hand-written stylesheet already had. There, an
unmatched class-name suffix fell through to its base rule, with no color
and no error.

#### Scenario: A two-way layout switch compiles from two named styles

- **WHEN** a migrated component has a layout property with two known
  outcomes
- **THEN** the build's compiled stylesheet contains a style for each
  outcome, and the component's own code picks between them
- **AND** no rule in the compiled stylesheet names a `data-*` attribute
  selector as its key

#### Scenario: The DOM attribute survives as a plain fact, unread by any stylesheet

- **WHEN** a migrated component still renders the `data-*` attribute that
  used to drive its styling
- **THEN** the attribute's value matches what the component's own style
  choice used to select the same layout
- **AND** no compiled or hand-written rule in the bundle selects on it

#### Scenario: An open-ended value picks its style from a typed lookup

- **WHEN** a migrated component's style depends on a status or kind value
  with more than two possible outcomes
- **THEN** the component reads its style from a `Record` keyed on that
  value's known members, applied through `stylex.props`

#### Scenario: An unmapped value falls back to the neutral style

- **WHEN** the value at hand is not a key the lookup declares
- **THEN** the component applies the lookup's own named neutral style
- **AND** no error reaches the console

### Requirement: One global stylesheet carries what the compiler cannot

The shell SHALL keep one hand-written global stylesheet. It covers the
reset, the `:focus-visible` ring, and the element defaults. It also
covers every permanent literal survivor no later migration phase can
compile away. The compiler has no global selector, no universal
selector, and no `::backdrop` pseudo-element.
That sheet SHALL stay under about 120 lines. Every other style SHALL be a
component style, once its phase migrates it.

The sheet carries four such survivors: the shell's own flex frame (`.shell`,
`.shell > *`), one `prefers-reduced-motion` block covering every screen, and
`.studio-dialog::backdrop`. No area keeps its own copy of any of these; no
area stylesheet exists to hold one.

#### Scenario: A reset rule lives in the global sheet

- **WHEN** a contributor looks for the universal `box-sizing` rule
- **THEN** it is in the global stylesheet and nowhere else

#### Scenario: A dialog's backdrop keeps its one literal rule

- **WHEN** any area opens a `<dialog>` composing the literal `studio-dialog`
  class
- **THEN** its `::backdrop` renders the global stylesheet's rule, since no
  compiled style can target a pseudo-element outside the DOM tree

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

### Requirement: A shared class stays literal until its last consumer migrates

A class name with call sites across more than one migration phase SHALL
stay a literal, unhashed class name. It stays literal until the phase
that converts its last remaining consumer. An earlier phase SHALL NOT
compile a style for that class. A compiled style hashes to a
call-site-scoped class name. It produces no reusable literal selector
another, unmigrated file can reference.

A migrated element may still carry such a class alongside a newly
compiled one. It SHALL compose the two through plain string
concatenation instead. The literal class name comes first, then the
compiled style's own class name. `stylex.props` composes style objects
with each other. It does not accept a literal string as one of its
arguments.

#### Scenario: An unconverted consumer keeps working

- **WHEN** a phase migrates some, but not all, of a shared class's call
  sites
- **THEN** the class's rule stays in its stylesheet, unhashed
- **AND** every call site this phase does not touch keeps rendering with
  that rule

#### Scenario: A migrated element composes a literal class with a compiled one

- **WHEN** a migrated element still carries a deferred literal class
  alongside its own newly compiled style
- **THEN** its rendered class attribute carries both: the literal class
  name, and the compiled style's own class name

### Requirement: A phase verifies an unproven compiler feature against a real build first

A migration phase may be the first to rely on a StyleX feature no earlier
phase exercised. That phase SHALL verify the feature against a real
build, immediately after writing it. No later task in that phase SHALL
assume the feature works before that check runs.

A feature may not compile or behave as expected. It then SHALL fall back
to a literal, unhashed residual rule. That rule lives in a small residual
stylesheet, the same fallback a two-class exception already uses
elsewhere in this spec.

#### Scenario: A phase checks a first-use feature before later work depends on it

- **WHEN** a phase's design names a StyleX feature no earlier phase used
- **THEN** the task that writes it also reads the compiled output, or
  exercises the feature in a browser
- **AND** it does this before any later task in that phase assumes the
  feature works

#### Scenario: A failed feature falls back to a literal rule

- **WHEN** the check in the scenario above finds the feature does not
  compile or behave as designed
- **THEN** the affected rule becomes a literal, unhashed class instead
- **AND** no later task in that phase depends on the original mechanism
