## 1. The shared module

- [x] 1.1 Add `packages/web/src/areas/studio/draft/view-flags.ts`. It holds no
  React and imports no component.
- [x] 1.2 Export `FlagKey`, the union of `"visible"`, `"required"` and
  `"readonly"`.
- [x] 1.3 Export `FLAG_DEFAULT`, a record of the three engine defaults. Cite
  `resolveFlag` in `src/runtime/api.ts` in a comment.
- [x] 1.4 Export `effectiveFlag(value, key)`. It returns the default for an
  absent (`undefined`) value, and the value itself otherwise. A bare value
  reads the same as an entry lookup would. JS collapses an absent key and a
  key holding `undefined` into one case. So the entry-typed signature the
  design first proposed would have checked the same thing, with an extra
  parameter.
- [x] 1.5 Export `setFlag(entry, key, next)`. It returns a new entry, and it
  deletes the key on a return to the default.
- [x] 1.6 An `undefined` `next` deletes the key too. The mode select's CEL arm
  writes `undefined`, which is not `visible`'s default.
- [x] 1.7 In `setFlag`, a `visible` set to literal `false` deletes `required`
  and `readonly` from the returned entry.
- [x] 1.8 Export `gatedKeys(entry)`. It returns both other keys for a literal
  `false` `visible`, and nothing otherwise.

## 2. The two checks

- [x] 2.1 Export `checkViewFlags(body)` from the same module. It returns
  `EditorIssue[]`, each with source `"view"`.
- [x] 2.2 Anchor each entry on the step holding the view entry:
  `entityType: "step"`, `entityId: step.id`.
- [x] 2.3 Name the field in the message. Use `key` where it has one, and the
  id otherwise.
- [x] 2.4 Walk the catalog with `flattenDraftFields` from `draft/fields.ts`, so
  a nested field resolves.
- [x] 2.5 Skip any view entry whose catalog field carries the literal type
  `"group"`, before either rule reads it.
- [x] 2.6 Match `isGroupField` in `src/runtime/api.ts` for that skip. A plugin
  envelope is not a string and is not a group.
- [x] 2.7 Report a view entry with literal `visible: false` and literal
  `required: true`.
- [x] 2.8 Build the written-field set. A step's view entry counts where
  `visible` is not `false` and `readonly` is not `true`.
- [x] 2.9 Add every `Action.output` KEY to that set. Cover `onEntry`, `onExit`,
  `onCancel`, each path's `onPath` and each timer's `onFire.actions`.
- [x] 2.10 Add every subprocess step's `outputMapping` KEY to that set.
- [x] 2.11 Add every `columnMapping` VALUE to that set. That record maps a
  column key to a target field, the opposite polarity.
- [x] 2.12 Add every id in `body.contract?.inputFields` to the set. A parent
  seeds those at spawn, outside any view.
- [x] 2.13 Report a view entry with literal `readonly: true` and literal
  `required: true`, where the set holds no such field.
- [x] 2.14 Raise neither rule where a flag holds a CEL expression.

## 3. The sixth source

- [x] 3.1 Add `"view"` to `IssueSource` in `draft/issues.ts`. Comment what it
  covers, the way the `"structural"` comment already does.
- [x] 3.2 Append `"view"` to `CHECK_SOURCES` in `draft/checksRail.ts`. It goes
  last, after the five engine validators.
- [x] 3.3 Add the `"view"` case to `heldBackFor`. It holds back on `!zodValid`
  alone, matching `duration`.
- [x] 3.4 Call `checkViewFlags` from `runValidation` in `draft/validation.ts`,
  beside the `validateDurations` call.
- [x] 3.5 Confirm the Zod-invalid early return needs no change. It carries no
  issues, so the view group holds back.
- [x] 3.6 Rewrite `runValidation`'s opening paragraph. It says "no second rule
  set" today, and task 3.4 adds one.
- [x] 3.7 Name the split in that comment. The five engine sources block a
  publish, and `view` does not.
- [x] 3.8 Correct `allChecksClear`'s comment in `draft/checksRail.ts`. "An
  author can publish once this is true" now overstates the gate.

## 4. The form editor

- [x] 4.1 Give `BooleanOrExpressionInput` a required `flagKey` prop. Its
  checkbox reads `checked` from `effectiveFlag`.
- [x] 4.2 Do the same to `OverrideField`'s own checkbox in
  `screens/FormEditorScreen.tsx`. Both draw one value.
- [x] 4.3 Replace the strip's three `updateRow` calls with one `setFlag` write
  through `setRows`.
