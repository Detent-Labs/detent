# Proposal

## Why

The 2026-10-10 audit found five places where the path and condition builders write something other than what the author sees. They also fail to read back what they wrote.

An author sets path `approve` to "triggered by: a condition" and builds `amount > 1000`. Then they switch back to "a participant's choice". The guard stays in the draft, and the step page hides it. At runtime an instance with `amount = 5` shows no "approve" button.

A second case: a field's steps disagree on "Only ask this when". One press on "+ Add row" deletes every `visible` override of that field. Nothing brings them back.

## What Changes

- **E2-1.** A path's guard editor shows for both triggers. A switch to "a participant's choice" drops `priority` only, and keeps the guard. Owner ruling 2026-10-10 allows a conditional button, which is a guard on a manual path. The canvas edge and the form preview show that condition. The `studio-condition-builder` spec stops denying the guard. The `studio-app` spec already allows it.
- **E2-6.** An unfinished row writes nothing. Removing the last row of a condition the draft holds still clears it. Removing a row the author just added, when the draft holds nothing, changes nothing. The Fields tab's "Only ask this when" gains a "Clear on <steps>" command in the builder footer (owner ruling 2026-10-12). It drops `visible` from every referencing view, and its label names those steps.
- **E2-10.** The builder reads back the literals it wrote. An integer literal parses as a `bigint`, and a negative literal parses as a unary minus. Both now read as a comparison row. The builder writes valid CEL for every finite number. An `int` operand takes a safe integer only.
- **E2-14.** A boolean value select gets an empty option. A new row on a boolean operand shows it, and picking "No" fires a change.
- **E2-17.** "Add path" on the step page takes the trigger the canvas takes. That is the first sibling path's trigger, and `automatic` on a subprocess step. The canvas follows the same shared rule.

No definition contract change. No example under `examples/` uses a guarded manual path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-condition-builder`: the unfinished-row rule, read-back of integer and negative literals, and valid literal text. Also the boolean empty option, and the guard editor and canvas label for both triggers.
- `studio-app`: the Fields tab's "Only ask this when" row clears on purpose.
- `studio-canvas`: the step page's "add path" action takes the canvas trigger rule.
- `studio-form-editor`: the preview names the condition of a guarded manual path.

## Impact

- `packages/web/src/areas/studio/`: `panels/PathsPanel.tsx`, `panels/FieldCatalogPanel.tsx`, `panels/FormPreview.tsx`, `panels/shared/ConditionInput.tsx`, `ConditionBuilder.tsx`, `RuleBuilder.tsx`, `conditionLogic.ts`, `ruleLogic.ts`, `canvas/CanvasView.tsx`, `draft/createPath.ts`, and the studio catalog.
- Tests under `packages/web/test/`.
- `docs/authoring-guide.md`: one sentence on the conditional button.
- `docs/browser-checks.md`: one checklist entry.
- `docs/decisions.md`: the audit index entry gets struck.
