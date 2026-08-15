## Why

Open the form editor on `purchase-requisition`, step `finance_review`, field
`vendor`. The Visible checkbox reads unticked. The participant sees the field.
`BooleanOrExpressionInput.tsx:46` renders `checked={value === true}`, and that
view entry carries no `visible` key. An absent `visible` means shown, because
`resolveFlag` (`src/runtime/api.ts:441`) reads it as true. So the control lies
about what the engine does.

`required` and `readonly` draw right through the same control, by luck alone.
Their own default is false, which `value === true` also renders as unticked.

Two more states go unreported. A view entry with `visible: false` and
`required: true` drops the requirement without a word. `resolveFields` removes
the field before `requiredFieldIds` counts it. Take a second view entry, with
`readonly: true` and `required: true`. Where nothing else writes the field,
every submission raises `required-missing`. `editableFieldIds` excludes the
field, so nobody can supply the value. Both states read off `view.fields[]`
alone.

Stage 41's field matrix repeats the first defect 54 times over. It cannot see
the other two at all. This change is stage 41's first half. It ships the shared
module the matrix needs, and it pays the defect now.

## What Changes

- A new module, `packages/web/src/areas/studio/draft/view-flags.ts`. It is pure
  and it holds no React. It carries four things.
  - `FLAG_DEFAULT`, the engine's own three defaults.
  - `effectiveFlag`, which fills a default in.
  - `setFlag`, which writes a key only on a departure from the default. It
    deletes that key on return.
  - `gatedKeys`, which names the controls `visible: false` disables.
- `BooleanOrExpressionInput` takes the resolved default. An absent `visible`
  renders ticked. An absent `required` or `readonly` renders unticked.
- The form editor's three override controls write through `setFlag`. An author
  who ticks Visible on an entry with no `visible` key writes no key.
- Two new checks in the studio's own validation pass. The checks rail reports
  each one against the step that holds the view entry.
- A sixth `IssueSource`, `view`. The five that exist are all engine validators.
  Both new rules are the studio's own finding, so they need their own name.

No schema change. No engine change. `definitionHash` does not move.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-form-editor`: each override control starts at the engine's resolved
  default. Each writes its key only on a departure from that default. Turning
  `visible` off disables the other two controls and clears their keys.
- `studio-checks-rail`: the rail carries a sixth source, `view`, for the
  studio's own findings. It reports the two stopping states named above.

## Impact

Affected files. Code, inside `packages/web`:

- `src/areas/studio/draft/view-flags.ts` (new)
- `src/areas/studio/draft/issues.ts` (the sixth `IssueSource`)
- `src/areas/studio/draft/checksRail.ts` (`CHECK_SOURCES`, `heldBackFor`)
- `src/areas/studio/draft/validation.ts` (runs the two checks)
- `src/areas/studio/panels/shared/BooleanOrExpressionInput.tsx`
- `src/areas/studio/screens/FormEditorScreen.tsx`

Tests, inside `packages/web`:

- `test/studio-viewFlags.test.ts` (new)
- `test/studio-checksRail.test.ts` (the two `view`-group cases)

Documents, the only edits outside `packages/web`:

- `ROADMAP.md`, `docs/current-state.md`, `docs/browser-checks.md` and
  `tmp/open-work-priority.md`

No API change and no dependency change. No engine file moves. The two new
checks read the draft the studio already holds. No catalog key moves either.
The rail prints every message raw today, and these two form the same way. See
design.md, decision 7.
