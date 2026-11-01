# Design

## Context

The step page lists steps, ways out and fields in native `<select>`
controls. Six of them print a key or an id as the option text:

| Select | File | Prints today |
|---|---|---|
| Ways out: "Leads to" | `panels/PathsPanel.tsx` | `s.key ?? s.id` |
| "Where the new way out leads" | `panels/PathsPanel.tsx` | `s.key ?? s.id` |
| Time limit: "The way out it takes when it runs out" | `panels/TimersPanel.tsx` | `p.key ?? p.id` |
| An action's output mapping | `panels/ActionListEditor.tsx` through `shared/FieldExpressionMapEditor.tsx` | `f.key ?? f.id` |
| A called process's output mapping | `panels/SubprocessSpecEditor.tsx`, same editor | `f.key ?? f.id` |
| A called process's input mapping | `panels/SubprocessSpecEditor.tsx`, same editor | the child field's `key` |

The way-out heading falls back to the target's key, then its id. A new
path's default label falls back to a step's key. Key derivation lives in
two functions. `draft/deriveKey.ts::deriveKey` serves the process, step and
field keys with `_`. `draft/createPath.ts::slugify` serves the path key
with `-`. Both drop every character outside `[a-z0-9]`, so "Prüfung"
derives `pr_fung`.

The condition builder already lists labels, with "Name (2)" for a repeated
label (`shared/conditionLogic.ts::catalogOperands`, change 4).

## Shape brief (`/impeccable shape`, run with stated assumptions)

The owner pre-approved every decision, so shape ran without an interview.
The brief marks each assumption.

1. **Job and audience.** A process author works on the Steps tab. They
   connect a step to the next one and pick the way out a time limit takes.
   They also map a result into a field. Mode: Operate. The author knows the steps by the
   names in the steps rail and has never seen a key.
2. **Outcome and proof.** Each option reads the way the rest of the page
   names the same thing. A named step reads as in the steps rail. A way out reads
   as its row heading, "Approve → Done". A field reads as on the Fields
   tab. The author picks without translating. Proof: the seeded processes
   show no key in any of the six selects.
3. **Selected direction.** The incumbent register stays. The selects keep
   their native control, chevron and caption. Only the option text
   changes. No new visual element, no chip, no secondary line inside an
   option: a native `<option>` renders text alone.
4. **Scope and boundaries.** The six selects, the way-out heading's
   fallback, the new path's default label, and key derivation. The
   migration plan form, the Fields tab's data source select and the
   canvas stay out (see Non-goals).
5. **States and ranges.** Assumption: a process holds 2 to 30 steps and a
   step 1 to 6 ways out. A label can repeat, as "Review" twice. It can be
   empty, on a step dropped on the canvas. It can run long, as a German
   label of 40 characters.

   A repeated label takes a count. An empty one
   reads "(unnamed step)". A long one stays whole. The studio select spans
   its column, and the studio cuts no option text.
6. **Interaction and layout.** No change. The option order stays the
   draft's order, the steps rail's order. The placeholder option stays
   first and disabled.
7. **Constraints.** Option text comes from the studio catalog and the
   author's own labels. A stored reference that no list holds keeps its raw
   id. The "(not in the list)" mark follows it, since nothing else names
   it.

Web interface guidelines applied: every select keeps its `<label>`. An
empty label renders a placeholder word in place of an empty option. A long
label stays whole. Composition patterns applied: the field-map editor takes a list
of labelled targets from its caller instead of new locale props.

## Goals / Non-goals

**Goals**

- Every step, way-out and field select on the step page prints labels.
- One option-text rule for a repeated label across the studio.
- Derived keys read the label: "Prüfung" derives `pruefung`.

**Non-goals**

- The migration plan form keeps its key and label choices. Its spec asks for both,
  because a migration maps instance data by key.
- The Fields tab's data source select prints `ds.key ?? ds.id`. Change 11
  owns the Sources view.
- Three places still fall back to a step's key for an unnamed step. They
  are the steps rail (`StepsRail.tsx`), the step page's Previous and Next
  labels, and the Checks narrowing label. The last two live in
  `EditScreen.tsx`. Change 10
  (`studio-step-accordion`) owns the rail and the page foot. Change 12
  (`studio-checks-by-subject`) owns the Checks label.
- The canvas node's accessible name carries the step key. Change 5 owns
  the canvas words.
- No rewrite of keys already stored. A draft keyed `pr_fung` keeps it.

## Decisions

### D1. One option-text module

A new module, `panels/shared/optionText.ts`, holds three pure functions:

- `stepText(step, contentLocale, baseLocale)`: the step's label at the
  content locale, trimmed, else "(unnamed step)" (`steps.unnamedStep`).
- `numberRepeats(items, textOf)`: the items' texts as a `string[]`, in
  list order. The second and later item sharing a text add a count,
  "Review (2)". Draft ids are optional and an operand has none. So the
  result is a list, and the caller zips it with its items. The count reads the catalog key `options.repeatedLabel`,
  "{label} ({n})".
- `wayOutHeading(path, stepTexts)`: the way out's label, else "(unnamed
  way out)". An arrow follows, then the target's numbered step text, else
  "(no step yet)". `paths.rowHeading` stays its template.

`conditionLogic.ts::catalogOperands` calls `numberRepeats` too, and the key
`condition.duplicateLabel` goes. One rule then serves the operand picker
and the selects. Alternative: a second key with the same text. Rejected:
two keys drift.

### D2. The step selects

