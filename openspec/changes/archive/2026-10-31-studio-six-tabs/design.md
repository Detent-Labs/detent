# Design

## Context

See `proposal.md`, Why. The process surface is `screens/EditScreen.tsx`.
`routing.ts` owns the tab list, and `draft/process-tabs.ts` owns the counts
and the Checks hand-off. The facts that shape the approach:

<!-- antislop: allow synonym-rotation sentence-length -->
<!-- Why: "edit" names the edit route and "change" the change list, two concepts; the code spans also merge this bullet's three sentences into one count. -->
- The type `ProcessTab` is a union of eleven literals, and `PROCESS_TABS`
  orders them. Two maps, `PANEL_VIEWS` and `PANEL_VIEW_TAB`, resolve the
  retired `edit/panels/:view` addresses. The edit route carries `tab`,
  `formStepId` and `stepId`.
- Every tab body stays mounted, and `hidden` plus a compiled hidden style
  reveals one. `HeldDraft` freezes the matrix's draft while hidden.
  `ChangesView` fetched the base body on mount and reported its row count up
  through `onChangesCount`.
- The `⋮` menu's first group holds six things. They are the key, the base
  language, the cancellable checkbox, the two collaboration checkboxes,
  `AddLocaleControl` and the assignment-groups link. The flag
  `structureActive` disables the four draft-writing controls while the JSON
  surface is open.
- `PathsView.tsx` and `pathRows.ts` draw the Paths tab. The step page's Ways
  out section (`PathsPanel.tsx`) edits a step's paths, and `selectedPathId`
  highlights one row there.
- `ChangeList.tsx` takes an optional `onOpenRow`, draws an open command per
  row and reads its group headings off the `tabs.*` catalog keys. The
  Versions screen never passes `onOpenRow`.
<!-- antislop: allow synonym-rotation -->
<!-- Why: Cancel is the dialog's own control name, and a tab stop is a keyboard term; neither rotates the other. -->
- `PublishConfirmDialog` in `ProcessHeaderBar.tsx` prints a `<dl>` of facts.
  `useConfirmDialog` places the initial focus on Cancel and returns focus to
  the trigger.
- `FormTabStrip.tsx` is the plain-button tab set the sub-row mirrors. It
  has 14px pinned text and a 2px divider under the strip. Its open tab takes
  weight 800 and an accent inset mark.
- The pass floor is 5199. `studio-pathRows.test.ts` holds eight tests.

## Shape brief

This is the result of `/impeccable shape process surface`, run on
2026-10-31. The owner pre-approved every decision for stage 64 and asked for
no interview. The brief therefore states its assumptions instead of a
confirmation round. The mode is Operate.

1. **Job and audience.** A process author opens a draft to build or fix a
   process. They reach for steps and fields first, forms and checks next,
   and the process's own settings rarely. They read the tab row to find
   the place a job lives.
2. **Outcome and proof.** The author finds each job under one of six words
   in their own language. Nothing engine-shaped stands in the row. A path
   has one home, the step. A check lands them on the control it concerns.
   Evidence: the nine seeded processes, with `purchase_requisition` as the
   dense case.
3. **Selected direction.** The incumbent register stays. That is the ruled
   tab row, the accent mark under the open tab and the body under a 2px
   divider. The sub-row repeats the form tab strip's language one size
   smaller, so an author meets one tab vocabulary twice. Settings is a single column of
   labelled controls in sentences, the most form-like screen in the studio.
   Machine values stand one disclosure away, in a Developer view.
4. **Scope and boundaries.** In scope are the tab row, the sub-row and the
   Settings tab. So are the Fields tab's second view, the publish dialog's
   Changes row and the Versions screen's first comparison. The canvas, the
   step page, the field editor and the form editor stay untouched. So do
   the checks rail's own grouping and the header bar's row. Anti-goals: a
   side inspector, dense property rows, machine chips, counts on the
   sub-row.
5. **States and ranges.** Six tabs fit at 720px and scroll at 400px, where
   the fades stay. A sub-row has two or four entries. The Settings Process
   view holds six controls. The Changes row reads from zero to hundreds of
   rows, plus reading, failed and first-version states. The matrix keeps
   its empty states.
