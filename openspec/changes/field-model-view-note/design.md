## Context

See `proposal.md` for motivation. See `docs/field-model-redesign.md` (S2) for
the record this change comes from.

Four properties of the current code shape everything below.

`view.fields` is an array of objects that all carry `ref`. Roughly ten call
sites walk it and read `vf.ref` without checking:

- `compile.ts` at `:688`, `:765`, `:872`, `:1034` and `:1097`
- `cel/check.ts:232`
- `runtime/api.ts:654` and `:928`
- `definition.ts:881`
- four studio modules under `packages/web/src/areas/studio/draft/`

`definition.ts` also deserializes stored immutable bodies. A tightened key
there strands every instance pinned to a body that lacks it.

`checkUnknownKeys` walks the live Zod schema (`compile.ts:391`). It does not
mirror a key table. Its union branch delegates to `unionObjectMatch`
(`compile.ts:304`). That function returns `undefined` unless the union holds
exactly one object member. Its comment states the assumption plainly: no union
site in this schema holds two or more object members.

`getInstanceView` evaluates a field's `visible` server-side already. It skips a
hidden entry at `runtime/api.ts:657`. Nothing about a hidden field reaches the
client.

## Goals / Non-Goals

**Goals:**

- One ordered array, so a note's position needs no anchor and no merge step.
- No shape change for a field entry. No `definitionHash` movement for any
  stored body.
- Every publish-time check keeps its strength across both entry kinds.

**Non-Goals:**

- A second element kind. The union exists so a later leaf kind costs one member.
- A per-step override of a note. Notes live in the view, which is per-step
  already.
- Any change to how a field entry resolves, validates or renders.

## Decisions

### One array of entries, not a second array beside it

A note needs a position among the fields. In one array, position is array
order. The renderer, the resolver and the form editor honor that order today.

In a second array, every note needs an anchor naming a neighbouring field. That
anchor breaks when an author removes the field it names. The renderer and the
editor would each merge two lists into one order.

The price is the sweep of the ten `vf.ref` sites. The sweep happens once.
Change 4's item list then inherits the result.

### `viewNote` comes first in the union

The union reads `z.union([viewNote, viewField])`, in that order. Zod tries
members in order and takes the first that parses.

Consider an entry carrying `kind: "note"`, a `text` and a stray `ref`. It
parses against `viewField` too, because `viewField` requires only `ref` and
strips the rest. Ordering `viewField` first would turn a malformed note into a
silent field entry on the read path.

With `viewNote` first, that entry parses as a note. The read path drops its
`ref`. Publishing rejects it through the unknown-key check. That is the
established split here: the read path strips, the write path rejects.

### A field entry carries no discriminant

The `kind` key stays absent from a field entry. It does not appear as
`kind: "field"`. A literal discriminant would have to be optional to keep
stored bodies readable. An optional discriminant makes `z.discriminatedUnion`
unusable anyway. The absent-means-field rule is what stored bodies satisfy
today.

This costs the error messages a discriminated union gives. The studio's JSON
surface shows Zod issues from both members on a malformed entry. One
two-member union can carry that. The discrimination the publish path needs
lives in `unionObjectMatch` instead.

### `unionObjectMatch` learns a discriminant

The walker must pick the right member to check keys against. Extend
`unionObjectMatch` with one rule ahead of its current logic.

That rule applies only to a union in which some object member declares a
`kind` key. Inside such a union, a value carrying a string `kind` matches the
member whose `kind` literal equals it. Every other value matches the member
declaring no `kind`. Every other union falls through to the existing
single-object-member logic, unchanged.

"Every other value" is deliberately wider than "a value carrying no `kind`".
It also covers a `kind` no member's literal equals, and a `kind` that is not a
string at all. Both must land on the field member rather than on no member.

Landing on no member is what would hurt. `walkSchema`'s union branch checks no
keys when the match is `undefined`. An entry reading
`{"kind": "notes", "ref": "field_amount", "text": {...}}` would then publish.
Zod strips the two keys `viewField` does not declare, and the step renders a
bare input with the note's wording gone.

That is what the rule "Authored bodies reject unknown keys instead of dropping
them" exists for. Its own text names hand-written JSON as ordinary input.

