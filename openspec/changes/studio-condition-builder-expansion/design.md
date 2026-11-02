# Design

## Context

See proposal.md for the motivation. The builder today holds a flat row list
with one joiner (`conditionLogic.ts`, `ConditionBuilder.tsx`). A row compares
one operand against one typed literal, or carries a raw fragment.

The reader
parses the stored CEL through `parseAst`. Nothing persists the row model. The
2026-08-04 design predicted this change: "a later grouping level changes the
reader and writer alone". The rule builder (`ruleLogic.ts`) already holds a
field-valued row, with its own model and no "or".

Three readers outside the builder share the clause words. They are the
sentence under the rows and two functions. The function `readerSentence`
reads the Read by and Asked on rows. The function `guardPhrase` reads the
Map's way out line and the form preview's note. All of them walk `summarizeCondition`. A clause change lands in every place at once.

The rule builder's `ruleSentence` shares `summarizeValue`, so a date literal
prints the same way there.

The CEL check admits an ordering comparison between two `string` operands. It admits one between a `string` operand and a string literal too. A date field stores `YYYY-MM-DD`, so lexical order is calendar order. A date-time does not: its text may carry seconds and a zone offset.

The check also admits `!("x" in actor.roles)` and `(a || b) && c`. The scope below
writes nothing the check rejects. Probed on 2026-11-02 against
`checkAgainstFields`.

The owner pre-approved every decision and takes no part. The impeccable
`shape` interview had no human to answer. This record states the brief's
assumptions in place of the interview's answers. The owner reviews the result
in the merged PR.

## Goals / Non-Goals

**Goals:**

- An author writes a grouped rule, a field-against-field rule and a date
  rule in rows, with no CEL. Examples: "A and (B or C)", "End date is after
  Start date", "the person is not a manager".
- Every stored guard the flat builder read still reads. A guard the author
  only looks at stays byte for byte.
- One reader and one writer carry the new model. The three readers outside
  the builder change through the shared clause code alone.
- The list clause reads as grammar whatever the label's number (SENTENCE-2).

**Non-Goals:**

- A group inside a group. It reads as a hand-written rule, as a raw row does.
- An emptiness check ("is empty", "has a value"). An unwritten field raises, so
  `data.x == ""` matches nothing when nobody wrote the field. The correct
  form needs `has()`. That is a later change with its own words.
- A literal list ("Status is one of Approved, Pending"). A group of "or" rows
  covers it.
- Negation of a group or of a whole condition.
- Ordering over a date-time. Its stored text may carry seconds and a zone
  offset, so lexical order is not calendar order. The CEL check offers no
  zone-normalised comparison.
- Text operators (starts with, contains a substring).
- Folding the rule builder onto the expanded condition builder. The rule
  builder keeps its own model. It is now the narrower of the two. A later
  change can fold it.
- A studio route resolving a data source's options.
- A change to `src/schema/definition.ts`. The design needs none.

## The shape brief

- **Job and audience.** A process author at one of three sites. They are the
  Steps tab's "Only if" on a way out and the field card's "Only ask this
  when". The form editor's override strip is the third. Operate mode. The author knows the
  business rule and does not know CEL.
- **Outcome.** The rule stands in rows. The sentence under the rows reads
  back what the rows say. The Developer view holds the CEL, closed.
- **Selected direction.** Layout A, indented groups. One subject at a time: a
  group is one more row, opened in place. The gutter joiner stays. The author
  types a value by default, and one command swaps it for a field.
- **Scope.** The three builder sites and the three readers. The Steps tab's
  layout, the field card and the form editor stay as they are.
- **States.** Empty, one row, a group with an unfinished row, and a group
  with three rows. A field-compared date row, a list row and its negation. A
  hand-written rule inside a group, and source that does not parse.
- **Constraints.** `DESIGN.md` tokens only. The studio catalog is English.
  Keyboard and screen reader reach every control. A removal keeps focus in
  the builder.

## Mockups

Two private artifacts, published 2026-11-02 for the owner's review after the
merge. Nothing in the repository depends on them.

- Three layouts, with the choice and the rejected options:
  https://claude.ai/artifact/9tjSE8xzdDrtULV2gu5fTa
- The chosen layout in every state, with the word table:
  https://claude.ai/artifact/4DnZVhGdmWsrg1c2h755GZ

