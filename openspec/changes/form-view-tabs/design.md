## Context

See `proposal.md` for motivation. What shapes the approach is the path a view
already travels.

`src/schema/definition.ts` declares `view` as `{ fields: ViewEntry[], columns?
}`. A `ViewEntry` is a `ViewField` or a `ViewNote`. Both may declare `group`,
naming a `type: "group"` field's `key`. `form-ui` draws the entries declaring
no `group`. A group field then draws the entries naming its own key.

`src/runtime/api.ts` resolves that view into `InstanceView`. That shape holds
`fields: ResolvedViewEntry[]` plus `columns: 1 | 2`.
`packages/form-ui/src/FieldForm.tsx` reads it, never the authored one. Its
props are `fields`, `values`, `onChange`, `locale`, `issuesByField` and
`columns`.

Two facts make tabs cheap here. `FieldForm` has no value state, so a panel may
unmount without losing anything. And no input carries the native `required`
attribute. No browser validation can therefore refuse to focus a control on a
closed panel.

`packages/web/src/areas/studio/panels/ProcessTabRow.tsx` already implements a
WAI-ARIA tab strip for the ten process tabs, with manual activation.

## Goals / Non-Goals

**Goals:**

- One authored tab list per step view, with the hierarchy the specs fix.
- No change to a stored body, a `definitionHash`, a submission payload or any
  engine behavior.
- Tabs authored with no CEL and no JSON, in the form editor.

**Non-Goals:**

- A `visible` expression on a tab. The auto-hide rule covers the case.
- A per-tab `columns`. The count stays form-wide.
- Nested tabs, tab icons, and tab badges beyond the issue count.
- A studio checks-rail mirror of the five publish rules. The editor cannot
  create a violating draft. The `group` rule set the precedent by carrying no
  mirror either.
- A `studio-player` or `end-user-app` delta. Both specs hand the form's
  internals to `form-ui`, and that sentence stays true with tabs in it.
- Tabs in the Forms tab's card miniature. That card draws its own bars and
  reads no `FieldForm`, so a tabbed form keeps drawing flat there.

## Decisions

### A view-level list, referenced by key

`view.tabs` is an ordered array. An entry names one member's `key`. The
alternative is a nested body, `tabs: [{ key, label, fields: [...] }]`. That
would move `view.fields` under a tab. It breaks every reader of `view.fields`,
for a change that presents itself as layout.

A tab has no `id`. The definition contract makes `id` the sole reference
anchor for entities that cross-reference. Nothing outside a view addresses a
tab. Nothing addresses a note either. `group` already sets the precedent of a
view-scoped reference by key.

The studio mints the `key` and never shows it. Rule 1 keeps it unique within
the view, which is all the reference needs.

### This supersedes the parked tab-panel display element

`docs/decisions.md` parks four display-element shapes for the `view`: a chart,
a read-only table, a markup block and a tab panel. The archived
`field-model-redesign.md` records them as S2 and says each is one more
`ViewEntry` union member.

That record also names what breaks on the fourth. A tab panel "groups other
entries under a label, so it nests rather than sitting flat like the other
four". Nesting is exactly what `view.fields` cannot take. Every reader of that
flat array would learn a second level, for what is layout.

This change therefore answers the parked question with a different mechanism.
Tabs are a view-level list, and an entry names one. The other three shapes
stay parked and stay union members. Each of them is a leaf that draws in
place.

`docs/decisions.md` loses the tab panel from that bullet, leaving three. A
task carries that change, so the parked list and the shipped mechanism cannot
disagree.

### The five rules live in the schema

`.claude/rules/authoring-invariants.md` states the criterion. An invariant
whose violation cannot exist in an already-published body may live in the
schema. No published body carries `tabs` or `tab`. None of the five can
therefore strand a pinned instance, so the compile pass carries none of them.

All five are view-scoped, so one `superRefine` on `view` holds them. The
`viewField` and `viewNote` shapes need their own refinement for neither. Rule
4 compares an entry's `group` against its `tab`. Rule 5 compares an entry
against its view's `tabs`.

`checkUnknownKeys` reads the Zod schema through `walkSchema`. Declaring `tab`
and `tabs` therefore makes them known keys. `compile.ts` stays as it is.

### The panel mounts alone

`FieldForm` renders the open tab's panel and nothing else. The closed panels
are absent from the DOM. Hiding them with `[hidden]` is the alternative.

Values live in the consumer's own `values` record, so a switch loses nothing.
A mounted-but-hidden panel would put focusable controls in the accessibility
tree that the participant cannot see. The `spa-accessibility` capability
already guards against that elsewhere.

### The issue switch belongs to the consumer

`form-ui` exports `firstTabWithIssue` as a pure function. A consumer calls it
after a submission fails and sets its own `activeTab` to the answer. While
`issuesByField` stays empty the helper answers `undefined`, so the
participant's own choice stands.

`FieldForm` starts no switch of its own. It has no state to switch from, and
adding one would put the first React hook into a package that has none.

Validation is server-side here. `submitAndTransition` returns
`SubmissionValidationError`, and `TaskScreen.tsx` turns it into
`issuesByField`. No client-side pre-check exists to hook instead.

### A group is atomic

Rule 4 forbids a `tab` on an entry declaring a `group`. The alternative lets a
group's members scatter across tabs. The group's legend would then draw once
per tab, with a fraction of its members under each. Nothing wants that.

The rule also keeps the editor simple. Moving a group's card between tabs
moves its members with it, and the members take no rewrite.

### Every root entry names a tab

Rule 3 admits no entry outside the tabs once a view declares one. The
alternative is a header area above the strip, for unassigned entries. That is
a second layout concept for a case a tab already expresses.

