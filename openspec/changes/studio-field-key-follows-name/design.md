# Design

## Context

See proposal.md for the motivation. The key rule lives in four files today,
all under `packages/web/src/areas/studio/`.

- `draft/key-readers.ts` holds `keyReader`, a test of one CEL source against
  a set of keys, and `countKeyReaders`, a walk over the whole draft. The walk
  treats any object with `lang: "cel"` and a string `src` as an expression.
  Source that does not parse falls back to a text match.
- `panels/fieldCatalogLogic.ts` holds `nextFieldKey`, `isFieldKeyLocked`,
  `labelChangePatch`, `keyInputStep` and `keyNoticeFor`. The lock holds
  while an expression reads the key or the base version holds the field.
- `draft/fieldLabel.ts::writeFieldLabel` is the one label write the form
  editor and the Fields tab share. A group goes through
  `view-group-sync.ts::writeGroupLabel` and `writeGroupKey`.
- `panels/FieldCatalogPanel.tsx::FieldEditor` draws the label, the key input
  in plain sight and the reader notice. The Fields tab's label control writes
  through `labelChangePatch` and `onChange`. It skips `writeFieldLabel`.

`draft/store.tsx`'s `mutate` dispatches a recipe to a reducer. A recipe's
return value never reaches the caller. A count the UI shows must therefore
come from the draft before the write.

The parser in `@marcbachmann/cel-js` gives every node `start` and `end`
offsets. A member read `{op: ".", args: [{op: "id", args: "data"}, "amount"]}`
ends where its name ends. A probe on 2026-11-01 confirmed this for five
shapes. They are `data . amount`, `has(data.amount)`, a map value, a macro
and `data.amount.size()`. `memberPath` in `panels/shared/conditionLogic.ts`
already reads the same shape.

## Shape brief (`/impeccable shape`, the Fields tab field editor)

The brief ran with stated assumptions and no interview. The owner
pre-approved every decision for stage 64 and asked for none.

1. **Job and audience.** A process author renames a field on the Fields
   tab. Often the conditions that read it already exist. Mode: Operate.
   They want the rename to land once, everywhere, and to see that it did.
2. **Outcome and proof.** A rename moves every reader with it, and one
   sentence says how many. Proof: the guard
   `data.amount > 1000.0` on "Approve → Book" survives a rename of
   "Amount" to "Total amount". The rewrite line reads "Updated 1 condition."
   The "Read by" zone lists "On Review: way out Approve → Book" with "Total
   amount is greater than 1,000."
3. **Selected direction.** The established register world (`DESIGN.md`).
   Thesis: the name is the field's identity, and the key follows quietly
   behind a Developer view. The rewrite line is ink in the written face, the
   way a success confirmation prints. "Read by" mirrors "Used in", with a
   hairline between entries, flush left. The place comes first, and the
   sentence stands under it in the muted role.
4. **Scope and boundaries.** One field editor, two zones touched: "What this
   field asks" and the effect half. Untouched: the kind picker, the options,
   the default, the validation, the form editor's layout, and the group
   children zone. Anti-goals: no new token and no motion. No reader row
   gets a jump control, since change 11 owns the field card. No confirm
   dialog stands before a rename.
5. **States and ranges.** Zero to about twenty readers on one field. A place
   runs up to about 80 characters with a long step label, and a sentence up
   to two lines. German runs 40% longer. The reader states are none, one,
   many, and one that does not parse. A published version holds the field
   or does not. The base version can still load, and a key commit can fail.
6. **Interaction and layout.** The label row stays first. The rewrite line
   sits right under it, in a polite live region. It reads next to the name
   the author just typed.

   The Developer view follows the description, closed on open. It holds the
   key input and the sentence on where the key comes from. A failed commit
   adds a refusal at the input. The refusal uses the warning callout and
   `aria-invalid`, and the input names it through `aria-describedby`.
   "Read by" stands under "Used in" as a list, two lines per entry.
7. **Constraints.** Every string comes from the studio catalog, one key per
   sentence. The key input keeps `spellCheck={false}` and adds
   `autoComplete="off"` and `translate="no"`, per `web-design-guidelines`.
   Counts print as numerals.

## Goals / Non-Goals

**Goals:**

- One rewrite function for every key change, label-driven or committed.
- A pure planning step that answers the new key and the count before the
  write. The UI then says what the write touched.
- Readers listed with places the author recognizes.

**Non-Goals:**