Under the wider rule the walker checks that entry against `viewField`.
Publishing reports `kind` and `text` as unknown keys, located on the entry. A
future version that adds the kind moves it from an error to a member.

The gate is what keeps `FieldDef.default` (`Expression | Literal`) working.
Its only object member is `expression`.

An ungated rule would read "no `kind` means the member without one". It would
then match every object-shaped default against Expression's shape. An opaque
literal such as `{foo: "bar"}` would draw an unknown-key error on `foo`.
`test/compile-validation.test.ts:222` asserts the opposite.

No union the walker reaches declares `kind` outside the view, so the gate
costs nothing elsewhere. Two unions in `definition.ts` do declare one:
`timerProvenance` (`:1008`) and `instanceEvent` (`:1128`). Both sit in the
instance schemas. `checkUnknownKeys` walks `processBody` alone
(`compile.ts:394`), so the walker reaches neither.

Two alternatives lose. Leaving the function alone disables the unknown-key
check on every view entry, field entries included. The delta spec carries a
scenario for a field entry beside a note for exactly that reason. Writing a
second walker for the view duplicates logic this design deliberately holds in
one place.

### The base-locale check joins the existing site list

`processBody`'s superRefine calls `requireBaseLocale` per site
(`definition.ts:806-817`). A note's text becomes one more call, in the schema
rather than in `compile.ts`.

Placement follows `definition-contract`'s own rule. A violation cannot exist in
an already-published body, because no published body carries a note.

### A note's `group` gets no resolution check

A field entry's `group` has none either. Nothing in `compile.ts` confirms that
a `group` string names a real group field.

The consequence is worse than it sounds. `FieldForm.tsx:77` picks roots with
`!f.group`. An entry naming no real group falls out of the roots, and no group
container claims it either. It renders nowhere at all.

That hazard already exists for field entries. A check for notes alone would
make a note stricter than the field beside it. It would also leave the
field-side hazard untouched. Closing it for both belongs in its own change.

### The wire type mirrors the definition

`ResolvedViewField` becomes one member of `ResolvedViewEntry`. The same rule
discriminates it: no `kind` means a field.

The name survives, and that is not cosmetic. Four files build a
`ResolvedViewField` by hand: the catalog's single-field preview
(`draft/field-preview.ts:76`) and three `form-ui` test fixtures. All four keep
compiling, because a `ResolvedViewField[]` is still a `ResolvedViewEntry[]`.
Renaming the type instead would break them for nothing.

`form-ui` then holds one field-entry guard. `editableFieldIds` calls it, and
so does the renderer's own branch. No check gets repeated per call site.

`resolveFieldsLocale` does not call it. That function feeds
`<FieldForm fields={...}>` directly at `TaskScreen.tsx:284` and
`PlayerScreen.tsx:226`. A filter there would drop every note before it
reaches the surface. It maps over each entry instead, resolving a field's
label or a note's `text`, and returns the array at full length.

The note's `text` stays `LocalizedText` on the wire, matching
`WireField.label`. Locale resolution stays in the browser, where it sits today.

## Risks / Trade-offs

**A missed `vf.ref` site reads `undefined`.** → The sweep is enumerable.
Under Impact, `proposal.md` names the sites, and `tasks.md` carries a task per
group. TypeScript reports the ones in `src/` and in `packages/form-ui`,
because `ViewEntry` declares no `ref` property.

The suites are part of that sweep, and they were the easiest half to miss.
Five test files break. Four of them read `f.field` off a value this change
widens: `test/runtime-api.test.ts`, `test/data-source-resolution.test.ts`,
`test/column-mapping.test.ts` and `packages/form-ui/test/locale.test.ts`.
Roughly twenty sites across them stop compiling at task 4.8. Typechecking
covers `test`, so that gate reports every one. Tasks 3.4b and 4.2c narrow them.

The fifth sits under `packages/web`, and it breaks one group later.
`studio-fieldMatrix.test.ts` reads `.required` and `.readonly` off a
`view.fields[]` element at five sites. They are `:184`, `:185`, `:215`, `:217`
and `:246`, each typed through `DraftStep`. That package's own tsconfig
includes `test`, so the five stop compiling at task 5.8. Task 5.1h narrows
them.