The editor closes the gap the rule opens. Adding the first tab sweeps every
existing root entry into it. The author therefore never meets an invalid
draft. Removing the last tab clears `tab` everywhere and drops `tabs`.

### `InstanceView.tabs` always reports

Resolution emits an empty array for an untabbed view. `columns` always emits
a number the same way. A caller therefore reads one shape.
`docs/openapi.yaml` gains `tabs` in the `InstanceView` schema and in its
`required` list. Both resolved
entry shapes gain `tab`.

### Manual activation in both strips

Arrow keys move focus. `Enter` or `Space` opens the focused tab.
`ProcessTabRow.tsx` already chose that pattern. A second convention in the
same product is what the alternative costs.

## Visual direction

Shaped against `DESIGN.md` before any code, per the repo's UI convention. The
world is the Rubber Stamp Ledger. Zero radius, the border as the form
language, one accent spent as a stamp.

The strip repeats the process tab row's grammar, character for character. It
is a row of 14px weight-800 labels over a 2px divider. Gaps are 4px, padding
is 8px by 12px, and an accent rule under the open tab marks it.

Both strips read one token module, `form-ui/tokens.stylex`. `ProcessTabRow.tsx`
already imports it. The two strips share the tokens and no component: the
dependency direction forbids `form-ui` importing from `packages/web`.

Two strips then stack in the form editor, the process row above and the
form's own below. That is the accepted cost of one tab language, chosen over
a quieter second treatment. The step title sits between them and separates
the levels.

A tab holding issues carries a filled `stamp-refusal` count beside its label:
mono, 11px, refusal ground, paper text. One stamp per tab, which is the Stamp
Rule's own limit. That count is also the screen-reader text the `form-ui`
spec requires. No second element carries it.

The authoring controls sit at the strip's trailing end, in the editor alone.
They are ghost buttons in mono at 11px, in the accent. A participant never
gets them, so the participant's strip is labels and nothing else.

## Risks / Trade-offs

**A tab that hides itself surprises an author.** → The editor's canvas shows
every tab, whatever `visible` resolves to. The author always sees what they
authored. The auto-hide is a runtime rule the `form-ui` spec states, and the
preview shows it.

**The editor's tab strip and the preview's tab strip can disagree.** → One
selected-tab state drives both. The `studio-form-editor` spec makes that a
requirement with its own scenarios.

**A hand-authored JSON draft can break rule 3 and fail only at publish.** →
Accepted. The `group` rule behaves the same way today, and the JSON view is
the low-code escape hatch by design.

**`view.columns` stays form-wide, so every tab shares one count.** → Accepted
for now. Adding `columns` per tab later stays additive. An absent per-tab
value would read as the form's own.

## Migration Plan

No data migration. All three keys are optional. A stored body therefore parses
as it does today, and it keeps its `definitionHash`. No instance rehydrates
differently.

Rollback is the revert of the commit. A draft saved with tabs would then fail
to publish against the older schema. That is the exposure any schema addition
carries pre-1.0.

## Implementation Notes

Exact touch points, so no implementer has to rediscover them.

- `src/schema/definition.ts`: `viewTab` (`key`, `label`), `view.tabs`, `tab`
  on `viewField` and `viewNote`, the `view` superRefine holding rules 1 to 5,
  and a tab-label call in `processBody`'s base-locale pass beside the
  `ViewNote.text` one.
- `src/runtime/api.ts`: `tab` on `ResolvedViewField` and `ResolvedViewNote`,
  `tabs` on `InstanceView`. `resolveFields` (line 667) fills each entry's
  `tab`, and its `getInstanceView` caller fills `tabs`.
  `validateSubmissionData` (line 959) shares the return type and needs
  neither: a tab reaches no submission check.
- `packages/form-ui/src/types.ts`: `tab` on `ResolvedViewField` and
  `ResolvedViewNote`, plus a `ResolvedViewTab` shape.
- `packages/form-ui/src/FieldForm.tsx`: the three tab props, the tablist and
  the panel filter. No hook, no state: the open tab derives from `activeTab`
  and `drawnTabs`.
- `packages/form-ui/src/locale.ts` and `index.ts`: `drawnTabs`,
  `firstTabWithIssue` and `resolveTabsLocale`, all three exported.
- The THREE screens that mount `FieldForm`, each owning its own open tab:
  `packages/web/src/areas/app/screens/TaskScreen.tsx`,
  `packages/web/src/areas/studio/screens/PlayerScreen.tsx`, and
  `packages/web/src/areas/studio/panels/FormPreview.tsx`.
- `packages/web/src/areas/studio/draft/field-preview.ts`:
  `previewViewEntries` builds each entry key by key, so it drops `tab` today.
  It carries `tab` onto both entry kinds and returns the draft's tabs beside
  `entries` and `values`.
- `packages/web/src/areas/studio/draft/view-layout.ts` and the draft types:
  `tabs` on the draft view, `tab` on a draft entry, and the move helpers the
  editor calls.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: the tab
  strip, the canvas filter, the row strip's tab picker, and the create and
  remove rules.
- `packages/web/src/i18n` studio catalog: the editor's new strings.
- `docs/openapi.yaml`, `docs/authoring-guide.md`,
  `.claude/rules/process-contract.md` and
  `.claude/rules/authoring-invariants.md`: the rule delta.
- `docs/decisions.md`: strike the tab panel from the four parked display
  elements, leaving three.
- `docs/browser-checks.md`: the tabbed-form check, per
  `development-toolchain`'s split rule.
- `examples/`: one definition carrying a tabbed form.

## Open Questions

None. The sections above and the four delta specs answer every question this
change raised.

Two of them closed before this task list existed. The shaping pass under
Visual direction settled the strip's treatment. The package's hook-free shape
settled whether `FieldForm` may hold the open tab.
