## Context

See proposal.md for the motivation. The state this design has to work with:

- `OverrideField` in `FormEditorScreen.tsx` draws each flag as a checkbox, and
  nests `BooleanOrExpressionInput` under a "Developer view" disclosure. Both
  render `checked={value === true}`.
- The strip writes through `updateRow(rowIndex, patch)`, which spreads:
  `{ ...r, ...patch }`.
- `runValidation` (`draft/validation.ts`) parses the draft with
  `authoredProcessBody.safeParse`, then runs the engine's own validators
  against the result. It adds nothing of its own today.
- `checksRail.ts` holds `CHECK_SOURCES` and `heldBackFor`. Every source there
  names an engine validator.
- `ChecksRail.tsx` prints `group.source` and `issue.message` raw. Neither goes
  through the catalog.

## Goals / Non-Goals

**Goals:**

- One module owns the three defaults, so the form editor and the field matrix
  cannot disagree about them.
- A control that shows what the engine does, on an entry carrying no key.
- A write that leaves `ProcessBody` still where the author changed nothing.
- Two findings the rail reports and no publish blocks on.

**Non-Goals:**

- The field matrix itself. That is item 17b, and it needs this module.
- Any polarity change. `visible`, `required` and `readonly` keep the JSON's own
  three words, because nobody can invert a CEL expression.
- Any schema, engine or `definitionHash` movement.
- Translated issue messages. See decision 7.

## Decisions

### 1. One module holds the primitives and the two checks

`draft/view-flags.ts` carries `FLAG_DEFAULT`, `effectiveFlag`, `setFlag`,
`gatedKeys` and `checkViewFlags`.

The alternative was two files, one for the editor primitives and one for the
checks. Both read the same three defaults. A default written in two places
drifts. Item 10's apply found that exact outcome. Two rails disagreed about one
count until `panelEntityCounts` served both.

### 2. `setFlag` returns a whole entry, not a patch

A patch cannot delete a key. `{ ...r, visible: undefined }` leaves
`"visible" in entry` true.

Every JSON boundary hides that. `formatDraftText`
(`panels/draftJsonLogic.ts`) stringifies, and `JSON.stringify` drops an
undefined value. So does the hash and so does the save. A spread that failed to
clear the key would therefore pass every view an author can read.

The deletion is what `in` can assert, and task 5.4 asserts it. A key the code
holds and no view shows is the state to keep out of the draft.

So `setFlag(entry, key, next)` returns a new `DraftViewField`, with the key
deleted on a return to the default. The form editor writes it through `setRows`,
which it already has.

### 3. The gate lives inside `setFlag`

Setting `visible` to literal `false` deletes `required` and `readonly` in the
same returned entry. That gives the rule one writer. The form editor and the
matrix therefore cannot produce a gated pair between them.

`gatedKeys(entry)` stays a render concern alone. It names which controls to
disable, and it returns nothing for a `visible` holding a CEL expression.

### 4. Both checks read a literal flag alone

A flag holding a CEL expression suppresses the finding. The engine resolves an
expression against an instance, and the studio holds none. Reporting on an
unresolved expression would guess.

### 5. The writer scan reads five sources, and two polarities

`checkViewFlags` calls a field written when any of these holds:

- Some step's view entry carries it with `visible` not literal `false` and
  `readonly` not literal `true`.
- Some `Action.output` map carries the field id as a KEY. All five action
  positions count: `onEntry`, `onExit`, `onCancel`, each path's `onPath`, and
  each timer's `onFire.actions`.
- Some subprocess step's `outputMapping` carries the field id as a KEY.
- Some field's `columnMapping` carries the field id as a VALUE. That record maps
  a column key to a target field, which is the opposite polarity of the two
  above. Reading it as a key set would find nothing and report every mapped
  field.
- This process's own `contract.inputFields` names it. A calling parent seeds
  those at spawn (`src/engine/subprocess.ts`), outside any view and outside
  `editableFieldIds`. The seed is not certain: a parent may map part of
  `inputFields`, and a raising entry drops. So this source buys a deliberate
  false negative, which is the bias the rule already takes.

