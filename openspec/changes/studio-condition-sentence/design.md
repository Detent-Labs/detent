# Design

## Context

See proposal.md for the motivation. Three components carry the condition
builder today, all under `packages/web/src/areas/studio/panels/shared/`.

- `ConditionInput.tsx` holds the builder state, the readout line ("Writes"
  plus the CEL in mono) and the CEL toggle. The toggle has two looks. The
  way out's site passes `toggleVariant="disclosure"` and gets a "Developer
  view" button. The field catalog passes `"link"` and gets two links,
  one to the CEL input and one back to the rows. Either way the toggle swaps the rows for the CEL
  text input.
- `ConditionBuilder.tsx` draws the rows. The joiner button prints `&&` or
  `||` in mono. The operator select prints the CEL symbols. A raw row is a
  mono text input over the fragment's source.
- `conditionLogic.ts` builds the operands and reads and writes CEL. Its
  `summarizeCondition` already turns rows into English for the canvas edge
  label and the form preview's path note. The words sit in a hardcoded
  `OP_WORDS` table, outside the catalog.

`fieldLabel` prints "Label (key)". `contextOperands` labels an entry with
its path, such as `instance.status`. `childOperands` labels the outcome
`child.outcome`. The list runs catalog, context, child.

A fourth site sits in the form editor. `BooleanOrExpressionInput` stands
inside the strip's own Developer view, and its CEL arm mounts
`ConditionInput`.

The rule builder (`RuleInput.tsx`) copies `ConditionInput`'s shape. It
keeps its own readout, and change 11 owns it. It shares `fieldOperand`, so
the label rule reaches its picker.

## Shape brief (`/impeccable shape`, condition builder)

The brief ran with stated assumptions and no interview. The owner
pre-approved every decision for stage 64 and asked for none.

1. **Job and audience.** A process author sets when a way out applies, or
   when a form asks a field. They work in the Steps tab's Ways out section
   and the Fields tab's "Only ask this when" zone. Mode: Operate. They
   build conditions in the middle of other work and check them at a glance.
2. **Outcome and proof.** The author reads back what they built in their
   own words, with no CEL on the page. Proof: a guard reading
   `data.amount > 1000.0 && data.status == "approved"` reads in words.
   The sentence names the amount, the comparison and the status's option
   label.
3. **Selected direction.** The established register world (`DESIGN.md`).
   Thesis: the rows are the controls, and the sentence is the record. The
   sentence stands as a note under the rows, in the written face and in
   ink. The 2px hairline rule runs on its left. The CEL leaves the page for
   a Developer view, a closed disclosure at the foot.
4. **Scope and boundaries.** One component family at four sites. Untouched:
   the row model, the read and write rules, the canvas edge label's
   fallback, the rule builder. Anti-goals: no grouping, no
   field-against-field, no date ordering (change 16). No new token. No
   motion.
5. **States and ranges.** Zero to about six rows. Labels run from 3 to 60
   characters. A German override can run 40% longer. The states cover
   an empty site, one complete row and several rows. They also cover an
   unfinished row over a stored condition or over nothing. A raw row and
   unparseable source close the list.
6. **Interaction and layout.** The rows come first, then "+ Add row" and
   the sentence. The clear command follows where the site has one. The
   Developer view closes the site.

   Each row reads left to right as a clause: field, operator word, value.
   The joiner sits in the row's lead as the word "and" or "or". The
   Developer view holds the CEL text input with a "CEL" caption. Typing
   there re-reads the rows above.
7. **Constraints.** The studio catalog is English only. Every sentence has
   one key with placeholders, so a translator sees the whole clause. Mono
   stays with the CEL text in the Developer view. The disclosure is a
   native `<details>`, whose summary is a button carrying its open state.

```
 Only when
 ┌──────────────────────────────────────────────────────────┐
 │ [Amount ▾] [is greater than ▾] [1000        ]          × │
 ├──────────────────────────────────────────────────────────┤
 │ and [Status ▾] [is ▾] [Approved ▾]                     × │
 └──────────────────────────────────────────────────────────┘
 + Add row
 ┃ Amount is greater than 1,000 and Status is Approved.
 ─────────────────────────────────────────────────────────────
 ▸ DEVELOPER VIEW
```

## Goals / Non-Goals

**Goals:**

- No CEL, key or CEL symbol on the page until the author opens the
  Developer view, at every condition site.
- One sentence per operator in the catalog, shared by the builder's
  sentence and the canvas edge label.
- The operand picker lists names a person reads.

**Non-Goals:**

- The rule builder's readout and toggle stay. Change 11 owns them.
- The canvas edge label keeps its CEL fallback for a raw row. Change 5
  owns the canvas.
- The child contract's outcome values print as the contract declares them.
  The child's author typed those names, and none of them is a key.