Both step selects in `PathsPanel.tsx` list the step texts of D7 in draft
order. The way-out heading calls `wayOutHeading` with the same map. A
heading then names a step exactly as the select beside it does.

### D3. The time-limit select

`TimersPanel.tsx` lists the step's own ways out by `wayOutHeading`, then
through `numberRepeats`. It takes `steps`, `contentLocale` and `baseLocale`
as props from `StepPage.tsx`, beside the `paths` it already takes. Props
over `useDraft()`: the panel stays a pure function of its props, the way
`PathsPanel` is.

### D4. The field-map selects take labelled targets

`FieldExpressionMapEditor` takes `targets: readonly MapTarget[]` (`{ id,
label }`) in place of `fields`. `fieldExpressionMapLogic.ts` gains
`fieldTargets(fields, contentLocale, baseLocale)`. It drops a group, reads
each field's label at the content locale (else "(unnamed field)",
`condition.unnamedField`) and numbers repeats. The callers build the list:

- `ActionListEditor` and `SubprocessSpecEditor`'s output mapping pass
  `fieldTargets(fields, contentLocale, baseLocale)`. `ActionListEditor`
  takes the two locales as props from its five call sites. Three sit in
  `StepPage.tsx`, one in `PathsPanel.tsx` and one in `TimersPanel.tsx`.
  `SubprocessSpecEditor` gains a `baseLocale` prop from `StepPage.tsx`.
- The input mapping passes `refTargets(childInputs.fields)`, a second
  helper in `fieldExpressionMapLogic.ts`. It drops a ref whose `type` is
  `group`, since a contract may name one, then numbers repeats. The child's
  own base locale already resolved each ref's `label`
  (`useTargetProcessCatalog.ts::fieldsToRefs`). The list keeps the
  contract's order.

`SubprocessSpecEditor` builds the input-mapping list once. The editor's
`targets` and `childInputsNote`'s `nextUnusedTarget` call read that one
list, so the note and "+ add" agree. A stored id outside the list keeps its
option, printed as the raw id plus "(not in the list)"
(`mapping.unlistedKey`).

### D5. Transliteration before the slug

`draft/deriveKey.ts` gains `transliterate(text)`. It normalizes to NFC,
lower-cases, and maps `ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`, `æ`→`ae`,
`œ`→`oe`, `ø`→`o`, `ł`→`l`. Then it decomposes to NFD and drops every
combining mark (U+0300 to U+036F). So `é` reads `e`, and `ñ` reads `n`.
`deriveKey` and `createPath.ts::slugify` both slug its result. The German
map runs before the decomposition; otherwise `ä` would lose its mark and
read `a`.

The lock check compares a key with the prior label's derivation. Both
sides now run the new rule, so a key derived after this change keeps
following. A key derived before it (`pr_fung`) no longer equals the new
derivation and stays put. No deployment holds a draft, so no migration rewrites
it.

### D6. No key in a default label

`createPath.ts::sideText` reads a step's label, else the "(unnamed step)"
placeholder. The key fallback goes. The path's derived key follows: an
unnamed side contributes the placeholder's slug, as a punctuation-only
label already does.

### D7. A repeated step carries its rail number

The audit found a misreading. "Review (2)" reads as step 2, while the rail
numbers the second "Review" as 6. So a repeated step label takes its rail
number, its 1-based draft index.

`optionText.ts` gains `stepTextMap(steps, contentLocale, baseLocale)`, a map
from step id to text. A label that one step alone carries stays plain. Steps sharing a label read
`options.repeatedStep`, "{label} (step {n})". Unnamed steps sharing the
placeholder read `steps.unnamedStepNumbered`, "(unnamed step {n})". A single
unnamed step keeps "(unnamed step)".

`PathsPanel.tsx` and `TimersPanel.tsx` both call `stepTextMap`, so the two
copies of the map builder go. Ways out, fields and operands keep
`numberRepeats` and its "{label} ({n})": no numbered list stands beside
them.

### D8. A heading names its target once

A path the canvas creates carries the default label "Source → Target". The
heading template "{path} → {step}" then repeats the target. The result
reads "Prüfung → Capture → Capture".
`wayOutHeading` prints the label alone when it already ends with " → "
plus the target's text. The default label stays as `studio-canvas` states
it, since a participant's button reads it.

### D9. The time-limit select takes the studio select

The time limit's select now prints a full heading and grew wide. The studio
select of `PathsPanel.tsx` (`selectWrap`, `select`, `selectIcon`) moves to a
shared component, `panels/shared/StudioSelect.tsx`. Both panels show it,
so the time limit's select spans its column with the slate chevron.

### D10. Field-map rows carry accessible names

The audit found the field-map row controls unnamed (WCAG 4.1.2). The row
select reads `mapping.targetLabel`, "Field". The value input reads
`mapping.valueLabel`, "Value for {field}". The remove control reads
`mapping.removeLabel`, "Remove: {field}", which starts with the visible
text the change `studio-form-editor-names-fields` chose for its controls.
Each `{field}` is the row's target text.

## Risks / Trade-offs

- A reorder changes a repeated step's rail number, and the select follows.
  The rail moves with it, so the two never disagree.
- A transliterated key can collide where the old one did not. "Müller" and
  "Mueller" both derive `mueller`. The existing dedupe adds `_2`.
- Some tests pin old keys. A test that expects `pr_fung` or a key in an
  option fails. Each such test changes with this change.

## Migration Plan

None. Stored keys stay as they are.

## Open Questions

None.