6. **Interaction and layout.** Tab order: tab row (one stop), the sub-row
   (one stop per entry), then the body. A view switch is a navigation, so
   Back returns to the last view. The Changes row's disclosure is a
   `<details>` inside the dialog, and the dialog scrolls when the list
   outgrows it. Below 64rem the entity rails stack as they do today.
7. **Constraints.** Strings come from the studio catalog. Mono only for the
   key, the process id and the change list's machine values. One primary
   action on the screen. The roving-tabindex row stays, per
   `spa-accessibility`.

## Goals / Non-Goals

**Goals:**

- Six tabs in the author's words, with every old address still landing.
- One home per subject. A path lives on its step, the matrix beside the
  catalog, and the process's own settings in one place.
- The change list stays reachable where a publish decision happens.

**Non-Goals:**

- Later changes of stage 64. Those are the step page's layout (10), the
  field card (11), the Checks grouping (12), the dialog component (13) and
  the header's two rows (14).
- A new tab set pattern. The sub-row follows the plain-button pattern the
  form tab strip already follows.
- Renaming "Canvas tab" in `studio-canvas` and the matrix requirements of
  `studio-app` that only name the old tab. A decisions entry tracks that
  spec sweep.

## Decisions

### D1. Tab identifiers, views and addresses

`ProcessTab` becomes `"map" | "steps" | "fields" | "forms" | "checks" |
"settings"`. The tab literal is the address segment, so `/edit/map` reads
as the row does. Keeping `canvas` as the literal would have printed an
address the row no longer names.

Two tabs carry views. `FieldsView` is `"catalog" | "matrix"`, and
`SettingsView` is `"process" | "sources" | "contract" | "access"`. The
union `TabView` joins them. A record `TAB_VIEWS` lists each tab's views,
empty for the other four.

The edit route gains `view?: TabView`. The writer `routePath` emits
`/edit/:tab/:view` when the route carries a view. The matcher accepts the
two-segment form only when the view belongs to the tab. Otherwise it drops
the view and keeps the tab.

`RETIRED_TAB_TARGET` maps each retired literal onto its new place:

| Retired literal | Target |
|---|---|
| `canvas` | `{ tab: "map" }` |
| `paths` | `{ tab: "steps" }` |
| `matrix` | `{ tab: "fields", view: "matrix" }` |
| `dataSources` | `{ tab: "settings", view: "sources" }` |
| `contract` | `{ tab: "settings", view: "contract" }` |
| `access` | `{ tab: "settings", view: "access" }` |
| `changes` | the `versions` route |

The `changes` literal maps onto the Versions screen, since the change list
lives there now. The record `PANEL_VIEW_TAB` becomes `PANEL_VIEW_TARGET`,
with the same values for the six panel names. The matcher consults both
maps before the plain tab match.

Alternative considered: a query parameter for the view. Rejected, since
every other sub-state of the edit route is a path segment.

### D2. The sub-row

`panels/SubRow.tsx` is one component for both tabs. It takes `views` (an
ordered list of `{ id, label }`), `open`, `onOpen`, `label` (the tablist's
accessible name) and `tab` (for the DOM ids). It renders a `tablist` of
`<button role="tab">` entries following the plain-button pattern. Each
entry is its own tab stop, and Enter and Space come from the button.

The open entry carries `aria-selected`, weight 800 and the accent inset
mark. The strip takes the form tab strip's tab style. That is 14px pinned
text, 8px by 12px padding, a hover wash and a 2px divider under the strip.
It scrolls sideways like that strip, so it pads `focus.reach` on both axes.
It prints no count.

Two exports name the ids: `subTabDomId(tab, view)` and
`subTabPanelDomId(tab, view)`, the `tabDomId` pattern one level down. Each
view body carries `role="tabpanel"`, `aria-labelledby`, and `hidden` with
the compiled hidden style, the tab body's own mechanism.

Alternative considered: an accordion, one section open at a time. Rejected
for this change: it has no address of its own, and D4 of the concept names
the Fields sub-row.

### D3. The Fields tab's views

`panels/FieldsTabViews.tsx` composes the sub-row and the two bodies. It
takes `view`, `onOpenView`, `token`, `visible` and `onShowStep`. The
Catalog body mounts `FieldsTab` with `visible = visible && view ===
"catalog"`. The matrix body mounts `HeldDraft` around `FieldMatrixPanel`
with `visible = visible && view === "matrix"`. The component is a column
flex. The sub-row comes first, then one body growing with `flex: 1 1 auto`
and `minHeight: 0`. The matrix therefore keeps the height rule it has today.