The catalog walk uses `flattenDraftFields` (`draft/fields.ts`), so a
`columnMapping` on a field nested in a group counts.

### 5a. Neither rule reads a group container

`resolveFields` forces `required` and `readonly` to false for a group-typed
field. `editableFieldIds` and `requiredFieldIds` both exclude one. So neither
stopping state exists on a group row, and a finding there is the false positive
the requirement forbids.

The row is reachable. The palette carries every catalog id, so a group drags
onto a form. The strip then suppresses the span control alone for it.

The skip matches `isGroupField` (`src/runtime/api.ts`): a literal `"group"`
type, never a plugin envelope.

### 6. The view group holds back on `!zodValid` alone

`checkViewFlags` reads the Zod-parsed body and needs no compiled one. That is
the duration group's own placement, and `heldBackFor` gains one case matching
`duration`'s.

### 7. The two messages are plain English strings

`ChecksRail` prints `issue.message` raw for every entry it holds today, and each
of those comes from an engine validator in English. The studio catalog is
English-only (`studioCatalog = { en }`) and carries no substitution helper.

Two catalog-backed messages beside about two hundred raw ones would make two
issues overridable and the rest not. A reader takes that split for a rule. It
would be an accident. So the two messages form in `view-flags.ts`, the same way
the engine's do.

### 8. The issue anchors on the step, not the field

`StepsPanel.tsx:426` renders `<IssueList entityId={step.id} />`. The step
inspector is where an author opens the form editor. The field catalog panel
changes no view flag. An entry anchored on the field would land where nobody
can act on it.

The message names the field, by `key` where it has one and by id otherwise.
That is the fallback `labelFor` already takes in the form editor.

### 9. These two findings take the issues array, and three inline warnings do not

Three studio-owned warnings stay out of `EditorIssue` on purpose. They are
`assignmentWarning`, `unknownListKeyWarning` and `missingTranslationWarning`.
The rule sits in `draft/localized-text.ts`, and `studio-app`'s spec repeats it
for the assignment warning.

Each of those attaches to one control an author already has open. The control
is the right place to report, so the array would repeat it.

These two read the whole body. The second rule's answer depends on every other
step's view and on four mapping positions. No single control sees that, and the
rail does. The rail reads `validation.issues[]` alone, so these findings take
the array.

So the rule is not "a warning is never an `EditorIssue`". A finding bound to one
control stays beside that control. A finding only a whole-body scan produces
goes to the rail, and its source says whether it blocks.

## Risks / Trade-offs

- **A field written only by a migration transform reports.** A `MigrationPlan`
  is a separate artifact and no part of `ProcessBody`. The scan cannot see it.
  The finding still holds for an instance created fresh on this version, which
  never runs a transform. → Accept. The warning is right for the common case,
  and it reports rather than blocks.
- **The scan runs on every keystroke.** `runValidation` already re-parses and
  re-compiles the whole body per change. `purchase-requisition` is 22 fields
  over 13 steps. The added walk is smaller than the compile it follows. → No
  memoisation. Add one if a profile ever says so.
- **`setFlag` deletes two keys, which a checkbox does not suggest.** An author
  who hides a field loses a `required: true` they set earlier. No undo brings
  it back. → Accept. It deletes the exact pair the first check reports. Keeping
  the pair would author a finding.
- **A boolean for a CEL value would lie.** So `effectiveFlag` returns the value
  unchanged where the entry holds an expression. It fills the default in for an
  absent key alone. → The mode select reads the expression. It shows the CEL
  arm.

## Migration Plan

None. No stored data changes, no published body changes, and
`definitionHash` does not move. A draft written before this change opens
under it with no key added and no key removed.

Rollback is a revert. The two checks disappear and the checkbox returns to
`value === true`.

## Open Questions

- Does the field matrix (item 17b) draw these two findings per cell, beside the
  rail entry? The rail carries both either way, so this changes no requirement
  here and no task below. Answer it when somebody builds the matrix.