- Rewriting a string literal compared with the field (`FIELDS-26` stays
  open).
- Rewriting an index read `data["amount"]`. The reader count skips it too.
- A key change in the form editor that shows the rewrite line. The form
  editor rewrites through the shared write and shows nothing yet.
- Process, step and way-out keys. No CEL reads them.

## Decisions

### 1. The rewrite lives beside the reader test

`draft/key-readers.ts` gains four functions.

- `rewriteFieldRead(src, from, to): string`. It parses with `parseAst`,
  walks every node the way `holdsPath` does, and collects each member node
  over `id data` named `from`. It checks that `src.slice(end - from.length,
  end)` equals `from` and replaces that slice. Replacements run from the
  last offset to the first, so earlier offsets stay valid. A slice that
  fails the check stays as it is and does not count.

  Unparseable source takes the pattern `keyReader` builds, compiled anew
  with a global flag inside the function. The patterns in `keyReader` stay
  non-global. A shared global regex carries `lastIndex` between calls.
- `keyReaderSites(draft, key): { path: (string | number)[]; src: string }[]`.
  The same walk as `countKeyReaders`, recording the JSON path of each
  expression. `countKeyReaders` becomes `keyReaderSites(...).length`.
- `rewriteKeyReaders(draft, fieldId, from, to): number`. It runs inside a
  `mutate` recipe, writes each reading expression's `src` in place and
  returns the count. The field id tells it which field is moving, so the
  shared-key check ignores that field.
- `readKeys(draft): Set<string>`. Every name read as `data.<name>` anywhere
  in the draft, by the tree, and by the regex for unparseable source.