### D4. The Settings tab

`panels/SettingsTab.tsx` composes the sub-row and four bodies. It takes
`view`, `onOpenView`, `token`, `roles`, `processId`, `go`, `visible` and
`onUnauthorized`. The bodies are `ProcessSettingsPanel`, `DataSourcesTab`
(unchanged, `visible` gated the same way), `ContractPanel`, and
`AccessPanel` followed by the assignment-groups link.

`panels/ProcessSettingsPanel.tsx` is one column capped at 40rem, label
above control, 4px apart. Top to bottom:

1. Base language: a text input bound to `draft.baseLocale`. It writes
   through `resolveBaseLocaleChange` as the header bar does today, so a
   well-formed code moves the content locale.
2. The add-a-language control: `AddLocaleControl`, unchanged.
<!-- antislop: allow passive-voice -->
<!-- Why: the UI string names what a participant may do to a case; the string is the design decision. -->
3. A checkbox "A case can be cancelled while it runs", bound to
   `draft.cancellable`, checked when the key is absent.
4. A fieldset "Collaboration" with two checkboxes. They read "Participants
   can comment on a case" and "Participants can attach files to a case".
   They bind to `collaboration.comments` and `collaboration.attachments`,
   checked when absent.
5. A closed `<details>` Developer view, the step page's own style: the key
   input in the mono face and the process id.

No control takes `disabled` from `structureActive`. The Settings body is
hidden while the JSON surface is open, so no control there is reachable.
The assignment-groups link keeps its `btn btn-secondary` form and its
`go(areaHref("admin", "/groups") + "?processId=…")` target.

### D5. The header bar

The `⋮` menu keeps the Views group alone. The first group's markup, its
styles (`headerBarMenuGroupFirst`, `headerBarMenuRow`, `collaborationRow`,
`collaborationOption`, `collaborationCheckbox`, `visuallyHidden` where
unused) and the `changeBaseLocale` helper leave the file. The `go` prop
goes. `processId` stays for the publish dialog's process id. A new `token`
prop reaches the publish dialog's Changes row. `structureActive` stays, for
the JSON entry's label and nothing else.

### D6. The publish dialog's Changes row

`panels/PublishChanges.tsx` renders one `<dt>`/`<dd>` pair inside the
dialog's facts list. It takes `processId`, `token`, `baseVersion`, `draft`
and `contentLocale`. On mount it fetches the base body through
`getVersionBody`, the way `ChangesView` did. It holds one of four states:
idle, loading, loaded and failed. The rows come from `describeChanges` over
the stripped base and the draft, memoized on the loaded body and the draft.

The `<dd>` reads one sentence per state, from D10's keys. The states are
the first version, reading, a failure, no changes, one change and N changes.
With one or more changes a `<details>` follows the sentence.
<!-- antislop: allow synonym-rotation -->
<!-- Why: "Show" is the summary's own UI string from D10, and "surface" names the process surface. -->
Its `<summary>` reads "Show" or "Hide" by its open state, the two UI strings
of D10. Its
body mounts `ChangeList` with no heading of its own, since the sentence names
the version. The list scrolls in a box capped at `40vh`, so an open list keeps
the dialog's controls in view. The dialog style also gains `maxHeight: 85vh`
and `overflowY: auto` as a fallback.

The dialog mounts only while pending, so the fetch runs once per opening.
A failure never blocks the publish: the sentence states it, and the two
controls work as before.

### D7. The change list

`ChangeList` loses `onOpenRow`, `OPEN_COMMAND`, the open-command styles and
the `changeList.open.*` keys. `GROUP_HEADING` keeps reading `tabs.fields`,
`tabs.steps` and `tabs.forms`. The three groups whose tab is gone read new
keys. Those are `changeList.group.dataSources`, `changeList.group.paths` and
`changeList.group.contract`. `ChangesView.tsx` goes. So does
`useHeldWhileHidden`, if nothing else imports it. `holdWhileHidden` and
`HeldDraft` stay for the matrix.

### D8. Where a check lands

`tabForIssue` becomes `checkTarget(issue, steps)` in `process-tabs.ts`. It
returns `{ tab, view?, stepId?, pathId? }`:

