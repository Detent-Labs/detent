## Context

See proposal.md for the motivation. The code this design replaces is small.

`panels/ChangesView.tsx` fetches the base version's body and strips its compiled
content. It then calls `screens/versionDiffLogic.ts::diffJson(base, draft)`.
It prints each `DiffEntry` as a path, a kind, and `JSON.stringify` of both
values. `diffJson` recurses into objects key by key. It compares any array
whole, by canonical JSON, and reports it as one `changed` leaf.

`screens/VersionsScreen.tsx` carries its own copy of that list markup.
`diffSelected` calls `diffJson(bodyA, bodyB)` on two compiled bodies.
`diffAgainstBase` calls `diffJson(draft, strippedBase)`, the draft first. The
comment in `ChangesView.tsx` names that order as the one reading an added field
as removed.

`EditScreen.tsx` keeps every tab body mounted, and `hidden` hides nine of them. The
Changes count reaches the tab row through `ChangesView`'s `onCount` prop and
`draft/process-tabs.ts::processTabCounts`. A Checks row opens its tab through
`goToTab(tabForIssue(entityType))`.

The draft reaches `ChangesView` as `Draft`, which is
`DraftOf<AuthoredProcessBody>`. Every key in it is optional, because an author
may sit mid-change.

The owner picked the layout from three mockups on 2026-09-13: option B, the
folded register. The mockup page is
<https://claude.ai/code/artifact/1abd4c45-2892-4f44-9f08-517eaa66177b>.

## Goals / Non-Goals

**Goals:**

- One pure function turns two bodies into the grouped rows both screens list.
- One component draws those rows for both screens.
- A test fails when the definition contract gains a key the rows have no word
  for.

**Non-Goals:**

- No hint about what a publish does to running instances, such as a removed
  field a migration must map. Add one when an author asks for it.
- The open command opens the owning tab and selects nothing on it. A Checks row
  also opens the tab alone today, though `studio-process-tabs` asks it to select
  the subject. That gap stays outside this change.
- `diffJson` keeps its behavior and its tests.
- The five literal dormant stamp colors stay as they are. Three sit in admin
  screens and two in app screens. `docs/decisions.md` files them under
  `Decided, not yet built`.
- The engine gains no diff export. Nothing outside the studio reads a
  difference today.

## Decisions

### D1. A walker over the definition contract, with `diffJson` inside each pair

`draft/changeSet.ts` exports `describeChanges(before, after, locale)`. It
returns `ChangeRow[]` in group order. It knows the collections the definition
contract declares, pairs their members, and hands each pair to `diffJson`.
Sub-lists a row owns come out of the pair before that call. `diffJson`'s entries
become the row's properties and its Developer view paths.

The function is total over any JSON value. The editor's load guard checks only
the top level, so a string can stand where `workflow.steps` or a step's `paths`
belongs. A body can also lack `workflow` entirely. A shape the walker
does not expect reads as JSON on the Process row, and nothing throws.

```ts
type ChangeGroup = "process" | "fields" | "dataSources" | "steps" | "paths" | "forms" | "contract";
type ChangeKind = "added" | "removed" | "changed";

interface ChangeValue { text: string; mono: boolean }

interface ChangeProperty {
  name: string;
  kind: ChangeKind | "order";
  before?: ChangeValue;
  after?: ChangeValue;
}

interface ChangeRow {
  /** `${group}:${anchor}`. The React key and the open-state key. */
  key: string;
  group: ChangeGroup;
  kind: ChangeKind;
  label: string;
  entityKey?: string;
  /** Paths only: the label of the step the path leaves. */
  context?: string;
  properties: ChangeProperty[];
  /** Full-path entries for the Developer view. */
  raw: DiffEntry[];
}
```

The Developer view prints the after side's path, or the before side's for a
removed row. A member whose path differs between the sides prints both.

The file sits beside `draft/guided-labels.ts` and `draft/field-type-labels.ts`.
Both already read the catalog through `t()` on every call. The walker therefore
returns finished words, and a UI-string override reaches them.

Rejected: an anchor-aware `diffJson` with labels matched on path patterns such
as `workflow.steps[*].paths[*].guard`. Notes, form tabs and options each need
their own anchor rule anyway. Grouping by tab would then come out of string
patterns, which breaks quietly when a path shape moves.

Rejected: a diff export in the engine package's exports map. No integration
reads a difference, and catalog words stay out of `src/`.

### D2. Anchors, and what happens without one