Three sibling suites under that same directory survive untouched. The reads in
`studio-fieldUsage.test.ts` are `.visible`, which both members declare, and the
`in` form, which a union allows. The ones in `studio-fieldPreview.test.ts` come
off `previewViewFields`' return, still a `ResolvedViewField[]`. The third,
`studio-view-layout.test.ts`, hands a widened return to a `DraftViewField[]`,
on the same assignability the three silent sites below rest on.

Two groups of fixture builders survive untouched. The four builders named
above keep compiling, because they construct a `ResolvedViewField`. One test
file does too: `test/http.test.ts` declares a structural type of its own.

The typecheck reaches the studio too. `Draft` is `DraftOf<AuthoredProcessBody>`,
and `DraftStep` is `DraftOf<Step>`. `DraftOf` (`draft/types.ts:12`) is a
distributive conditional. It therefore carries the union into every draft-typed
walk. TypeScript then reports each `ref`, `required` and `readonly` read:

- `field-usage.ts` at `:33`, `:64`, `:101`, `:118` and `:161`
- `view-flags.ts` at `:157` and `:258`
- `fieldMatrixLogic.ts` at `:61`, `:68` and `:199`
- `FieldMatrixGrid.tsx:227`

Three sites stay silent instead, and those are the ones to check by hand. A
drafted note is assignable to `DraftViewField`. Every key is optional under
`DraftOf`. The two members also share `visible`, `group` and `span`. That overlap
defeats TypeScript's weak-type check. The three are `FormEditorScreen.tsx:232`'s
`rows` annotation, `cellEntry`'s return (`fieldMatrixLogic.ts:66`) and the
`entry` that `setFlag` takes (`view-flags.ts:49`).

So `packages/web` stays red until group 5 narrows those walks. Task 4.8 gates
the engine and `packages/form-ui` alone. Group 5 opens by adding a
`DraftViewEntry` union and a field-entry guard over it.

**The union weakens Zod's error message for a malformed entry.** → Publishing
reports the located unknown key. That is the message an author acts on. The
JSON surface shows raw Zod issues for every other union in the schema already.

**A studio count includes notes.** → Three counts read the array's raw
`.length`. They are `panel-rail.ts:31`, `matrixCounts`
(`fieldMatrixLogic.ts:101`) and `configuredFieldCount`
(`StepsPanel.tsx:155`). The `field-usage.ts` and `view-flags.ts` loops
already guard on `ref`, so each one takes the guard for its types alone.

The form editor displays no count of its own. It reads `rows.length` for an
insertion slot, for its empty state and for the last row's disabled `↓`.
All three stay correct with a note in the array.

**The count line's own wording outlives its rule.** → Today it reads
"{declared} view entries" (`i18n/catalogs/studio.ts:278`). The `studio-app`
delta renames what that number counts. It renames its own requirement for
exactly that reason. Leaving the string alone would ship the mislabel the
rename exists to remove. Task 5.1c moves it, and task 5.1d moves the doc
comment with it.

**A pinned browser check reads the example this change edits.** → The
checklist quotes that count line verbatim at `docs/browser-checks.md:1012`.
It also pins the rail's own count at `:1001` and the toggled numbers at
`:1018`. All three read `purchase-requisition.json`.

That file carries 13 steps, 54 entries and 22 fields. Three of its steps
declare no view. A note in one of those three would move the drawn-step count
and the undeclared-cell count. Task 6.1 therefore names `finance_review`,
which already declares one. Tasks 6.1c and 6.1d hold the checklist to the
result.

Four more studio sites find their entry by `ref`. They are
`FieldMatrixGrid.tsx:227`, `cellState` (`fieldMatrixLogic.ts:61`), `cellEntry`
(`:68`) and `applyBulkToggle` (`:199`). A note's absent `ref` matches nothing,
so each already behaves correctly. Each still takes the guard, because the
union makes `f.ref` a type error. Task 5.1b narrows them.

`matrixCounts` is the one that fails loudly. It derives `undeclaredCells` as
`fieldCount * stepCount - declaredEntries`. A counted note pushes that number
down, and eventually below zero.

The delta scenarios cover each count. Two of the three read a helper module
already: `panel-rail.ts` and `fieldMatrixLogic.ts`. The third sits inline in
`StepsPanel.tsx`, which no test mounts. Task 5.1e therefore moves it into
`panels/stepsPanelLogic.ts` first, beside `nextStepKey`. All three are then
cheap `bun:test` assertions, and none needs a browser.