- No change to what the builder writes.

## Decisions

### D1. The sentence replaces the readout, under the rows

The sentence renders from the same `Condition` the rows show, through one
function in `conditionLogic.ts`. It covers five states:

| State | Sentence |
|---|---|
| no row, no stored source | "No condition yet: this always matches." (`condition.empty`, reworded) |
| a complete row | the clauses joined by "and" or "or", ending in a period |
| rows, none complete, a stored source | "Until you finish the new row, the condition stays: {sentence}" |
| rows, none complete, nothing stored | "Finish a row to set the condition." |
| unparseable source | the notice of D4 in place of the rows and the sentence |

The input component draws the sentence in every state. The builder
component drops its own empty-state paragraph, so the empty sentence shows
once. The builder takes a `describedBy` prop: the sentence's `useId` id.
Its rows' list carries it as `aria-describedby`. A screen reader then hears
the result when it enters the rows. A live
region would speak on every keystroke in a value input, so the sentence
takes none.

Alternative: keep the readout and add the sentence above it. Rejected: the
readout is the CEL that principle 2 sends behind the Developer view.

### D2. One clause key per operator

Each operator gets a select word (`condition.op.<name>`) and a clause
template (`condition.clause.<name>`, such as "{field} is greater than
{value}"). The joiners get `condition.join.and` ("{left} and {right}") and
`condition.join.or`. A boolean row takes the `eq` or `ne` clause with the
value word "yes" or "no", matching the value select. The list operator keeps the word
"contains", which the base spec names.

The value prints in the author's form:

- an option's label, for a closed list;
- a number through `Intl.NumberFormat("en", { maximumFractionDigits: 20 })`,
  so no digit the author typed goes;
- free text in curly quotes, “like this”;
- a date or a date-time as the stored text.

A raw row reads "a hand-written rule" in the sentence. `summarizeCondition`
takes that phrase as a choice. The canvas edge and the form preview keep
the fragment's CEL text there, as `guardEdgeLabel` does today. Both read
the same clause keys, so the edge label loses its hardcoded English.

Alternative: assemble the clause from the operand, the op word and the
value. Rejected by `design-language.md`: never assemble a sentence from
fragments.

### D3. The Developer view holds the CEL at every site

`ConditionInput` drops `toggleVariant` and the `celMode` state. It renders
the builder and the sentence always, and under them a native `<details>`
labeled "Developer view". Inside stands the CEL caption and the existing
`ExpressionInput`, editable, over the stored source. It carries
`translate="no"`.

Typing there calls `onChange` and resets `seededFrom`, as the CEL mode does
today, so the rows re-read the new text. Opening or closing the `<details>`
writes nothing, and the draft never records it. The `<details>` opens
closed, except over unparseable source (D4).

The form editor's override already stands inside the strip's Developer
view. `ConditionInput` takes `cel: "disclosure" | "inline"`, defaulting to
`"disclosure"`. `BooleanOrExpressionInput` passes `"inline"`. That draws
the same caption and input with no second disclosure. The prop is an
explicit variant and no boolean, per `vercel-composition-patterns`.

The style follows the way out's own Developer view in `PathsPanel.tsx`. A
1px hairline rule runs on top, and the summary takes 11px uppercase in
slate. The
clear command stays in the footer above the Developer view.

Alternative: keep the swap, with "Developer view" as its label at every
site. Rejected: the swap hides the rows while the CEL shows, and the author
loses the sentence that explains the text.

### D4. Source that does not parse opens the Developer view

`fromCel` returns `null`. The rows and the sentence give way to one
refusal-tone line with `role="status"`: "This condition cannot show as
rows. Fix it in the Developer view below." The `<details>` mounts open.
Once the text parses, the rows and the sentence return. The `<details>`
stays open, so the field the author types in never moves.

The open state is local `useState`, synced by `onToggle`. The re-seed
block opens it whenever its read returns `null`. That covers the mount. It
also covers a source that turns unparseable from outside: the JSON view or
another field in the same editor. A close by the author holds until the
next re-seed.

### D5. A raw row prints a sentence in place of its source

The row keeps its text in the model and writes it back unchanged. On the
page it reads "A hand-written rule. The Developer view holds its text." in
slate, with its remove control. The mono input over the fragment goes, so
the author edits a raw fragment in the Developer view's text.

### D6. Operators and the joiner read as words

The operator select prints the `condition.op.*` words. The joiner button
prints "and" or "or" in the written face and keeps its flip behavior and
its hint. The accent and the 600 weight stay, since the joiner is a
control.

### D7. Operand labels and order

- A field operand's label is its resolved label alone. A field with no
  label reads `condition.unnamedField`, "(unnamed field)".
- Two or more catalog operands sharing a label take " (2)", " (3)" in
  catalog order. The first keeps its plain label.
- The child's outcome reads "How the called process ended". A child field
  reads "{label}, from the called process".
- `instance.status` reads "The case's status", and its values read
  "running", "completed", "cancelled" and "faulted" from the catalog.
- `actor.roles` reads "The person's roles".
- `buildOperands` returns the catalog, then the child, then the case, then
  the person. The picker groups them under `<optgroup>` headings: "Fields",
  "The called process", "The case", "The person". `Operand` gains an
  optional `group` member for that. A group with no member draws no
  heading.
- The three operand builders set `group`, and `fieldOperand` sets none.
  The rule builder's operands keep their shape. Its test pins that shape
  with `toEqual`.

The context labels come from a lookup by path. A new entry in either
schema of the engine therefore still reaches the picker. A path with
no catalog entry falls back to the path itself. That is the one machine
value the picker can still print. No such path exists today.

`operandSignature` keeps reading path and type alone. A label change still
discards no unfinished row.

### D8. Catalog keys

The studio catalog, `packages/web/src/i18n/catalogs/studio.ts`, gains or
changes these keys. A placeholder stands in braces.

| Key | English |
|---|---|
| `condition.op.eq` / `.ne` | is / is not |
| `condition.op.lt` / `.le` | is less than / is at most |
| `condition.op.gt` / `.ge` | is greater than / is at least |
| `condition.op.in` | contains |
| `condition.clause.eq` / `.ne` | {field} is {value} / {field} is not {value} |
| `condition.clause.lt` / `.le` | {field} is less than {value} / {field} is at most {value} |
| `condition.clause.gt` / `.ge` | {field} is greater than {value} / {field} is at least {value} |
| `condition.clause.in` | {field} contains {value} |
| `condition.clause.raw` | a hand-written rule |
| `condition.join.and` / `.or` | {left} and {right} / {left} or {right} |
| `condition.joiner.and` / `.or` | and / or |
| `condition.sentence` | {condition}. |
| `condition.sentence.held` | Until you finish the new row, the condition stays: {condition}. |
| `condition.sentence.none` | Finish a row to set the condition. |
| `condition.empty` (reworded) | No condition yet: this always matches. |
| `condition.rawRowSentence` | A hand-written rule. The Developer view holds its text. |
| `condition.unparseableRows` | This condition cannot show as rows. Fix it in the Developer view below. |
| `condition.celCaption` | CEL |
| `condition.unnamedField` | (unnamed field) |
| `condition.duplicateLabel` | {label} ({n}) |
| `condition.operand.caseStatus` | The case's status |
| `condition.operand.personRoles` | The person's roles |
| `condition.operand.childOutcome` | How the called process ended |
| `condition.operand.childField` | {label}, from the called process |
| `condition.group.fields` / `.child` | Fields / The called process |
| `condition.group.case` / `.person` | The case / The person |
| `condition.status.running` / `.completed` | running / completed |
| `condition.status.cancelled` / `.faulted` | cancelled / faulted |

The sentence capitalizes its first letter. A raw row at the head then reads
"A hand-written rule and …".

Two keys go: `condition.editAsCel` and `condition.useBuilder`. So does
`condition.contains`, which `condition.op.in` replaces. Four keys stay for
the rule builder, which still reads them. They are `condition.rawRow`,
`condition.unparseable`, `condition.celReadout` and `condition.celEmpty`.

### D9. `toggleVariant` goes, against a refused simplification

`docs/decisions.md` refused dropping `toggleVariant` on 2026-08-16, item 12
of "Refused simplifications". The refusal held because each variant drew a
different site. This change gives every site one presentation, so the
reason lapses. Task 4.5b moves the item into `docs/decisions-archive.md`
word for word, with a line naming this change.

## Risks / Trade-offs

- **The sentence and the canvas share clause keys.** The edge label
  changes from "Approved" to "Approved is yes". It changes from "includes"
  to "contains", and it prints 1000 as 1,000. → The edge-label tests pin
  the new words. Change 5 reviews the edge wording.
- **"The person's roles contains “manager”" is not good grammar.** The
  clause cannot know whether a label is plural. → Accepted. Change 16
  revisits list phrasing.
- **A raw row loses its inline input.** → The Developer view shows the
  whole condition, one press away.
- **Duplicate labels take a count.** → "Name (2)" names no field. The
  Developer view's CEL names the key. Change 11's field card shows
  duplicate names where an author fixes them.
- **The rule builder keeps its CEL readout.** → Two builders then read
  differently on the Fields tab. `docs/decisions.md` records it for change
  11.

## Migration Plan

Nothing persists. The builder writes the same CEL as before. The open
state of a Developer view lives in the component alone. A rollback reverts
the commit.

## Open Questions

None.
