## MODIFIED Requirements

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

`.btn` and `.app-back` are this migration's terminal case. No further
phase exists to convert their last remaining consumer. Both SHALL
stay literal in `tokens.css` permanently, not merely until some future
phase.

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

#### Scenario: The button family stays literal with no further phase to close it

- **WHEN** a contributor looks for a compiled style backing a `.btn` or
  `.app-back` call site
- **THEN** none exists; the rule lives in `tokens.css`, unhashed, and
  every call site across every area still composes the literal class
