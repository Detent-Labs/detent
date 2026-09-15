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
That sheet SHALL stay under about 150 lines. Every other style SHALL be a
component style, once its phase migrates it.

The sheet carries four such survivors: the shell's own flex frame (`.shell`,
`.shell > *`), one `prefers-reduced-motion` block covering every screen, and
`.studio-dialog::backdrop`. No area keeps its own copy of any of these; no
area stylesheet exists to hold one.

An element default SHALL cover a UA border no component style reaches. The
`fieldset` rule is one. Two components mount a `<fieldset>` that takes no
compiled style, so no component style clears its UA border.

#### Scenario: A reset rule lives in the global sheet

- **WHEN** a contributor looks for the universal `box-sizing` rule
- **THEN** it is in the global stylesheet and nowhere else

#### Scenario: A dialog's backdrop keeps its one literal rule

- **WHEN** any area opens a `<dialog>` composing the literal `studio-dialog`
  class
- **THEN** its `::backdrop` renders the global stylesheet's rule, since no
  compiled style can target a pseudo-element outside the DOM tree

#### Scenario: A fieldset has no UA bevel

- **WHEN** any area mounts a `<fieldset>`
- **THEN** it draws no border, unless its own style object declares one

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

### Requirement: The advisory tone reads its own role

The shell's token sheet SHALL declare an advisory role, and the token module
SHALL alias it like every other role. In the light scheme the role SHALL
resolve to `#e25a40`. In the dark scheme it SHALL resolve to `#ff9783`. Each
value SHALL clear WCAG 1.4.11's 3:1 non-text minimum against its own scheme's
page ground. It SHALL clear the same minimum against that scheme's muted
surface.

The advisory tone draws four marks. Two are a warning callout's rule and an
empty form card's border. The other two are the dashed boxes of an incomplete
condition and an unresolved migration mapping. Each of the four SHALL read the
advisory role.

A warning callout sets refusal text beside a 3px rule, next to the value it
warns about. This requirement exempts three refusal rules, which
`docs/decisions.md` records as open: the step page's 2px warning, the checks
rail's held-back group and the timers panel's refusal.

No component style in `packages/web` or `packages/form-ui` SHALL read the
accent ramp's light step. The role SHALL draw a rule or a border alone. A
stamp keeps its five tones, and none of them reads this role.

#### Scenario: The light role clears the non-text minimum

- **WHEN** the browser prefers the light color scheme
- **THEN** the advisory role resolves to `#e25a40`
- **AND** it measures at least 3:1 against the page ground
- **AND** it measures at least 3:1 against the muted surface

#### Scenario: The dark role clears the non-text minimum

- **WHEN** the browser prefers the dark color scheme
- **THEN** the advisory role resolves to `#ff9783`
- **AND** it measures at least 3:1 against the page ground
- **AND** it measures at least 3:1 against the muted surface

#### Scenario: A warning callout's rule reads the role

- **WHEN** a studio screen sets refusal text beside a 3px rule, outside the
  checks rail and the timers panel
- **THEN** the rule computes the advisory role's color, in both color schemes

#### Scenario: An incomplete condition's dashed box reads the role

- **WHEN** a condition row stands incomplete
- **THEN** its dashed border computes the advisory role's color, in both
  color schemes

#### Scenario: No component style reads the ramp's light step

- **WHEN** a contributor searches the component styles of both packages
- **THEN** none of them names the accent ramp's light step

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

### Requirement: A style object declares no property the compiler drops

The compiler emits no rule for a `border` shorthand and none for a
`background` shorthand. It reports no error and it fails no build. The four
side keys drop the same way, and so do the two logical axis keys. A style
object in `packages/web` or `packages/form-ui` SHALL declare none of the
eight.

A style SHALL use the width, style and color longhands where it means a
border. This holds on the whole box and on one edge alike. It SHALL use
`backgroundColor` where it means a fill. This holds for a plain value and for a conditional
value alike.

A test SHALL read every module under both source trees. It SHALL fail on
either key inside a style object. It SHALL name the file and the line it
found.

#### Scenario: A border shorthand fails the suite

- **WHEN** a contributor adds `border: "1px solid red"` to a style object
- **THEN** `bun test` fails
- **AND** the message names that file and that line

#### Scenario: A background shorthand fails the suite

- **WHEN** a contributor adds `background: "red"` to a style object
- **THEN** `bun test` fails
- **AND** the message names that file and that line

#### Scenario: A declared border reaches the stylesheet

- **WHEN** a component style declares a border
- **THEN** the compiled stylesheet carries a rule for it
- **AND** that rule sits on the element the component renders

### Requirement: A destructive control renders outlined in the accent

