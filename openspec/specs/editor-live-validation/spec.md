# editor-live-validation

## Purpose

Defines continuous Draft validation against the engine's unmodified
publish-time validators, with located issues mapped onto owning entities
and an explicit "not checked" state for externally-scoped checks.

## Requirements

### Requirement: Validation runs on every Draft change using the engine's publish-time validators
The editor SHALL re-validate the Draft on every change, using the same
validators the engine applies at publish time and no others: the Zod
refinements/`superRefine` in `authoredProcessBody`, `validateProcessBody`
(CEL), `checkActionRegistry`, and `validateDurations`. The editor SHALL
NOT implement a second, independent rule set for any invariant these
validators already cover.

#### Scenario: Editing a step triggers revalidation
- **WHEN** an author edits any step, path, field, timer, or action in the
  Draft
- **THEN** the editor re-runs the full validator set against the current
  Draft state before the author's next edit

#### Scenario: A CEL type error surfaces from the same checker the engine uses
- **WHEN** an author writes a guard expression that fails
  `validateProcessBody`'s type-check (e.g. comparing a field's numeric
  type without the CEL `double` literal)
- **THEN** the editor reports the same located `CelIssue` `validateProcessBody`
  would produce at publish time

### Requirement: Located issues map onto the entity that produced them
Every issue the validators return SHALL be normalized into a common
`EditorIssue` shape carrying the entity type and id it belongs to, and
SHALL be displayed on that entity's panel.

#### Scenario: A duration error highlights its timer
- **WHEN** `validateDurations` rejects a timer's `duration` value
- **THEN** the issue is displayed on that specific timer's entry in the
  timers panel, not as an undifferentiated global error

#### Scenario: A registry config error highlights its action
- **WHEN** `checkActionRegistry` rejects an action's `config` against its
  handler's declared `configSchema`
- **THEN** the issue is displayed on that action's entry in whichever
  panel authored it (step onEntry/onExit/onCancel, a path's onPath, or a
  timer's onFire)

### Requirement: Externally-scoped checks render as not-checked, never as a false pass
Checks that require state the editor does not have loaded — cross-process
validation against a subprocess's child definition, or action-registry
resolution against an injected `Registry` — SHALL be displayed as
"not checked" when that state is unavailable, and SHALL NOT be displayed
as passing.

#### Scenario: No registry injected
- **WHEN** the editor has no `Registry` loaded and the Draft contains
  actions
- **THEN** the action-registry validation section shows a "not checked"
  state for every action, not a green/passing indicator

#### Scenario: Subprocess child definition not loaded
- **WHEN** a Draft contains a subprocess step referencing a child process
  that has not been loaded into the editor
- **THEN** cross-process checks for that step (input/output mapping,
  `child.data` CEL references) show "not checked" rather than passing

#### Scenario: Registry becomes available mid-session
- **WHEN** an author loads a `Registry` after previously seeing
  "not checked" action issues
- **THEN** the editor re-runs `checkActionRegistry` against the loaded
  registry and updates each action's status to a real pass or fail