- [x] 4.4 The mode select's boolean arm writes `FLAG_DEFAULT[flagKey]`, not
  literal `false`. It writes `undefined` on the CEL arm as it does today.
- [x] 4.5 Disable a control named by `gatedKeys` on the selected row.
- [x] 4.6 Confirm the card marks still read the raw entry. A deleted key must
  draw no required mark and no readonly mark.

## 5. Tests

- [x] 5.1 Add `packages/web/test/studio-viewFlags.test.ts`.
- [x] 5.2 Assert `effectiveFlag` reads an absent `visible` as true, and an
  absent `required` as false.
- [x] 5.3 Assert `effectiveFlag` returns an expression unchanged.
- [x] 5.4 Assert `setFlag` writes `visible: false`, then deletes the key on a
  return to true. Use the `in` operator.
- [x] 5.5 Assert `setFlag` writing `visible: false` deletes `required` and
  `readonly` in the same call.
- [x] 5.6 Assert `setFlag(entry, "visible", FLAG_DEFAULT.visible)` on a CEL
  `visible` deletes the key and keeps both other keys.
- [x] 5.7 Assert `gatedKeys` returns nothing for a CEL `visible`.
- [x] 5.8 Assert `checkViewFlags` reports a hidden required field, and names
  the step and the field.
- [x] 5.9 Assert it reports an unwritable required field.
- [x] 5.10 Assert an editable view entry on another step suppresses that second
  rule.
- [x] 5.11 Assert an `Action.output` target suppresses it. Cover all five
  positions: `onEntry`, `onExit`, `onCancel`, a path's `onPath` and a timer's
  `onFire.actions`.
- [x] 5.12 Assert a subprocess `outputMapping` target suppresses it.
- [x] 5.13 Assert a `columnMapping` target suppresses it, including one on a
  nested field.
- [x] 5.14 Assert a `contract.inputFields` entry suppresses it.
- [x] 5.15 Assert a CEL flag reports nothing under either rule.
- [x] 5.16 Assert a group-typed ref with `readonly: true` and `required: true`,
  written by nothing else, reports nothing.
- [x] 5.17 Assert a group-typed ref with `visible: false` and `required: true`
  reports nothing.
- [x] 5.18 In `studio-checksRail.test.ts`, assert the `view` group holds back
  on a Zod-invalid draft.
- [x] 5.19 Assert the `view` group runs on a Zod-valid draft that fails to
  compile.

## 6. Documentation

- [x] 6.1 Record the work in `ROADMAP.md`, under stage 41, as its first half.
  Leave the grid open.
- [x] 6.2 Change stage 41's headline. "DESIGNED, NOT BUILT" becomes false, so
  take the two-half form stage 31 already uses.
- [x] 6.3 Correct the three statements in stage 41 this change falsifies: the
  `checked={value === true}` claim, the five-sources claim, and the
  belong-in-the-rail claim.
- [x] 6.4 Leave stage 41 under Open stages. `docs/roadmap-history.md` takes it
  when the grid ships.
- [x] 6.5 Add the module to `docs/current-state.md`, under the studio's draft
  layer. Name its exports and the check.
- [x] 6.6 Add the browser walk to `docs/browser-checks.md`.
- [x] 6.7 Move item 17a to `ARCHIVED` in `tmp/open-work-priority.md`, and write
  its own section there.

## 7. Verification

- [x] 7.1 `bun run typecheck`, then `bun run build`. Both exit 0. The first
  pass caught branded `FieldId` literals in `studio-viewFlags.test.ts` that
  `bun test` alone had missed. A `vf()` helper casts them at the boundary,
  the same escape hatch `baseBody` already took.
- [x] 7.2 Full `bun test` with `DATABASE_URL` set. 2641 pass, 1 skip, 0 fail.
- [x] 7.3 The antislop linter over every Markdown file this change touched. Net
  rise zero on each tracked file; the new change artifacts lint clean.
- [x] 7.4 `git diff --check` exits 0. `git ls-files --eol` shows `w/lf` on
  every touched file.
- [x] 7.5 Browser: open `purchase-requisition`, step `finance_review`, field
  `vendor`. Visible reads ticked.
- [x] 7.6 Browser: untick Visible, then tick it again. The JSON surface shows
  no `visible` key.
- [x] 7.7 Browser: untick Visible on a row carrying required. Both other
  controls disable and both keys clear.
- [x] 7.8 Browser: author each stopping state. Each reaches the rail's `view`
  group, and each clears on a fix. The unwritable-required case needed
  `finance_note`, not `vendor`: `vendor` sits in `contract.inputFields`, one
  of the five writer sources, so it can never raise that rule.