- `step` → `{ tab: "steps", stepId }`.
- `timer` and `action` → `{ tab: "steps", stepId }` for the step whose
  timers or actions (at any of the five positions) carry that id.
- `path` → `{ tab: "steps", stepId, pathId }` for the step whose paths
  carry that id.
- `field` → `{ tab: "fields", view: "catalog" }`.
- `dataSource` → `{ tab: "settings", view: "sources" }`.
- `contract` → `{ tab: "settings", view: "contract" }`.
- `process` → `{ tab: "checks" }`.

A step, timer, action or path the draft no longer holds yields the tab with
no `stepId`. In `EditScreen`, `goToTab(tab, view?)` keeps its first argument
and gains the view. The canvas's `goToTab("steps")` call therefore stays as
the surface test pins it. The function `openTabFromRow` takes the target and
navigates with its view. It selects the step and the path through
`onSelectStep`. The pending-focus hand-off onto the tab button stays.

### D9. Counts

`processTabCounts(draft, issues)` returns six keys: `map: undefined`,
`steps`, `fields`, `forms`, `checks`, `settings: undefined`. The
`changesCount` state and `onChangesCount` leave `EditScreen`.
`checksBlocked` stays as it is.

### D10. Strings

| Key | Text |
|---|---|
| `tabs.map` | Map |
| `tabs.settings` | Settings |
| `fieldsViews.rowLabel` | Views of the fields |
| `fieldsViews.catalog` | Catalog |
| `fieldsViews.matrix` | Where fields appear |
| `settings.rowLabel` | Views of the settings |
| `settings.process` | Process |
| `settings.sources` | Where values come from |
| `settings.contract` | What it takes in and gives back |
| `settings.access` | Access |
| `settings.baseLocale` | Base language |
<!-- antislop: allow passive-voice -->
<!-- Why: the UI string names what a participant may do to a case; the string is the design decision. -->
| `settings.cancellable` | A case can be cancelled while it runs |
| `settings.collaborationLegend` | Collaboration |
| `settings.comments` | Participants can comment on a case |
| `settings.attachments` | Participants can attach files to a case |
| `settings.developerView` | Developer view |
| `settings.key` | Key |
| `settings.processId` | Process id |
| `settings.manageGroups` | Manage assignment groups for this process |
| `changeList.group.dataSources` | Where values come from |
| `changeList.group.paths` | Ways out |
| `changeList.group.contract` | What it takes in and gives back |
| `draftToolbar.publishDialogChanges` | Changes |
| `draftToolbar.publishDialogFirstVersion` | This publish mints the first version. |
| `draftToolbar.publishDialogChangesReading` | Reading version {version}… |
| `draftToolbar.publishDialogChangesFailed` | Could not read version {version}: {message} |
| `draftToolbar.publishDialogChangesNone` | No changes since version {version}. |
| `draftToolbar.publishDialogChangesOne` | 1 change since version {version}. |
| `draftToolbar.publishDialogChangesMany` | {count} changes since version {version}. |
| `draftToolbar.publishDialogChangesShow` | Show |
| `draftToolbar.publishDialogChangesHide` | Hide |

Keys that go: `tabs.canvas`, `tabs.dataSources`, `tabs.paths`,
`tabs.matrix`, `tabs.contract`, `tabs.changes`, `tabs.access`, every
`pathsView.*`, every `changesView.*`, every `changeList.open.*`,
`headerBar.menuGroupDraft`, `headerBar.keyCaption`,
`headerBar.baseLocaleCaption`, `headerBar.cancellable`,
`headerBar.collaborationLegend`, `headerBar.collaborationComments`,
`headerBar.collaborationAttachments` and `headerBar.manageGroups`. A
`{slot}` fills through a function replacement, so a `$` pattern prints as
written.

### D11. The Versions screen

The load effect runs `diffAgainstBase` once the versions and the draft have
arrived and `baseVersion` is not null. The control "Diff draft against
base" stays, so an author returns to the draft's changes after a
two-version comparison. The waiting line and the failure banner behave as
before.

### D12. Docs, glossary and roadmap

The glossary, `.claude/rules/ui-glossary.md`, changes in eight places:

- The tab row holds six tabs, and the tab list reads Map, Steps, Fields,
  Forms, Checks and Settings.
- A new "sub-row" row names the strip under the Fields and Settings tabs.
- The structure surface is the six tab bodies together.
- The `⋮` menu holds one group, Views.
- The rows for paths, changes, field matrix, contract, data sources and the
  Access tab point at their new homes.