**The studio's locale sweep misses a note's text.** →
`forEachLocalizedEntry` (`draft/localized-text.ts:38`) visits labels,
descriptions and option labels. It never reads `view.fields`. Two consumers
share that one walk. They are `collectUsedLocales` and `localeGapCount`.

`missingTranslationWarning` is not the third. It reads one value at a time
(`draft/localized-text.ts:102`). Each call site passes its own value. The walk
therefore does not reach the inline warning, and task 5.5c does not wire it.
Task 5.5a does, with a call beside the note's own input.

TypeScript reports none of it. That walk reads `step.label` alone, so a
widened view array changes no type there. Task 5.5c adds the note's `text`
to the walk. Task 5.5d tests both consumers that count.

The note's strip is also a tenth `LocalizedTextInput` site under the studio.
`boundaries.test.ts` pins that count at nine. It also demands an adjacent
`missingTranslationWarning` call, or an exempting comment. An untranslated
note is what the warning exists for, so it takes the call. Tasks 5.5a and
5.5b cover the two halves.

**A hidden note's text could leak.** → The resolver omits the entry outright.
That is how it treats a hidden field today. The `runtime-api` delta asserts
that the response holds none of the text.

**A note's stray `ref` surfaces only at publish.** → The studio holds
`checkUnknownKeys` back for a whole draft session. It has only the
Zod-stripped body (`docs/decisions.md`). The publish rejection is the first
signal an author gets. That gap predates this change and covers every unknown
key equally.

**A half-typed note card blanks the whole checks rail.** → `runValidation`
(`draft/validation.ts`) parses the draft with `authoredProcessBody.safeParse`.
Every dimension after `zod` reads "not-run" once that parse fails, and even
`checkViewFlags` waits for a Zod-valid draft.

A field card inserted as `{ref}` always parses. A note card inserted as
`{kind: "note"}` parses against neither member, because `viewNote` requires
`text`. A note seeded with empty base-locale text parses, but
`requireBaseLocale` then rejects it inside that same `safeParse`.

So the insert seeds `text` with a non-empty entry for the body's `baseLocale`.
The card is then valid the moment it lands, exactly as a field card is. Task
5.4 states that shape.

That also settles where task 5.7's report comes from. It is the existing
`requireBaseLocale` error, routed through `resolveLoc` to the note's step. A
new studio-side pass could not report it: those passes do not run on a
Zod-invalid draft.

**A form editor built for field cards resists a card with no field.** → This
part carries the real UI unknowns. It is also the last task group. The
contract, the engine and the renderer land first and stay useful on their own.
An author can write a note in the JSON view meanwhile, and that surface is
first-class here.

**A container kind costs more than one union member.** → A tab panel is
the case. A view entry's `group` names a group *field's* key, and `FieldForm`
resolves it against a `FieldDef`.

The note and the leaf kinds cost one member each: a table, a chart, a markup
block. A tab panel declares no catalog field, so its children cannot address it
through `group` as it stands. That kind costs a member plus a child-reference
mechanism, and this change prepares none.

## Migration Plan

No data migration. No stored body carries `kind` on a view entry. Every one of
them parses as it does today, and every `definitionHash` stays put.

That covers a stored body, not an example this change edits.
`test/view-layout-hash.test.ts` pins a hash literal for three files:
`expense-approval.json`, `subprocess-credit-check-child.json` and
`subprocess-loan-parent.json`. Adding a note to any of the three moves its
hash and fails that guard. Task 6.1 therefore names a file outside the three.

Rollback is a revert of the code. A body carrying a note would fail to parse
against the reverted schema. A revert after an author publishes a note
therefore needs those bodies removed first. Nothing runs this engine yet, which
makes that acceptable rather than a blocker.

## Open Questions

**Should a dangling `group` be a publish error?** An entry naming no real
group renders nowhere, silently. This change keeps the current behavior for
notes and fields alike. The answer changes no spec and no task here. It wants
its own change, and a measurement first: no definition under `examples/`
carries a dangling `group` today.

**Can the form editor slip to a follow-up change?** Task group 5 builds the
editor last. Until it lands, the JSON view is the only route to a note. That
surface is first-class here, so the answer changes no task order here.
