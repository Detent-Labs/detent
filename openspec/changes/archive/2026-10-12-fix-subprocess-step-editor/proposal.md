# Proposal

## Why

An author cannot finish a publishable subprocess step on the step page alone. A new subprocess step has no `subprocess` spec. Choosing a process writes only `processId`, while the binding select already prints "pinned". The `inputMapping` editor offers the parent's fields as keys. The engine accepts only the child's `contract.inputFields`. So the author detours through the JSON surface.

Switching a step's kind leaves keys behind, and no control removes them. The shared mapping editor overwrites or drops rows without a word.

The 2026-10-10 audit logged five findings here: E2-3, E2-4, E2-5, E2-12 and E2-18. The studio promises no-code authoring, so each one breaks that promise.

## What Changes

- The first process choice on a subprocess step writes a whole spec (E2-4). It holds `versionBinding: "pinned"`, the process's newest version as `pinnedVersion`, and empty `inputMapping` and `outputMapping`.
- The `inputMapping` editor offers the child's `contract.inputFields` as keys (E2-3). A pinned binding reads the `pinnedVersion` body. A `latest-at-spawn` binding reads the newest version. While the read loads or fails, the editor says so, disables "+ add" and keeps every stored key.
- A kind switch that would remove keys opens a confirmation first (E2-5). The dialog names the counts and puts focus on Cancel. A switch that removes nothing happens at once.
  - Participant drops `subprocess` and `outcome`.
  - Subprocess drops `outcome`.
  - End drops `subprocess`, `paths`, `timers`, `onExit`, `onCancel` and `cancellable`.
- Clearing the outcome text field on an end step writes no `outcome` key. It used to write `""`.
- The shared mapping editor disables targets another row holds and offers no group field. It keeps a row after the author clears its CEL text (E2-12).
- The Contract tab stores a new outcome trimmed (E2-18).

No schema, definition contract or engine code moves. Every new write produces a body the existing rules accept.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-step-page`: the "Which process it calls" section writes a whole spec and reads `inputMapping` keys from the child's contract. The kind switch confirms before it removes keys.
- `field-expression-map-consolidation`: the shared editor locks taken targets, hides group fields and keeps a cleared row.
- `studio-app`: the Contract tab stores an outcome trimmed.

## Impact

- Code: `packages/web/src/areas/studio/`. That covers `SubprocessSpecEditor.tsx`, `FieldExpressionMapEditor.tsx`, `StepPage.tsx`, `ContractPanel.tsx` and `draft/performedBy.ts`. It adds a kind-switch dialog, a child-contract hook and studio catalog strings.
- `ActionListEditor` shares the mapping editor, so its output mapping gains the lock, the group filter and the kept row. Three panels mount it: `StepPage`, `PathsPanel` and `TimersPanel`.
- Docs: `docs/browser-checks.md` gets a checklist entry. The audit index in `docs/decisions.md` strikes this change.
- Specs: `studio-step-page`, `field-expression-map-consolidation` and `studio-app`. `docs/authoring-guide.md` stays as it is, since no authoring rule changes.
- Residual: the masthead still shows no path issue for a hidden section. The UI can no longer create that state. A hand-authored body shows the issue on the Checks tab.
