## Why

`Step.assignment` is optional, and a whole process can publish with every
step left unassigned. That step still works: the assignment-less floor in
`submitAndTransition` is starter-or-`system:admin`. But it has two costs
nobody sees in the studio today.

The step reaches no inbox. `scope=mine` in `listInstances` matches only a
claimed row, or an unclaimed row naming the actor among
`assignment.candidates`. An absent `assignment` satisfies neither.

Only the starter or an admin can act on the step at all. Nobody else the
author intended can reach it.

`docs/decisions.md` tracks this as "decided, not yet built." And
`openspec/specs/studio-app/spec.md` already names the warning as the
planned sibling of the shipped `"db.list"`-missing-key warning.

## What Changes

- Add a pure function, `assignmentWarning(terminal, assignment)`, in a new
  `packages/web/src/areas/studio/panels/assignmentWarningLogic.ts`. It
  returns a warning string for any non-terminal step whose `assignment` is
  absent, and `undefined` otherwise.
- Render that warning in `StepsPanel.tsx`, directly below the existing
  `PluginEnvelopeEditor` for `step.assignment?.strategy`, reusing the
  `studio-warning` CSS class `DataSourcesPanel` already defines.
- The warning stays outside the `EditorIssue`/`runValidation` pipeline. It
  never blocks or delays Publish.
- Add `bun:test` coverage for `assignmentWarning` covering a terminal step,
  a non-terminal step with an assignment, and a non-terminal step without
  one.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: adds a requirement that a non-terminal step with no
  `assignment` draws a non-blocking warning in the studio. Publishing
  still succeeds.

## Impact

- `packages/web/src/areas/studio/panels/assignmentWarningLogic.ts` (new)
- `packages/web/src/areas/studio/panels/StepsPanel.tsx` (modified: render
  the warning)
- `packages/web/test/studio-assignmentWarningLogic.test.ts` (new)
- `openspec/specs/studio-app/spec.md` (new requirement; the existing
  `db.list` requirement's forward reference changes tense once this ships)
- `docs/decisions.md` (the "publish-time warning for a step with no
  `assignment`" bullet moves out of "Decided, not yet built" once this
  ships)
- No engine, schema, or route change. No `definitionHash` input changes.