`rewriteKeyReaders` returns 0 and writes nothing while a field other than
`fieldId` carries `from`, before or after the key moves. The readers may belong to that field (`studio-app`: "A shared old
key keeps its readers"). It also returns 0 and writes nothing while a field
other than `fieldId` carries `to`. Such a move would merge two fields'
readers. `rewriteFieldRead` answers `src` unchanged for an empty `to`.

Alternative: a text replace over all sources. Rejected: it rewrites string
literals and `child.data.amount`, which the reader count does not count.

### 2. A plan, then a write

`panels/fieldCatalogLogic.ts` keeps the decisions pure.

- `isFieldKeyLocked(field, published)` drops its `draft` argument and the
  reader clause. A `group` stays outside.
- `takenFieldKeys(draft, exceptId?, group = false)` answers the taken set
  for derivation. A mint passes no id and states `group` itself.
  It holds three parts:
  - every other field's non-empty key;
  - each key `readKeys(draft)` answers that no field carries;
  - the CEL literal words `in`, `true`, `false` and `null`.

  The list names the four words. A parse test would flag the empty key
  too. The last two parts apply to a field that is not a `group`. The form editor's
  mint (`FormEditorScreen.tsx::mintAndPlace`) uses the same set.
- `labelChangePatch` returns `{ label, key? }` as today, with the new lock
  and taken set. A derived empty key keeps the current key while
  `countKeyReaders(draft, current) > 0`. A prior label that derives no key
  matches the current key in `nextFieldKey`. Two conditions bind it: an
  expression reads that key, and the new base label derives a non-empty
  key.
- `keyCommitProblem(draft, field, typed)` answers `"empty"`, `"grammar"`,
  `"literal"`, `"taken"` or `undefined`. The grammar is
  `/^[a-z_][a-z0-9_]*$/`, the same one `compile.ts::checkFieldKeyFormat`
  enforces. Here `taken` reads other fields' keys only.

  A commit onto a key only an expression reads binds those readers on
  purpose. It repairs a dangling guard. A `group` answers `undefined`
  always. Its key keeps the group rule in `studio-app`.
- `keyFollowsLabel(draft, field)` answers whether the key is empty or reads
  as the label's derivation, deduped or suffixed. The Developer view's
  sentence reads it.

`draft/fieldKey.ts` (new) holds `writeFieldKey(d, fieldId, next)`. A group
goes to `writeGroupKey`. Any other field takes the key and
`rewriteKeyReaders(d, fieldId, old, next)`, when `old` is non-empty. Both changes
land in one recipe, so one draft write and one dirty mark cover them.

`writeFieldLabel` computes the patch, assigns it, and calls
`rewriteKeyReaders` when the key moved. The Fields tab's label control
switches from `onChange(labelChangePatch(...))` to
`mutate((d) => writeFieldLabel(...))`, so both screens share one path. It
still bumps the definition-write counter.

The UI count comes from the draft before the write. `FieldEditor` computes
the patch with `labelChangePatch` on the current draft. When the key moves,
the count is `countKeyRewrites(draft, fieldId, oldKey, newKey)`. It shares
one plan, `rewritePlan`, with `rewriteKeyReaders`, so the count equals the
write. It answers 0 while another field carries the old or the new key.

A key commit counts the same way. Tests drive both writes through the panel's
exported seams, `commitKeyInput` and `writeLabelFromCatalog`. A commit can bind readers
from a dangling key, and the count leaves those out, since nothing rewrote
them. The key commit bumps the definition-write counter too, as `onWrite`
does for a group.

Alternative: a store that returns recipe results. Rejected: it changes
`Mutate` for every caller to serve one.

### 3. The rewrite line is component state

`FieldEditor` holds `{ count: number | undefined; write: number }`. A write
that rewrote at least one expression sets the count and adds 1 to `write`
(`nextRewriteLine`). A write that rewrote none leaves both.
`FieldEditor` mounts once per field id (`key={field.id}`), so opening
another field clears it. The line renders inside an always-present
`<p role="status" aria-live="polite">`. The region exists before its text
does, so a screen reader announces the first count.

The text sits in a `<span>` keyed on `write`. Each rewrite replaces that
text node, so a second rewrite with the same count announces too. The line
takes `space.s2` below it, so it reads with the label above and not as the
description's caption.

### 4. "Read by" rows come from reader sites

`draft/key-readers.ts` answers sites. A new `panels/readByRows.ts` turns
each site into `{ place: string; sentence?: string }`. It classifies the
JSON path:

| Path | Place key |
|---|---|
| `workflow.steps[i].paths[j].guard` | `readBy.wayOut` |
| `workflow.steps[i].view.fields[k].visible`, a note | `readBy.noteShown` |
| `workflow.steps[i].view.fields[k].visible`, a field | `readBy.asked` |
| `…view.fields[k].required` | `readBy.required` |
| `…view.fields[k].readonly` | `readBy.readonly` |
| `…view.fields[k].validation.rule` | `readBy.stepRule` |
| `fields[i](.fields[j])*.validation.rule`, from the root | `readBy.fieldRule` |
| `fields[i](.fields[j])*.default`, from the root | `readBy.default` |
| `workflow.steps[i].timers[t].deadline` | `readBy.timeLimit` |
| `workflow.steps[i].subprocess.inputMapping.*` | `readBy.childIn` |
| `workflow.steps[i].subprocess.outputMapping.*` | `readBy.childOut` |
| anything else under `workflow.steps[i]` | `readBy.otherOnStep` |
| anything else | `readBy.other` |

Patterns anchor at the body's root, so a step's own rule never matches the
field-rule row. A note is a view entry with `kind: "note"`. A way out reads
its heading through `optionText.ts::wayOutHeading`, the
function the step page uses. A step reads `stepText`. A field reads its
label at the content locale, else the base locale, else "(unnamed field)".
A view entry names its field by `ref`.

The seven condition places add a sentence. They are a way out, a note,
asked, required, read-only, and the two rules.

`conditionLogic.ts` gains `readerSentence(src, operands)`. It calls `fromCel` and `summarizeCondition(..., "phrase")`, then capitalizes
and adds the period through the `condition.sentence` key. No clause, or no
parse, reads `condition.readerRaw`, "A hand-written rule." The operands come
from `buildOperands({ fields, locale, baseLocale })`. A guard on a
subprocess step reads `child.outcome` as a raw row, which reads as the
hand-written phrase. That is the honest reading without the child's
contract, which the Fields tab does not load.

The zone memoizes rows on `[draft, field.key, contentLocale]`.

### 5. The key input moves into a Developer view

The `<details>` takes the look of the condition input's Developer view
(`shared/ConditionInput.tsx`'s `developer` and `developerSummary`). Its
`studioDevview` and `studioDevviewSummary` styles copy those values: a
hairline above, and an 11px uppercase tracked summary in the written face.
The plugin-type Developer view uses the same two styles. The summary reads
`fieldCatalog.developerView`.

The Developer view sits after the description, in "What this field asks".
The input keeps its blur and Enter commit. `keyInputStep` gains an `escape`
event, which clears the typed text. A commit first asks `keyCommitProblem`.
A problem keeps the typed text and shows its sentence under the input, in
the warning callout, with `aria-invalid="true"`. The sentence carries
`role="alert"`, so a blur commit announces it after focus has left.

The next keystroke clears the refusal. The taken refusal names the other
field through `keyHolderName`. That name is the field's label at the content
locale, else at the base locale, else "(unnamed field)". The commit fixes
the sentence, so it names the field that held the key then.

The notice keys change. The two reader keys go: `fieldCatalog.keyReadByOne`
and `keyReadByMany`. The key `fieldCatalog.keyPublished` stays. The key
`fieldCatalog.keyFollows` is new.
`keyNoticeFor(key, published, follows)` takes `published: boolean |
undefined`, where `undefined` means the base version has not loaded. It
answers `keyPublished`, `keyFollows` or `keyByHand`. It answers `undefined`
for an empty key and while the base version loads.

The notice prints as a plain muted note (`studioNote`), with no advisory
rule. Only a refusal takes the warning callout.

A check on the key stands in "What this field asks", per the zone rule in
`studio-app`. While one stands,
the Developer view opens, so the check stands beside its control. A
plugin-typed field keeps its second Developer view in "What kind of field".

### 6. Catalog strings

| Key | Text |
|---|---|
| `fieldCatalog.keyFollows` | The key follows the label until the first publish. |
| `fieldCatalog.keyEmpty` | Type a key, or press Escape to keep the current one. |
| `fieldCatalog.keyGrammar` | A key starts with a letter or an underscore and holds only lower-case letters, digits and underscores. |
| `fieldCatalog.keyLiteral` | Conditions read this word as a value. Pick another key. |
| `fieldCatalog.keyTaken` | {field} already uses this key. |
| `fieldCatalog.keyByHand` | The label no longer sets this key. |
| `fieldCatalog.rewroteOne` | Updated 1 condition. |
| `fieldCatalog.rewroteMany` | Updated {count} conditions. |
| `fieldCatalog.readByHeading` | Read by |
| `fieldCatalog.readByEmpty` | No condition reads this field. |
| `readBy.wayOut` | On {step}: way out {wayOut} |
| `readBy.asked` | When {step} asks for {field} |
| `readBy.required` | When {step} requires {field} |
| `readBy.readonly` | When {field} is read-only on {step} |
| `readBy.fieldRule` | The rule for {field} |
| `readBy.stepRule` | The rule for {field} on {step} |
| `readBy.default` | The default value of {field} |
| `readBy.timeLimit` | The time limit on {step} |
| `readBy.noteShown` | When {step} shows a note |
| `readBy.childIn` | Values passed to the called process on {step} |
| `readBy.childOut` | Values copied back from the called process on {step} |
| `readBy.otherOnStep` | Another rule on {step} |
| `readBy.other` | Another rule in this process |
| `condition.readerRaw` | A hand-written rule. |

The word "conditions" in the rewrite line follows the concept's wording. A
mapping value or a deadline counts there too. Most readers are conditions,
and a second word for the rest would split one sentence into two.

## Risks / Trade-offs

- [A label rewrite runs per keystroke] → It touches only the sources that
  read the key. The function `readKeys` adds a parse of every source per
  keystroke, twice: once in `FieldEditor` and once in the recipe. The
  `ponytail:` comment on `readKeys` names that ceiling, like the one on
  `countKeyReaders`.
- [A moved key drops half-built rows] → Every open builder re-reads when a
  path changes, the hidden Steps tab body included.
  Each loses its unfinished row. The spec states it.
- [A key a guard once locked follows its label again] → The next label
  change moves the key and its readers. Pre-1.0, no deployment holds such
  a draft.
- [A cleared label keeps a read key] → The key stays while a reader exists.
  The next label finds an empty prior derivation and follows again.
- [An index read stays on the old key] → The checks rail reports it as an
  unknown key, as today. It goes into `docs/decisions.md`.
- [A child's key commit strands its callers] → A parent reads
  `child.data.<key>`. The hash `contractRef` covers field ids, so the
  signature stays. A `latest-at-spawn` parent's guard then reads no
  match. The rewrite reaches only the open draft. It goes into
  `docs/decisions.md`.
- [A failed base-version fetch keeps every field locked] → `FIELDS-28` and
  `NAMES-4` stay open. This change reads the same lock state.

## Migration Plan

None. The draft format does not change. No stored data moves.

## Open Questions

None. The owner pre-approved the concept, and design.md settles each choice
the specs assume.
