## Why

`writtenFieldCounts` (`packages/web/src/areas/studio/draft/view-flags.ts`)
already tells the studio whether a field has a structural writer. Nothing
tells it whether a field should ever be directly editable at all.

Live testing on `detent.org` found `result` on `loan_application`
placeable as `required: true` on an earlier step's form. Only the `check`
step's `subprocess.outputMapping` writes `result`. The `required`/
`readonly` gate (`gate-required-readonly-conflict`) correctly stays off,
because something does write the field.

The entry still means nothing: no participant can ever supply it. A
first-class technical marker lets the studio and the engine both refuse
that shape. It stops an author from discovering the gap in production.
(ROADMAP stage 44.)

## What Changes

- Add `FieldDef.technical?: boolean` to the definition contract. No
  existing body declares it. `technical: false` parses like absence.
  `definitionHash` stays unmoved for every stored body.
- The engine resolves a technical field as `readonly: true, required: false`
  on every step. This holds whatever the step's view entry says.
  `resolveFields` already forces those same two values for a group field.
- Publish rejects two shapes. This is **BREAKING** only for a body that
  declares `technical: true` and also violates one of them. No existing
  body can: none declares the key today.
  - a view entry naming a technical field that carries `required` or
    `readonly` at all, literal or CEL;
  - `technical: true` on a `type: "group"` field.
- Field catalog: a Technical checkbox on the Field tab, disabled for a
  group field.
- Form editor per-step strip stops offering Required/Read-only for a
  technical field.
- Field matrix marks technical rows and excludes them from
  `rowLiveTargets`/`columnLiveTargets`. A bulk toggle can no longer write
  the now-forbidden keys.
- Checks rail reports a technical field that no structural writer touches
  and that carries no `default`. This finding is non-blocking, the inverse
  of the publish-blocking rule above.
- `docs/authoring-guide.md` and `.claude/rules/process-contract.md` gain
  the new key.

Deferred, not part of this change: inferring "technical" from usage.
`EditorIssue` has no dismissal mechanism yet. Inference would also create
a second authority for one fact.

Also deferred: step-order/reachability-aware validation, a separate and
costlier analysis the same roadmap entry raised.

## Capabilities

### New Capabilities

(none. This change extends existing capabilities only.)

### Modified Capabilities

- `definition-contract`: `FieldDef` gains `technical?: boolean`. Publish
  rejects a technical field's view entry carrying `required`/`readonly`,
  and rejects `technical: true` on a group field.
- `runtime-api`: `resolveFields` forces `readonly: true, required: false`
  for a technical field. A submission naming one returns the existing
  `readonly-field` issue.
- `studio-form-editor`: the per-step strip omits Required/Read-only
  controls for a technical field.
- `studio-app`: the field catalog gains the Technical checkbox. The field
  matrix marks technical rows and excludes them from bulk
  required/readonly targets.
- `studio-checks-rail`: a new non-blocking finding for an unwritten,
  default-less technical field.

## Impact

- `src/schema/definition.ts` (`FieldDef` type + `fieldDef` Zod schema).
- `src/schema/compile.ts` (new `checkTechnicalFields`, beside
  `checkViewFieldPatterns`).
- `src/runtime/api.ts` (`resolveFields`).
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`.
- `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`,
  `FieldMatrixGrid.tsx`, `fieldMatrixLogic.ts`.
- `packages/web/src/areas/studio/draft/view-flags.ts` (or a sibling) for
  the inverse checks-rail finding.
- Form editor per-step strip (studio canvas inspector).
- `docs/authoring-guide.md`, `.claude/rules/process-contract.md`,
  `ROADMAP.md` stage 44.
- No change to `packages/form-ui`. A technical field resolves as an
  ordinary read-only field to the participant-facing renderer.