| List | Anchor |
|---|---|
| `fields`, at any depth | `id`, paired across the whole catalog |
| `dataSources` | `id` |
| `workflow.steps` | `id` |
| a step's `paths` | `id`, paired across every step |
| a step's `timers`, `onEntry`, `onExit`, `onCancel`, a path's `onPath` | `id` |
| a timer's `onFire.actions` | `id` |
| a view's `fields`, field entries | `ref` |
| a view's `fields`, notes | position among that view's notes |
| a view's `tabs` | `key` |
| a field's `options` | `value` |
| `allowedGroups`, `contract.inputFields`, `contract.outputFields`, `contract.outcomes` | the member itself |

A member with no anchor takes the anchor `#<path>`, its JSON path on its own
side, such as `#fields[2].fields[0]` or `#workflow.steps[1].paths[0]`. A path is
unique per side, so two row keys never collide across containers.

A member whose anchor an earlier member of the same collection already holds
takes `<anchor>#<n>`, its occurrence number. For fields that collection is the
whole catalog in depth-first order. For paths it is every step's paths, in step
order. The member pairs with the n-th occurrence on the other side. The Checks tab reports a duplicate id and a duplicate tab key.
Nothing rejects a duplicate view `ref` or option `value`, so a published body
can carry one.

Fields pair across the catalog because moving a field between groups keeps its
`id`. One walk records each field's parent group, and the parent becomes the
row's Group property. Paths pair across steps for the same reason. A path whose
leaving step differs gains a From property.

### D3. Which row owns which key

A pair's `diffJson` call runs on a copy with the owned sub-lists removed. Those
sub-lists become rows or properties of their own.

- **Field row.** `fields` leaves: child fields are rows. `type`, `format` and
  `control` fold into one Kind property, worded by
  `draft/field-type-labels.ts::fieldKindWord`. `options` pair by `value`, one
  property per option.
- **Data source row.** A data source has no label, so the row names it by its
  key. Its properties are the key, the type, the description and the config,
  the last printed as JSON.
- **Step row.** `paths` and `view` leave. `assignment` stays one property,
  worded by `draft/guided-labels.ts::assignmentWord`. Actions pair by `id`, one
  property each, named by position and type, such as "On entry ·
  `notification.email`". A timer has no type, so its property reads "Timer"
  plus its position among the step's timers.
- **Guided words on the Step row.** `type` and `terminal` fold into one Kind
  property. It reads through
  `draft/guided-labels.ts::stepKindPhrase(performedByFor(type, terminal))`.
  A Timer property whose `duration` alone differs reads the time limit before
  and after. `draft/time-limit.ts::timeLimitParts` supplies the number, and a
  `timeLimit.unit*` word follows it. A duration that pair cannot state prints
  in mono. `subprocess.versionBinding` reads as `subprocess.bindingPinned` or
  `subprocess.bindingLatest`. The contract words `terminal`, `task` and
  `latest-at-spawn` stay in the Developer view. That follows
  `studio-guided-vocabulary`.
- **Equal guided words.** A guided word can match on both sides while its
  value differs. `assignmentWord` reads only `strategy.type`, and
  `fieldKindWord` answers one word for every plugin type. The property then
  reads its differing `config` entries instead, each under its JSON key with a
  D5 value. A `fieldId` there reads as that field's label. The Kind value
  prints in mono when `fieldKindOf` names no kind for a type that is no plugin
  envelope.
- **Path row.** `onPath` actions pair by `id`. `to` reads as the target step's
  label.
- **Forms row.** One per step whose `view` differs. A field entry added or
  removed is one property. A changed entry names the field and the key, such as
  "Forwarding address · Required". A note, a tab and `columns` are properties
  too.
- **Process row.** `key`, `label`, `description`, `baseLocale`,
  `workflow.initialStep` and `allowedGroups`. It also carries the order
  properties of the catalog root, `dataSources` and `workflow.steps`.
- **Contract row.** Each of the three lists compares as a set, plus its own
  order property.

A whole `view` or `contract` appearing makes its row an added row. Its
disappearance makes a removed row. A step added or removed brings its paths and
its view along, per the `studio-app` delta.

A key outside every list above lands on the Process row. It reads under its
JSON key with a JSON value, so no key drops out.

### D4. Order reads as one property per list

For a list paired by anchor, the walker takes the anchors both sides hold.
It keeps each side's order. Two different sequences add one order property to
the row owning the list. The property names its list, such as Step order, and
prints the word "Reordered". Both sequences go to the Developer view.

A member added, removed or moved to another container is absent on one side.
It never makes an order property on its own.

