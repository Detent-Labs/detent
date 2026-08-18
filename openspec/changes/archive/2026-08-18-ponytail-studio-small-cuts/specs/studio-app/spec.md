## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: Studio's testable logic is extracted from its components

Following `packages/web/src/areas/app/screens/inboxLogic.ts`, the logic
worth testing SHALL live in pure modules with `bun:test` coverage. At
minimum, that covers two things. It covers the process-list row
derivation, which merges the process listing with the draft listing. It
covers the save/conflict state machine too. React components themselves
carry no test requirement.

Extraction into its own module earns its keep on branching or
state-machine complexity, or on guarding a documented regression class.
Caller count alone does not settle it. Neither does a component's own
resistance to `renderToStaticMarkup`. A single expression with no
independent complexity, and one caller, SHALL inline at its call site
instead. That holds even where inlining costs the expression's own narrow
test file. The expression was never the part a test could not already
read.

<!-- This scenario's title is the existing spec's exact wording. A
     MODIFIED block must reproduce it unchanged for `openspec validate` to
     accept the delta. -->
<!-- antislop: allow passive-voice -->
#### Scenario: Row derivation is tested without a DOM

- **WHEN** a test hands the process-list derivation a process listing and
  a draft listing
- **THEN** it returns the merged rows, and the test needs no rendering

#### Scenario: A one-caller expression with no further decision inlines instead of extracting

- **WHEN** a piece of studio logic has exactly one caller
- **AND** it carries no branch feeding further decision logic, and no state
  machine
- **AND** it guards no documented regression
- **THEN** it lives inline at its call site, not in its own pure module
  with its own test file

#### Scenario: A one-caller expression that guards a regression class stays extracted

- **WHEN** a piece of studio logic has exactly one caller
- **AND** it carries a real branch and a test suite guarding a documented
  wiring bug
- **AND** that bug is the same shape `draftToolbarState.ts` guards in its
  save/reload state machine
- **THEN** it stays in its own pure module, since caller count alone does
  not settle whether extraction earns its keep