- The Developer view row gains the Settings tab.
- The vocabulary table gains the contract row.
- The "Settings tab" and "Map tab" take rows of their own.

In `docs/authoring-guide.md`, section 1 lists the six tabs. Sections 2, 5
and 8 point at the new places. In `docs/browser-checks.md`, every entry that
names a retired tab or address moves to the new place. The context in
`openspec/config.yaml` names six tabs. `ROADMAP.md` marks change 9 shipped.

`docs/decisions.md`: the entry "The glossary and the live spec name the
Access tab differently" resolves and moves to `docs/decisions-archive.md`.
A new entry lists the spec sites that still say "Canvas tab" or "Field
matrix tab". A later spec sweep takes them. Those are `studio-canvas` and
five matrix requirements of `studio-app`. The five are the bulk toggles, the
toolbar, the legend, the empty result and the height.

### D13. Tests

- `studio-routing.test.ts` asserts six tabs in order. The view sub-state
  round-trips for every `TAB_VIEWS` entry. A view on a tab that holds none
  drops. Each retired literal lands on its target. Both `/edit/changes` and
  `/edit/panels/changes` match the versions route.
- `studio-processTabs.test.ts` asserts six counts. It covers `checkTarget`
  for every entity type. A path, a timer and an action resolve to their
  step, and a missing id yields the tab alone.
- `studio-processTabRow.test.tsx`: six tabs, the new order, `tabindex` over
  six, `tabs.map` and `tabs.settings` labels.
- `studio-processSurface.test.ts`: the six `tabPanel` calls; the menu slice
  holds `headerBar.menuGroupViews` and neither `menuGroupDraft` nor
  `AddLocaleControl`.
- `studio-changeList.test.tsx`: the open-command tests go; a test asserts no
  `button` with an open command renders.
- `studio-heldWhileHidden.test.tsx`: the `HeldDraft` match reads
  `FieldsTabViews.tsx`; the `ChangesView` assertion goes.
- New `studio-subRow.test.tsx`: `renderToStaticMarkup` of `SubRow` with two
  entries; `role="tablist"`, two `role="tab"` buttons each with
  `tabindex="0"` or no `tabindex`, `aria-selected` on the open one, the ids.
- New `studio-processSettingsPanel.test.tsx`: renders inside a hand-built
  `DraftProvider`; the five labelled controls; the key inside a closed
  `<details>`; no key outside it.
- New `studio-publishChanges.test.ts`: the pure sentence picker
  `changesSentence(state, baseVersion)` for every state.
- `studio-pathRows.test.ts` goes with `pathRows.ts`.

## Risks / Trade-offs

- Risk: the matrix loses height to the sub-row. Mitigation: the view body
  grows with `flex: 1 1 auto` and `minHeight: 0`. The browser check
  measures the grid reaching the tab body's bottom edge at 900px.
- Risk: the data sources grid declares `height: 100%` and may collapse
  inside a flex body. Mitigation: each Settings view body is a column flex
  with `flex: 1 1 auto` and `minHeight: 0`. The browser check covers the
  rail scrolling on its own.
- Risk: the publish dialog fetches the base body on every opening.
  Mitigation: one small GET per opening, and the sentence states the wait.
  The dialog never blocks on it.
- Risk: six tabs still scroll at 400px. Mitigation: the fade and scroll
  machinery stays as it is, and the spec scenarios name surviving tabs.
- Risk: deleting `studio-pathRows.test.ts` and the open-command tests
  lowers the pass count. Mitigation: the new tests add more than the eleven
  removed. The Verification task reads the pass count against the floor.
  It lowers the floor only if the run falls under it.
- Risk: a retired `tabs.*` key still has a reader somewhere. Mitigation:
  `bun run typecheck` fails on a missing `CatalogKey`, which is the check.
- Risk: other specs still say "Canvas tab" and "Field matrix tab".
  Mitigation: the decisions entry of D12 names every site for a later
  sweep.

## Migration Plan

No data migration. The change ships in one PR. An author on an old address
lands on the new place through D1's map. Rollback is a revert of the PR.

## Open Questions

- Whether the sub-row later takes a count per entry. The concept's D4 puts
  Sources on the Fields sub-row in change 11, which may want one. Nothing in
  this change depends on the answer.
