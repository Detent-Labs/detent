## Why

An approver opens an expense claim. A note at the top should say that an amount
over 5000 also needs the board. A step form renders fields and nothing else. An author
therefore fakes that note with a read-only string field carrying a default. The
faked field then lands in `data` and travels through every report, having never
held a value.

Two of the three shapes `docs/field-model-redesign.md` groups under S2 already
work today. A summary of what the applicant entered is a view field with
`readonly: true`, which `filterToEditable` drops before submission. A section
heading is a `group` field, which `leafFields` keeps out of the CEL `data`
namespace. Only one shape has no home today: static text that references no
field. This change gives it one.

## What Changes

- A step's `view.fields` becomes an ordered list of entries. An entry without
  `kind` is a field reference and parses exactly as it does today. An entry with
  `kind: "note"` carries authored text instead.
- A note declares `text` as `LocalizedText`, plus an optional `visible`, `group`
  and `span`. It declares no `ref`, `required`, `readonly`, `validation` or
  `validationMode`.
- The runtime resolves a note in the same pass that resolves fields. A note
  whose `visible` evaluates false reaches no client, its text included.
- The renderer draws a note as a paragraph, in the order the view array gives.
  The submit filter reads field entries alone, so a note cannot reach `data`.
- An author inserts a note in the form editor, writes its text, moves it and
  removes it. The existing condition builder sits behind `visible`.
- A note's `text` meets the base-locale rule every authored `LocalizedText`
  already meets. Nothing new constrains its `group`, because a field entry's
  `group` carries no resolution rule either.
- The unknown-key walker learns to tell the two entry kinds apart. Without
  that, a two-member union makes it skip every view entry, field entries
  included. The new rule fires only on a union that declares `kind`, so
  `FieldDef.default`'s opaque-literal dispatch keeps working. A `kind` this
  version does not know falls to the field member. Publishing then names it as
  an unknown key.

No breaking change. Every stored body parses unchanged, because none of them
carries `kind` on a view entry. That property is load-bearing. The schema also
deserializes published immutable bodies. A required discriminant would
therefore make an existing body throw on read.

Five shapes stay out of scope on purpose. A read-only table and a chart each
become one more `kind` later. A tab panel costs more than that, because it is
a container; `design.md` says why. A severity variant and Markdown in place of
plain text each become one more optional key.

## Capabilities

### New Capabilities

None. Every requirement lands in a capability that already owns the surface it
touches.

### Modified Capabilities

- `definition-contract`: the view entry becomes a union, and the unknown-key
  check keeps working across both members. Two MODIFIED requirements follow.
  One names the entry kind "View field references resolve against the full
  recursive field set" reaches. The other drops a stale claim: that the Zod
  gate rejects a ref-less entry, which a note now is. Three ADDED requirements
  follow them: the two entry kinds, the base-locale check's placement, and the
  unknown-key check across both.
- `authored-content-localization`: `ViewNote.text` joins the `LocalizedText`
  key list this capability enumerates. The rule itself already reads "every
  `LocalizedText` value found anywhere in the process body". Only the
  enumeration grows, so a note's text needs no second rule.
- `runtime-api`: view resolution emits note entries and drops a note its
  `visible` hides, matching how it already treats a hidden field. This change
  also MODIFIES "Resolve a display-ready view of an instance", which today
  says `fields` holds exactly the step's `ViewField`s.
- `form-ui`: the renderer draws a note, and the editable-field filter that
  builds a submission ignores one.
- `studio-form-editor`: an author inserts, edits, reorders and deletes a note
  without leaving the form editor. A note marks no catalog field as used, so
  the palette keeps offering every field it sits beside.
- `studio-app`: two MODIFIED requirements, one renamed through REMOVED and
  ADDED, and one further ADDED. The panels rail's entity count and the field
  matrix toolbar's count line each read field entries alone. The toolbar's
  fourth number subtracts the first from a grid of cells. A counted note would
  drive that number below zero. The second MODIFIED requirement is the inline
  translation warning, whose `LocalizedTextInput` site list gains the note's
  text. The renamed one is the rail's entity count, and the further ADDED one
  covers the Steps panel's configured-field count.