| Row | Order names |
|---|---|
| Process | Field order, Data source order, Step order |
| Field | Field order (a group's children), Option order |
| Step | Path order, Timer order, On-entry order, On-exit order, On-cancel order |
| Path | On-path order |
| Timer property | On-fire order |
| Forms | Form order, Tab order |
| Contract | Input field order, Output field order, Outcome order |

### D5. Words for property names and values

A table in `changeSet.ts` maps each declared key to a catalog key under
`changeList.prop.*`. A key missing from the table reads under its own name in
mono.

Beside that table, the walker returns derived names, one catalog key each. A
placeholder marks where a value enters, as `checksRail.narrowedTo` already does.

- Group, Kind and From.
- `Timer {n}`, and `On entry · {type}` with its On exit, On cancel, On path and
  On fire siblings.
- `Option {value}`, `{field} · {property}` for a form entry, and
  `{property} ({locale})`.
- `{property} · {leaf}` for a leaf under a declared nested object, such as
  Validation · Minimum.
- One order name per list, such as Step order. D4's table holds the full set.

`config`, `attributes`, `columnMapping` and `default` stay one property each,
printed as JSON.

Values follow one rule per shape:

- A `LocalizedText` reads in the `locale` argument. If that argument is absent,
  the side's own base locale applies. The Changes view passes the editor's
  content locale, which `EditScreen` already hands to
  `resolveDraftLocalizedText`. The Versions screen passes none.
- A difference in another locale adds a property named with that locale, such
  as "Label (en)". A locale stays out only when the plain property prints. Each
  side must then either read that locale or have no entry for it. A translation
  added or removed in the content locale then prints once. When both sides read
  the same text, each differing entry prints under its own locale. A translation
  equal to its fallback prints that way, and so does an entry holding no text.
- A boolean reads "yes" or "no".
- An id reads as the label of the entity it names, looked up on its own side.
  An id naming nothing prints raw, in mono.
- A record keyed by field id names each property by that field's label, looked
  up on its own side. A subprocess step's `outputMapping` is such a record. The
  child contract's field ids key its `inputMapping`, and the parent body
  declares none of them. Each of its properties names the raw id, in mono. An
  action stays one property, so its `output` prints as JSON inside it.
- An `Expression` reads as its `src`, in mono.
- An absent value reads "none".
- Anything else prints as `JSON.stringify`, in mono.

A test walks the Zod shapes the engine exports: `processBody`, `workflow`,
`step`, `path`, `timer`, `timerAction`, `action`, `retryPolicy`, `plugin`,
`dataSourceDef`, `subprocessSpec`, `viewField`, `viewNote`, `view`, `viewTab`,
`processContract`, `fieldDef`, `fieldOption` and `fieldValidation`. It fails on
a declared key with no word and no owning list. A record such as
`plugin.config` counts as one value, never as keys. Zod 4 keeps `.shape` on a refined object. Only
`fieldDef` needs its `z.lazy` getter called first. The private
`compile.ts::unwrapSchema` does the same. The test repeats that step itself.

### D6. `ChangeList` draws the folded register

`panels/ChangeList.tsx` takes `rows`, a `heading` line, and an optional
`onOpenRow`. The layout is mockup B.

- The heading line is an `<h2>`, and the group headings nest under it as
  `<h3>`. Each group heading prints the group name and a mono count, over a
  2px divider.
- A row is a `<details>`, and its `<summary>` is a grid of three columns. They
  hold the stamp, the label with its mono key and path context, and the
  property names in slate.
- An open row lists its properties as name, before, arrow and after. The open
  command follows, then a `<details>` holding the Developer view.
- One authoring command beside the heading line reads "Expand all" or "Collapse
  all".
- The added stamp takes the accent tone, the changed stamp takes ink, and the
  removed stamp takes dormant. All three are existing stamp tones.

The open state is a `Set<string>` of row keys held in `ChangeList`. Each
`<details>` reads `open` from the set and writes the set back from `onToggle`.
`ChangesView` stays mounted, so a later draft change recomputes the rows and
keeps the set. A row key that leaves the list stops matching.

The row's `<summary>` is the disclosure control. The open command is therefore
a separate button inside the open row, never a second handler on the row.

A folded `<details>` still carries its content in markup, and the browser hides
it. A static render therefore shows every row's open command.

`tokens.css` gains a primitive `--dormant-500: #726e6e`, overridden to
`#9b9797` under `prefers-color-scheme: dark`. It also gains the role
`--color-dormant: var(--dormant-500)`. `tokens.stylex.ts` gains `dormant500` and
`dormant`, and its header count moves from 40 to 42. `DESIGN.md` already lists
Dormant, and a component reads roles only.

`web-styling`'s requirement "The token module lives in form-ui" governs
`tokens.stylex.ts`. The `studio-app` clause that forbids a studio change to
`packages/form-ui` guards the renderer. `accentOnMuted` reached the token module
the same way.

The heading line names the comparison and never counts. The group headings and
the tab carry the counts, so no sentence needs a plural built from fragments.
Its wording stands under Copy below.

`/impeccable shape` ran on the Changes tab on 2026-09-13, with mockup B as its
input. The owner confirmed its brief, recorded below.

**Job and ranges.** An author checks before Publish that the draft changes only
what they meant. A developer on the Versions screen reads what separates two
versions. A list runs from zero rows to hundreds, after a template import or
across many versions. A value runs from one word to a paragraph, or to
multi-line plugin `config`.

**States.** Loading, the error banner, first publish and no difference keep
today's single lines, where the list will stand. The Versions screen gains a
waiting line while both bodies load.

**Keyboard and assistive technology.**

- The `<summary>` is the row's one place in the tab order, and Enter or Space
  toggles it.
  `spa-accessibility` places a native `<details>` pair outside its disclosure
  rule, as it already does for the step page's Developer view.
- No interactive element sits inside a `<summary>`.
- The Expand all command is a `<button type="button">`. It carries
  `aria-controls` naming the list's id. Its `aria-expanded` reads `true` exactly
  while every row stands open, the state in which it reads "Collapse all".
- The stamp's catalog text is a capitalized word, and CSS sets it in capitals.
  A screen reader then reads "Changed" as a word, never letter by letter.
- The property list is a `<dl>`. Each value carries visually hidden "Before:"
  or "After:" text, and the arrow between them carries `aria-hidden`.
- Rows key on `row.key`, so focus on a `<summary>` survives a recompute.

**Narrow widths.**

- Below 40rem the stamp and the identity share the first line, and the property
  names move under them.
- An open row stacks each property as name, before, after.
- The Developer view scrolls inside its own box, and a mono key wraps anywhere.
- The stamp column's minimum width fits "Removed". A longer UI-string override
  widens its own row and never clips.

**Copy.**

- Group headings repeat the tab names.
- The folded row names four properties at most, then "+2 more".
- Each open command names its entity, such as "Open Forwarding address in the
  Fields tab". Each group keeps one sentence key with a label placeholder, the
  way `checksRail.narrowedTo` does. A long list then never repeats one
  accessible name.
- Values print "Reordered", "Added to the form", "Removed from the form", or
  "none" in slate.

The heading line reads "Compared with version 2" on the Changes tab. The
Versions screen reads "Version 5 compared with version 2", or "Draft compared
with version 2".

### D7. The Versions screen reads A as before

`diffSelected` calls `describeChanges(stripCompiledContent(bodyA),
stripCompiledContent(bodyB))`. Stripping both sides keeps the cancel sink out of
every row, whichever versions the developer picks. `diffAgainstBase` calls
`describeChanges(stripCompiledContent(base), draft.body)`, the base first.

The screen passes no `onOpenRow`. Its `ChangeList` takes a React `key` naming
the comparison, so a new comparison starts folded.

A waiting flag drives the waiting line. It clears in the same `catch` that calls
`fail`, so a read that errors never leaves the line beside the error.

The owner chose A as before on 2026-09-13. The migration-plan control beside
the comparison already reads the same selection as A to B.

### D8. The count, and the spec that already covers it

`ChangesView` reports `rows.length` through `onCount`. `processTabCounts` stays
as it is. `studio-process-tabs` says "Changes counts the differences against the
base version", and a row is one such difference. That requirement does not need
a delta.

### D9. Tests

- `packages/web/test/studio-changeSet.test.ts` covers the logic. It holds one
  case per anchor rule, and one for the moved field. Further cases cover the
  lone Order property, the step bringing its paths and form, and the JSON-key
  fallback. Two cases cover a missing anchor and a duplicate one. The content
  locale, a malformed body, a seeded draft producing no row and the D5 coverage
  walk follow.
- The same file checks the guided words. A step turned into an end reads Kind,
  before "A step someone works", after "An end". An assignment whose
  `config.groupId` alone changed shows both ids. Two compiled bodies of
  `examples/subprocess-credit-check-child.json`, each stripped, yield no row
  naming the cancel sink.
- `packages/web/test/studio-changeList.test.tsx` uses `renderToStaticMarkup`,
  the way `studio-checksRail-narrowing.test.tsx` does. Rows stand folded, and
  a summary names four properties before "+2 more". No row carries an open
  command without `onOpenRow`, and the Process row carries none even with it.
  The Expand all command carries `aria-expanded="false"` and `aria-controls` on
  a folded list. A Fields row's folded markup carries its open command when
  `onOpenRow` is given, so the two negative cases cannot pass on empty markup.
- `packages/web/test/studio-processTabs.test.ts` gains a case for
  `tabForChangeGroup`, beside `tabForIssue`'s cases.
- `studio-versionDiffLogic.test.ts` stays unchanged.
- Focus after an open command needs a live DOM, and so does an open row
  surviving a recompute. Browser walks cover both, per D11.

### D10. An open command hands focus to the tab it opens

`EditScreen.tsx` gains `openTabFromRow(target)`. A target that is already the
open tab takes focus at once through `tabDomId(target)`, and the function
records nothing. Any other target goes through `goToTab(target)` and becomes
the pending focus.

An effect on the open tab moves focus to `document.getElementById(tabDomId(target))`
only while the pending value equals the open tab. It clears the pending value
either way. A stale value therefore never pulls focus on a later tab switch.
`ProcessTabRow` already sets `tabindex="0"` on the focused tab.

The Checks rail's `onOpenIssue` and the Changes tab's `onOpenRow` call it. A
new `draft/process-tabs.ts::tabForChangeGroup` sits beside `tabForIssue`. It
maps a change group to its tab, and answers `undefined` for Process.
`goToTab` keeps its other callers unchanged, such as the form editor's back
command. Each of those owns its own focus story.

Rejected: focusing inside `goToTab` itself. It would move focus for every
caller. Some of those return an author somewhere other than the tab row.

### D11. Documents that name the old output

- `docs/browser-checks.md`, the Changes walk. It expects a `label.en` entry
  today and moves to rows. It opens a field's row and renames another field on
  the Fields tab. Back on Changes, the first row still stands open. It then sets
  the content locale to German and renames a field's German label. Pass: that
  row reads the German label before and after.
- `docs/browser-checks.md`, the Versions walk. It checks the A-before reading.
  It compares two published versions of `subprocess-credit-check-child`, one
  with a changed label. Pass: no row names the cancel-sink step or the
  `cancelled` outcome. It then mocks the version-body route to answer 500 with
  playwright-cli. Pass: one waiting line stands, then the error takes its
  place.
- `docs/browser-checks.md`, a keyboard walk. It covers the focus hand-off from
  a Checks row, a process-level check and a Changes row.
- `docs/current-state.md`: the passages naming `diffJson` as the Changes view's
  output. The `draft/process-tabs.ts` passage counts four pure functions and
  names `tabForChangeGroup`. The `ProcessTabRow.tsx` passage names the focus
  hand-off. The studio publish entry's Versions-screen sentence says the screen
  shows the change list, which pairs lists by anchor.
- `openspec/config.yaml`: its context reads "published versions compared as a
  change list" in place of "a JSON diff".
- `.claude/rules/ui-glossary.md`: a `change list` row naming
  `panels/ChangeList.tsx`. The Developer view row's Names cell reads "a
  disclosure over the raw JSON behind a step page or a change-list row. It
  stands closed on open". Its Lives in cell adds `panels/ChangeList.tsx`.
- `DESIGN.md`: a `dormant-500` color entry, and `stamp-dormant`'s `textColor`
  reading it. `.claude/rules/design-language.md` names the role.
- `docs/decisions.md`: the five literal dormant colors, under the heading
  `Decided, not yet built (each needs its own OpenSpec change)`. The entry notes that
  `.impeccable/config.json`'s `#726e6e` ignore stays until those sites move.
- `openspec/specs/process-version-inspection/spec.md`: its Purpose names the
  change list in place of a JSON diff. A delta cannot reach a Purpose, so the
  apply phase rewrites it directly.

## Risks / Trade-offs

- [A schema key lands with no word] → The D5 coverage test fails, and the
  runtime fallback still prints the key.
- [A long description prints twice in an open row] → Rows stand folded. Only
  the author who opens one reads both paragraphs.
- [Hundreds of rows after an import] → Folded rows keep each entity to one
  line. The heading counts tell the size first.
- [Some browsers fire `onToggle` when an open row first paints] → The handler
  writes the set only on a real difference from `event.currentTarget.open`.
- [A reference id resolves on one side only] → Each side looks up its own
  body. An unresolved id prints raw.
- [An anchorless member moves within its list] → Its path anchor changes, so it
  reads as removed plus added. Only a hand-authored body holds such a member.

## Migration Plan

Nothing persists. The change ships with the web build, and a revert restores
the old list. No stored body, route or definition hash changes.

## Open Questions

None.