Every control carrying the literal class `.btn-destructive` SHALL also carry
`.btn-secondary`. That covers every area of `packages/web`. Which controls
carry the class stays as it stands.

Such a control SHALL render its text and its border in the accent. Its
background SHALL stay transparent at rest. It SHALL render neither filled nor
red. That treatment is the one `DESIGN.md` states. No later rule in the shared
stylesheet SHALL override it.

On hover and while pressed, the control SHALL take the secondary control's
wash. Its text and its border SHALL then read `--color-accent-on-muted`, the
accent step that clears a tinted ground. The plain accent measures under
4.5:1 on that wash. A disabled control SHALL keep the accent at the shared
disabled opacity. Keyboard focus SHALL draw the shared accent focus ring.

#### Scenario: Cancel instance shows the accent outline

- **WHEN** an operator opens a running instance
- **THEN** the Cancel instance control's computed text color and border color
  equal the accent
- **AND** its computed background is transparent

#### Scenario: Hover reads the accent step for a tinted ground

- **WHEN** the pointer rests on a destructive control
- **THEN** its text and its border read `--color-accent-on-muted`
- **AND** its background shows the secondary control's hover wash
- **AND** its text contrast against that wash is at least 4.5:1

#### Scenario: Pressing keeps the text readable

- **WHEN** the pointer holds a destructive control down
- **THEN** its text and its border read `--color-accent-on-muted`
- **AND** its text contrast against the pressed wash is at least 4.5:1

#### Scenario: A destructive control differs from the secondary one beside it

- **WHEN** the instance screen shows Cancel instance beside Refresh
- **THEN** the two controls differ in text color and in border color

#### Scenario: A disabled destructive control keeps the accent

- **WHEN** a destructive control carries the `disabled` attribute
- **THEN** it renders at the shared disabled opacity
- **AND** its text and its border stay in the accent, under the pointer as well

#### Scenario: Every destructive control carries the secondary class

- **WHEN** any element in `packages/web` carries `.btn-destructive`
- **THEN** the same element carries `.btn-secondary`

### Requirement: The authoring command turns its text to ink under the pointer

An authoring command is a studio ghost button in slate, in the mono face at
11px. Under the pointer it SHALL keep the muted surface wash, and its text
SHALL turn to ink. While pressed it SHALL keep the wash of ink at 14%, and its
text SHALL turn to ink. Against either wash its text SHALL measure at least
4.5:1, in both color schemes.

The rule SHALL hold for every authoring command. That covers a form card's
open control, the form tab strip's controls, and the change list's commands.
It also covers the form editor's move-up and move-down controls. Those
controls sit on both a placed field's card and a group card's own legend.
They also cover a placed field's own remove control. A group card's own
`Remove ({count})` control is exempt: it keeps its distinct destructive
treatment, since it performs a cascading, multi-entry removal.

A disabled authoring command SHALL take no hover or press look. Its text SHALL
stay slate under the pointer, and its ground SHALL stay transparent. It keeps
the shared disabled opacity.

#### Scenario: Hover turns the open control's text to ink

- **WHEN** the pointer rests on a form card's open control
- **THEN** its text reads ink
- **AND** its background reads the muted surface
- **AND** its text measures at least 4.5:1 against that background, in both
  color schemes

#### Scenario: Pressing keeps the strip control's text readable

- **WHEN** the pointer holds the form tab strip's add control down
- **THEN** its text reads ink
- **AND** its background reads ink at 14%
- **AND** its text measures at least 4.5:1 against that background, in both
  color schemes

#### Scenario: The change list's command follows

- **WHEN** the pointer rests on a change list's command
- **THEN** its text reads ink
- **AND** its background reads the muted surface

#### Scenario: A disabled command takes no hover look

- **WHEN** the pointer rests on a disabled move control in the form tab strip
- **THEN** its text stays slate
- **AND** its background stays transparent

#### Scenario: A placed field's move and remove controls follow

- **WHEN** the pointer rests on a placed field's move-up, move-down or
  remove control in the form editor
- **THEN** its text reads ink
- **AND** its background reads the muted surface
- **AND** its text measures at least 4.5:1 against that background, in both
  color schemes

#### Scenario: A group card's own move controls follow

- **WHEN** the pointer rests on a group card's own move-up or move-down
  control, in its legend
- **THEN** its text reads ink
- **AND** its background reads the muted surface

#### Scenario: A group card's own remove control is exempt

- **WHEN** the pointer rests on a group card's own `Remove ({count})`
  control
- **THEN** it keeps its `.btn.btn-secondary.btn-destructive` look
- **AND** it does not take the authoring-command style
