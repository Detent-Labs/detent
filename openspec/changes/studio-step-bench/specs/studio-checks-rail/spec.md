## MODIFIED Requirements

### Requirement: The rail collapses to a one-line issue-count summary when the developer selects a step

<!-- Why: "structure surface" is the domain term for this screen, per CLAUDE.md. -->
<!-- antislop: allow synonym-rotation -->
On the structure surface the rail SHALL show its one-line summary in the
canvas ribbon's bar. It sits beside the ribbon's control. The bench stands no
column for the full rail, so the summary shows in every state of the
surface. It no longer depends on what the developer has selected.

The summary SHALL show a single count. That count totals every open entry in
`validation.issues[]`. It spans the zod, structural, CEL, registry, duration,
and view groups. A registry type-resolution issue counts toward that total.
The registry group's config-validation half stays held back in every draft
state this deployment reaches, per the held-back requirement above. That
held-back half alone SHALL NOT enter the count, and SHALL NOT decide whether
the summary reads clear.

Any of the zod, structural, CEL, registry, duration, or view groups can hold
back. That happens for want of a compiled body. When one does, the summary
SHALL show a held-back indicator instead. That indicator SHALL differ from
both a count and "no count." A held-back group has not run its checks yet; it
is not clear.

The summary SHALL NOT read as clear or passing while one of those six groups
holds back. That holding-back is for want of a compiled body. This carries
the rail's own held-back requirement into its collapsed form. The registry
group's config-validation half can hold back on its own. When it does, with
the group's type-resolution half clear, the summary SHALL NOT enter this
state.

Choosing the summary SHALL expand the same grouped list the full rail
shows. On the bench it expands in place below the ribbon's bar, as a
disclosure. It pushes the register and the configuration pane down. It
floats over nothing and casts no shadow. Choosing the summary again
collapses it.

The summary SHALL be a `<button type="button">` carrying `aria-expanded`
and `aria-controls` naming the grouped list.

The panels screen keeps its own docked summary, per the requirement that
states it.

#### Scenario: Selecting a step collapses the rail to a summary

- **WHEN** the developer selects a step on the structure surface
- **THEN** the ribbon's bar shows the one-line checks summary, and no full
  rail stands in a column

#### Scenario: The summary shows with nothing selected

- **WHEN** the developer opens the structure surface and selects nothing
- **THEN** the ribbon's bar still shows the one-line checks summary

#### Scenario: The summary counts every open issue

- **WHEN** the loaded draft carries three open issues across two groups
- **THEN** the summary shows a count of three

#### Scenario: A registry type-resolution issue enters the collapsed count

- **WHEN** the loaded draft compiles, and names an action type the registry
  response does not hold
- **THEN** the summary's count includes that registry issue
- **AND** the registry group's own config-validation half stays held back
  without changing that count

#### Scenario: A fully clear draft's summary carries no count

- **WHEN** the loaded draft passes every zod, structural, CEL, registry,
  duration, and view check
- **THEN** the summary shows no count
- **AND** it does not show a held-back indicator, even though the
  registry group's config-validation half stays held back

#### Scenario: A structurally invalid draft's summary shows held back, not clear

- **WHEN** the loaded draft is not Zod-valid, so every one of those six
  groups holds back
- **THEN** the summary shows a held-back indicator
- **AND** it does not show "no count"

#### Scenario: Choosing the summary expands the full grouped list

- **WHEN** the developer chooses the summary in the ribbon bar
- **THEN** the grouped list expands below the bar, and the register and
  the configuration pane move down to make room

#### Scenario: Choosing the summary again collapses the list

- **WHEN** the grouped list shows and the developer chooses the summary
  again
- **THEN** the list collapses, and the bench returns to its height

#### Scenario: Selecting several steps keeps the docked summary

- **WHEN** the developer selects more than one step
- **THEN** the configuration pane shows the selection count and its delete
  control
- **AND** the ribbon's bar still shows the one-line checks summary
