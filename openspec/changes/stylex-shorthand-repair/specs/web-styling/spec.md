## ADDED Requirements

### Requirement: A style object declares no property the compiler drops

The compiler emits no rule for a `border` shorthand and none for a
`background` shorthand. It reports no error and it fails no build. A style
object in `packages/web` or `packages/form-ui` SHALL therefore declare
neither key.

A style SHALL use `borderWidth`, `borderStyle` and `borderColor` where it
means a border. It SHALL use `backgroundColor` where it means a fill. This
holds for a plain value and for a conditional value alike.

A test SHALL read every module under both source trees. It SHALL fail on
either key inside a style object. It SHALL name the file and the line it
found.

#### Scenario: A border shorthand fails the suite

- **WHEN** a contributor adds `border: "1px solid red"` to a style object
- **THEN** `bun test` fails
- **AND** the failure names that file and that line

#### Scenario: A background shorthand fails the suite

- **WHEN** a contributor adds `background: "red"` to a style object
- **THEN** `bun test` fails
- **AND** the failure names that file and that line

#### Scenario: A declared border reaches the stylesheet

- **WHEN** a component style declares a border
- **THEN** the compiled stylesheet carries a rule for it
- **AND** that rule sits on the element the component renders

## MODIFIED Requirements

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

#### Scenario: A fieldset carries no UA bevel

- **WHEN** any area mounts a `<fieldset>`
- **THEN** it draws no border, unless its own style object declares one
