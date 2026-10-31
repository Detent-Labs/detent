# Spec Delta

<!-- antislop: allow-file synonym-rotation passive-voice negation-habit -->
<!-- Why: the MODIFIED block copies the live requirement word for word, and the live file carries the same directive. -->

## MODIFIED Requirements

### Requirement: The panels screen's Paths view lists every path in the process

The Paths tab SHALL carry one row per path across the whole draft. The five
columns are source step, trigger, priority, guard and target. Their headings
SHALL read the author's words: "Source step", "How it is taken", "Tried",
"Only if" and "Leads to". A canvas draws a path as a line, and a line hides
those five values.

Rows SHALL follow the draft's own order. The steps order the rows first, and each
step's own path order orders the rows inside it.

A path with no guard SHALL read "Always", and a path with no priority SHALL
read "No order". The tab states each absence rather than leaving a blank
cell unexplained. A guard is independent of the trigger. A manual path can
carry one. That guard decides whether the participant may take the path, so
the tab SHALL carry it.

A draft with no path at all SHALL carry an empty state naming that fact, in
the words "way out".

The row derivation SHALL live in a pure module with `bun:test` coverage, the
convention `packages/web/src/areas/app/screens/inboxLogic.ts` sets. It takes the
draft's steps and returns the rows. The test needs no DOM and no rendering.

The Paths tab SHALL print the path count as its own count.

#### Scenario: Every path takes a row

- **WHEN** the author opens the Paths tab on a draft holding four steps and
  five paths
- **THEN** the tab carries five rows

#### Scenario: A row names its source step and its target step

- **WHEN** the tab carries a path's row
- **THEN** that row names the step the path leaves and the step it enters

#### Scenario: A manual path with no guard reads as carrying none

- **WHEN** a step's manual paths carry no guard and no priority
- **THEN** each of their rows reads "Always" under "Only if" and "No order"
  under "Tried"

#### Scenario: A manual path carrying a guard shows it

- **WHEN** a manual path carries a guard
- **THEN** its row carries that guard's CEL source

#### Scenario: An automatic path shows its priority and its guard source

- **WHEN** a step carries two automatic paths, one guarded
- **THEN** each row carries that path's priority
- **AND** the guarded row carries its guard's CEL source

#### Scenario: A draft with no path shows an empty state

- **WHEN** the author opens the Paths tab on a draft holding no path
- **THEN** the tab says the process has no way out yet

#### Scenario: The row derivation holds without rendering

- **WHEN** a test gives the row derivation a list of steps
- **THEN** it returns one row per path, in the draft's own order
- **AND** the test needs no DOM or canvas rendering