The three layouts:

- **A. Indented groups (chosen).** Today's row list plus one row kind, the
  group. A group's head says how its rows combine. Its rows stand indented
  under a 2px left rule. A stored "A and (B or C)" reads back as one group.
- **B. Any-of blocks (rejected).** A fixed two-level shape: blocks of
  all-of rows, joined by or. "Either Sales or Marketing" costs a repeat of
  every shared row in a second block. A stored "A and (B or C)" cannot read
  back without that expansion, so a read would rewrite a guard. The sentence
  doubles.
- **C. Sentence with inline pickers (rejected).** One editable sentence
  whose every word is a control, with parentheses as chips. Dense. The chips
  are the machine value the owner asked to keep off the page. A screen
  reader hears one paragraph of controls with no row boundary.

The sentence follows the mockup on one point. A group clause with a clause after it ends in a comma, as in "either A or B, and C". A comma-free join would read as "either A, or B and C". A group clause with nothing after it takes no comma.

## Decisions

### D1. The model gains a group row and a field value

```ts
type Literal = string | number | boolean | undefined;
type RowValue = { kind: "literal"; value: Literal } | { kind: "field"; path: string };
type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "!in";
type Leaf =
  | { kind: "cmp"; operand: string; op: CmpOp; value: RowValue }
  | { kind: "raw"; src: string };
type GroupRow = { kind: "group"; joiner: "&&" | "||"; rows: Leaf[] };
type Row = Leaf | GroupRow;
interface Condition { joiner: "&&" | "||"; rows: Row[] }
```

A group holds leaves only. That is the one-level limit, in the type. The
value side is a union, as the rule builder's already is. No row can carry a
literal and a field at once.

The function `summarizeValue` takes the literal and the operand in place of a row. `ruleLogic.ts` then calls it with its own literal. The type `RowValue` replaces `ruleLogic.ts`'s `RuleValue`, which becomes an alias of it. The `!in` operator is a comparator of its own. The row's select lists it beside
"includes", and the writer and reader treat it as one form.

Alternatives: a `field?: string` beside `value`, which gives two fields for
one thing and an inconsistent state between them. A full tree, which puts no
limit in the type and draws a nested box the owner's taste rejects.

### D2. The reader

`fromCel` keeps its shape. A top-level `&&` or `||` sets the joiner. The
chain of that operator flattens on both sides. `a && (b && c)` reads as
three rows. A parenthesis around the same operator has no meaning.
Each conjunct reads as follows.

- A `&&` or `||` node of the other operator reads as a group. Its own chain
  flattens the same way. Each member reads as a leaf through the row reader.
  A member that is itself a `&&` or `||` node reads as a raw row, since a
  group holds leaves only.
- A `!_` node over an `in` node reads as a `!in` row, by the `in` rule.
- A `!_` node over a bare `bool` operand reads as `== false`, the twin of
  today's bare operand reading as `== true`.
- A comparison whose right side is no literal may read as a field value.
  The right side must be a member path naming a field or called-process operand other than the left one. That operand must have the left operand's CEL type and format. Any
  other right side leaves the node a raw row, a context operand included.
- A comparison whose operator the operand does not offer reads as a raw
  row, with its text unchanged. The reader and the operator select then never
  disagree. A text ordering and a date-time ordering read raw, and a date
  ordering reads as a row.
- Everything else reads as today.

The reader applies four normalisations. Single quotes become double. A bare
boolean becomes `== true`. A negated boolean becomes `== false`. A nested
chain of the parent's own operator flattens. Nothing else moves, and nothing
writes on read.

### D3. The writer

`toCel` writes the usable rows. A leaf is usable as today. A field value is
usable when its path names an operand. A group is usable when at least one of
its leaves is.

A group with one usable leaf writes that leaf as the leaf
would write at the group's own level. A group with two or more writes them
joined by its joiner. It takes parentheses when the condition writes more
than one part. A raw row inside a group takes parentheses when the group
writes more than one leaf. The top level already applies that rule.

- `in`: `"x" in actor.roles`, the mirrored form, as today.
- `!in`: `!("x" in actor.roles)`.
- A field value: `data.end_date > data.start_date`, the path written bare.
- A group: `data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")`.