- `studio-checks-rail`: MODIFIES "The rail reports two view-flag stopping
  states". Both states read field entries alone, because a note carries
  neither flag. The rail's `checkViewFlags` walks each entry once for the
  pair, behind a single `ref` guard (`view-flags.ts:258`). This delta records
  a guarantee rather than a change.

`cel-expressions` needs no delta. Its scenario at
`openspec/specs/cel-expressions/spec.md:384` already types a view flag to
`bool`, and a note's `visible` is a view flag.

`end-user-app` and `studio-player` need no delta either, though this change
edits a screen each. Both screens read an entry to key form state and issues by
field id. Those reads are `TaskScreen.tsx:71` and `:235`, `PlayerScreen.tsx:159`
and `seedFormValues` (`studio/screens/playerLogic.ts:2`). Narrowing each one to
field entries changes nothing a participant or an author observes. No
requirement of either capability describes those reads. The `form-ui` delta
covers both surfaces.

## Impact

Schema and engine:

- `src/schema/definition.ts`: `viewNote`, `viewEntry`, the `view.fields`
  element type, and one `requireBaseLocale` call for a note's text
- `src/schema/compile.ts`: `unionObjectMatch` (`:304`) gains a discriminant,
  plus a field-entry filter at `:688`, `:765`, `:872`, `:1034` and `:1097`
- `src/cel/check.ts`: the expression walk at `:232` reaches a note's `visible`
- `src/runtime/api.ts`: the `ResolvedViewField` type at `:94` and the
  `InstanceView.fields` element type at `:124`. Then the resolution loop at
  `:654`, the `editableFieldIds` and `requiredFieldIds` filters at `:684` and
  `:689`, `applyColumnMapping`'s input at `:737`, the `fieldsById` map at
  `:926` and the `viewFieldsByRef` map at `:928`

Web:

- `packages/form-ui/src/types.ts`: the resolved entry becomes a union
- `packages/form-ui/src/FieldForm.tsx`: one branch ahead of the field switch,
  plus the `fields` prop at `:8` and `FieldInput`'s two at `:102` and `:103`
- `packages/form-ui/src/submit.ts`: `editableFieldIds` filters to field entries
- `packages/form-ui/src/locale.ts`: `resolveFieldsLocale` walks entries
- `packages/form-ui/src/index.ts`: the `ResolvedViewEntry` export the two
  client `InstanceView` types import
- `packages/form-ui/src/form-ui.css`: the note's own paragraph style, on the
  design language's tokens
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: the authoring
  surface
- `packages/web/src/i18n/catalogs/studio.ts`: the insert control, the note card
  and the strip each need their own string. The studio catalog ships `en`
  alone, so the parity test asks for no second locale
- `packages/web/src/areas/app/api/types.ts:36` and
  `packages/web/src/areas/studio/api/types.ts:130`: the client's own
  `InstanceView.fields` element type
- `packages/web/src/areas/studio/draft/view-layout.ts:4`: a `DraftViewEntry`
  union beside `DraftViewField`
- counting sites that read the array's raw length:
  `packages/web/src/areas/studio/draft/panel-rail.ts:31`,
  `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts:101`,
  `packages/web/src/areas/studio/panels/StepsPanel.tsx:155`. `panel-rail.ts`
  types its own parameter `fields?: unknown[]`, so that one widens before it
  can narrow
- `packages/web/src/areas/studio/panels/stepsPanelLogic.ts`: the Steps panel's
  count moves here out of the component, so a test can reach it
- `packages/web/src/areas/app/screens/TaskScreen.tsx:235` and
  `PlayerScreen.tsx:159`, which map the resolved array to field ids