A group whose joiner equals the condition's writes `a && (b && c)`. That
reads back as three flat rows. A new group therefore starts on the opposite
joiner of the level it joins. The author may still set both the same, and
the next read flattens it. No warning: the meaning is the same.

### D4. Completeness, holds and removals

A group with no complete leaf is incomplete. It stays visible, marked as an
unfinished row is. Its dashed border marks it; the inner row's flag says what
to do. The stored condition holds, as it does for an unfinished row.

`commitDecision` keeps its three answers. The row count it compares is the
number of leaves plus the number of groups, from a `rowCount` helper. A
removal inside a group then counts as a removal. `ConditionInput.tsx` passes
that count in place of `rows.length`.

### D5. Operators follow type and format

`operatorsFor(celType, format)`:

| Operand | Operators |
|---|---|
| `double`, `int` | is, is not, is less than, is at most, is greater than, is at least |
| `string` with `format: "date"` | is, is not, is before, is on or before, is after, is on or after |
| `string` with `format: "datetime"` | is, is not |
| `string` otherwise, `bool` | is, is not |
| `list<string>` | includes, does not include |

The four date words map onto `<`, `<=`, `>`, `>=`. The words are catalog keys of their own, picked by the operand's format. A number keeps its words.

A date-time offers no ordering. Its stored text may carry seconds and a zone, so lexical order is not its calendar order. The CEL text input stays the escape hatch for it. The
rule builder keeps calling `operatorsFor` with the type alone and gets what
it got.

### D6. The value side

A comparison row's value starts as a literal, in the editor the operand's
type already picks. Under the editor stands one authoring command. It reads
"Compare with a field instead" over a literal and "Type a value instead" over
a field. Pressing it swaps the editor and empties the value.

The field picker lists the field and called-process operands with the row's operand's CEL type and format. A date row lists date fields alone, and a person row person fields alone. The operand itself stays out. A
row on a list operand offers no command, since `in` takes a literal. A row
whose operand has no candidate offers no command either.

The date editor stays the native date input. A date in a sentence prints as a
formatted date. `2026-12-31` reads "Dec 31, 2026", through
`Intl.DateTimeFormat` in the catalog's English and in UTC. A zoneless date-time literal reads its components as UTC and prints them as written. The browser's zone never shifts them. A literal carrying a zone prints as its stored text. A stored literal the formatter cannot parse prints as its stored text too.

### D7. The clauses

| Shape | Clause |
|---|---|
| `"x" in F` | "“x” is one of F" |
| `!("x" in F)` | "“x” is not one of F" |
| a field value | the other field's label, in place of the literal |
| a date operand's `<` and `>` | "F is before V", "F is after V" |
| a date operand's `<=` and `>=` | "F is on or before V", "F is on or after V" |

| a group of one complete leaf | that leaf's clause |
| an or-group of two | "either A or B" |
| an and-group of two | "both A and B" |
| an or-group of three or more | "any of A, B or C" |
| an and-group of three or more | "all of A, B and C" |

A group's clause joins its neighbours through the condition's own join phrase, with one exception. A group clause with a clause after it joins through `condition.join.andAfterGroup`, "{left}, and {right}". Under "or" it joins through `condition.join.orAfterGroup`, "{left}, or {right}". The fold over the clauses carries a flag per clause saying whether it is a group. The rule builder passes no group, so its fold stays as it is.

A sentence that opens on a list clause keeps the value as written. The capital applies only when the first clause opens on a label or a group word. The list clause puts the value first. The
sentence then conjugates nothing against the field's label. That closes
SENTENCE-2. The row's operator select still reads "includes" and "does not
include", since a select is a control word.

`readerSentence` and `guardPhrase` get the group clauses for free. Both walk
`summarizeCondition`. `guardPhrase` counts a complete comparison leaf inside
a group as a readable row.

### D8. The builder's components

`ConditionBuilder` renders the condition. Three components stand under it.
They compose, with no boolean prop switching a mode
(`vercel-composition-patterns`, `architecture-avoid-boolean-props`):

- `ComparisonRow`: operand select, operator select, value side, the swap
  command, the incomplete flag, the remove control. Over a field value the
  flag asks for a field, and over a literal for a value. The same component
  draws a leaf at the top level and inside a group.
- `GroupRow`: the head, the indented list of `ComparisonRow` and raw rows,
  and "+ Add row to this group". The head holds the group's joiner select
  and the remove control. It leads with the gutter joiner when the group is
  not first.
- `ValueEditor`: the literal editor, as today.

On an operand switch, the row keeps its operator and value if both fit. They
fit when the new operand offers that operator and shares the old one's CEL
type, format and option set. Otherwise the switch resets both. A field value stays only when the new operand still
lists that field among its candidates, so `data.a > data.b` never becomes
`data.b > data.b`. The pure helper `retargetRow` in `conditionLogic.ts` holds
the rule.

Markup: the top `<ol>` as today. A group is one `<li>` holding a `<div>`
head and a nested `<ol>`. The nested list takes a 16px indent and a 2px left
rule in the border role. That is the note's own idiom, on the muted ground.

Each level steps one neutral role from the ground under it. A top row sits on ledger over the paper page. An inner row sits on paper over the group's ledger. The step reverses direction between light and dark, and both read as a distinct row. An incomplete group takes the dashed advisory
border an incomplete row takes. No box lifts, and no radius appears.

The group's joiner select carries the name "how the group's rows combine". It
lists "any of these" and "all of these". Inside a group the gutter prints the group's joiner as a word and no control. The head's select is the one way to set it.
Every control keeps an accessible name. The remove control on a group reads
"Remove group".

"+ Add group" adds a group with one fresh row inside. The author never faces an empty group. "+ Add row to this group" adds a row inside. Removing a group's last row removes the group; the removal counts the group and the row. All three components stay in `ConditionBuilder.tsx`. The group row's catalog keys take the prefix `condition.groupRow.`; `condition.group.*` stays the picker's headings.

Focus after a removal lands by DOM order among the remove controls, the rule
`removeFocusIndex` already states. The control now at the pressed index
takes it, else the one before it, else the add-row command. Group remove
controls carry the same marker.

### D9. The rename rewrite stays as it is

`rewriteFieldRead` rewrites every `data.<key>` read the parsed tree holds. It
reaches either side of a comparison and the inside of parentheses. A
field-valued row and a group therefore follow a key change as a literal row
does. A test proves it.

### D10. The cel-expressions delta

The builder's date operators depend on the check admitting an ordering
comparison between two `string` operands. The capability spec states it as a
requirement, with a test. A library upgrade that drops it then fails before
it reaches the builder.

## Risks / Trade-offs

- [A same-joiner group flattens on the next read] → A new group starts on
  the opposite joiner. The meaning never changes.
- [The list operator's word changes from "contains" to "includes"] → The
  spec's scenarios change with it. No stored text changes, since the word
  is a label.
- [The `Row` type change ripples into `ruleLogic.ts`] → `summarizeValue` takes the literal and the operand. The rule builder's sentence prints a date literal formatted too; its rows, operators and tests stay.
- [A field-valued row adds a second label-wide select and a group indents
  16px. STEP-1's overflow at 1280px grows] → The value picker shares
  `conditionControl`'s `maxWidth: 100%`. The browser check runs at 1280px.
- [Nested rows repeat the names field, operator and value (SENTENCE-9)] →
  The value-side picker carries the name "field to compare with". SENTENCE-9
  stays open.
- [A date literal of another shape than `YYYY-MM-DD`] → The sentence prints
  the stored text. The native input shows it empty, as today.
- [A right-side member path the picker would not offer, such as a context
  operand] → It reads as a raw row. The guard keeps its text.
- [The group head adds controls to a row list the owner wants plain] → One
  select per group. An unfinished group draws a dashed border. No box inside
  a box, and the inner list shares the row style.

## Migration Plan

No stored artifact changes shape. A condition the flat builder wrote reads
into the expanded one as the same rows. Rollback is reverting the change. A
guard the expanded builder wrote is ordinary CEL. The flat builder reads it
as rows and raw rows, and the text input reads it as text.

## Open Questions

None that would change the specs or the tasks. The deferrals stand in
Non-Goals. They are emptiness checks, a literal list, negated groups, text
operators, date-time ordering, and the rule builder's fold. The critique and
the audit added four more, recorded in `docs/decisions.md`. They are a picker
over the known roles, a row's move into a group, arithmetic rows, and a
wrong-type literal that still reads as a row.