- `packages/web/src/areas/app/screens/TaskScreen.tsx:71` and
  `packages/web/src/areas/studio/screens/playerLogic.ts:2`, which seed the
  form values from `f.field.id`. The Player's own loop lives in that helper,
  not in `PlayerScreen` itself
- `packages/web/src/i18n/catalogs/studio.ts` again, for
  `fieldMatrix.countLine`. It reads "{declared} view entries" today, and the
  `studio-app` delta renames what that number counts
- `packages/web/src/areas/studio/draft/localized-text.ts`:
  `forEachLocalizedEntry` visits no view entry today. Two consumers share that
  walk. A note's text reaches neither until it joins the walk, and no type
  error marks the gap. The comment above the walk claims a third consumer,
  `missingTranslationWarning`, which reads one value at a time instead
- `packages/web/test/boundaries.test.ts`: the note's text strip is a tenth
  `LocalizedTextInput` site under the studio, and that test pins the count at
  nine
- the studio's seven ref-guarded walks, which the union turns into type
  errors: `packages/web/src/areas/studio/draft/field-usage.ts` at `:33`,
  `:64`, `:101`, `:118`, `:161`;
  `packages/web/src/areas/studio/draft/view-flags.ts` at `:157`, `:258`
- the field matrix's four ref-keyed sites, on those same terms:
  `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts` at `:61`, `:68`,
  `:199`; `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx` at `:227`

Tests that read a widened return type:

- `test/runtime-api.test.ts`, `test/data-source-resolution.test.ts`,
  `test/column-mapping.test.ts` and `packages/form-ui/test/locale.test.ts`.
  Each reads `f.field` off a value that becomes an entry union, so each one
  stops compiling. Typechecking covers `test`, so `bun run typecheck` reports
  all of them. One file needs no change: `test/http.test.ts` declares a
  structural type of its own
- `packages/web/test/studio-fieldMatrix.test.ts` reads `.required` and
  `.readonly` off a `view.fields[]` element at five sites. They are `:184`,
  `:185`, `:215`, `:217` and `:246`. That package's tsconfig includes `test`,
  so these break one group later than the four above, at task 5.8

Tests the change edits without a type error forcing it:

- `packages/form-ui/test/field-form.test.tsx`: `renderFields` (`:13`) and
  `renderGrid` (`:440`) both take a `ResolvedViewField[]`. Each keeps
  compiling, since its callers pass field fixtures. Both widen so the three
  note cases can reach `FieldForm` at all
- `packages/web/test/studio-edit-panel-rail.test.ts:181`: a test title stating
  the rule this change renames. It passes either way, since its fixture holds
  no note

Docs:

- `docs/authoring-guide.md`: when to write a note, when a `readonly` field, and
  when a `group`
- `docs/openapi.yaml`: `InstanceView.fields` documents `ResolvedViewField` as
  its item schema today, with `field`, `required`, `readonly` and `span` all
  required. A note carries none of the four, so the array needs a second item
  schema
- `docs/browser-checks.md`: three checks quote `purchase-requisition.json`'s
  own numbers, at `:1001`, `:1012` and `:1018`. The count line's wording moves
  with `fieldMatrix.countLine`. The note must also land in a step that already
  declares a view. Two of those numbers move otherwise. A fourth check, at
  `:953`, opens `finance_review`'s own form editor. It quotes no number, and it
  is where the note card first shows in a browser
- `.claude/rules/authoring-invariants.md`: the `LocalizedText` list gains
  `ViewNote.text`, the unknown-key depth list says "view entry", and the
  `checkUnsatisfiableRequiredReadonly` bullet stops calling a ref-less entry
  rejected
- `.claude/rules/process-contract.md`: the view sentence at `:72` names both
  entry kinds
- `docs/current-state.md` and `docs/field-model-redesign.md`
- `docs/decisions.md`: the four kinds this change leaves out become an open
  question there. That is the register S1's item list already uses

No new dependency. Plain text needs no parser and no sanitizer, which is why
the note carries text rather than markup.
