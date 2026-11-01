# Design

## Context

See `proposal.md`, Why. The step page is `panels/StepPage.tsx`, 923 lines.
The facts that shape the approach:

- The file `panels/sectionsFor.ts` names ten sections and splits them into
  two columns through `sectionColumns`. The file `panels/sectionIssues.ts`
  routes an issue to a section. It reads the entity id the issue names, or
  the body key its `loc` names (`LOC_SECTION`). Its `headingIssues` keeps the step-level
  issues for the heading. A row's own issue stays with `PathsPanel`, `TimersPanel` and
  `ActionListEditor`, which each mount an `IssueList` per row.
- The page renders every section open, each a `<section>` with an `<h3>`.
  The masthead holds the kicker, the name and the description. It also holds
  the kind control, the first-step mark and the Remove this step button. The
  Developer view is a native `<details>` at the page foot. The walk stands
  above it.
- `EditScreen.tsx`'s `stepsTab` grid reads `18rem minmax(0, 1fr)`. Below
  64rem it reads `minmax(0, 1fr)` with rows `auto minmax(0, 1fr)`. The page's
  own style sets `overflowY: "auto"`. The tab body (`tabBody`) scrolls too,
  with `focus.reach` padding. The rail caps itself at 20rem below 64rem.
- `KindSwitchDialog.tsx` and `RemoveFieldDialog.tsx` share one shape. A
  native `<dialog>` opens through `useConfirmDialog`. A `<dl>` holds the fact
  rows, notes follow, then an outlined `btn-secondary btn-destructive`
  confirm and a ghost Cancel that holds the initial focus. Each keeps its own
  copy of the dialog styles.
- `StepsRail.tsx` draws the check badge: a 2px `currentcolor` box around a
  mono count, refusal for a blocker and slate otherwise.
- `formCardRows.ts` exports `formCounts` and `formSizeText`.
  `shared/optionText.ts` exports `stepTextMap`, `plainStepTextMap` and
  `wayOutHeading`. `draft/guided-labels.ts` exports `assignmentWord` and
  `processLabel`.
- `EditScreen.tsx`'s `onSelectStep(stepId, pathId?)` sets `selectedPathId`.
  The canvas and `openTabFromRow` both call it. `onRemoveStep` filters the
  step out and moves `initialStep` to the first remaining step. It then
  focuses the rail's current row on the next frame.
- The detector baseline on `StepPage.tsx` is five advisory
  `design-system-font-size` findings, all `0.8rem`.
- The pass floor is 5199. `studio-sectionsFor.test.ts` holds twelve tests.

## Shape brief

This is the result of `/impeccable shape step page`, run on 2026-11-01. The
owner pre-approved every decision for stage 64 and asked for no interview.
The brief states its assumptions. The mode is Operate.

1. **Job and audience.** An author opens a step to set who acts, build its
   form and draw its ways out. They come from the rail, the Map or a Checks
   row. They want one question at a time, and a sign that a step
   is complete.
2. **Outcome and proof.** The author reads six headers and knows what the
   step holds without opening one. A done section says so. A section with a
   check says how many. The author opens one, works it, and the next header
   is one press away. Proof: `purchase_requisition`'s dense steps, and a
   fresh task step from the rail's foot.
3. **Selected direction.** The incumbent register stays: ruled rows, the
   Legend style for a name, body text for a summary. The check badge the rail
   already draws marks a count. The owner liked the Zapier pattern: a
   vertical list, one open at a time, a mark for done. Density is never the
   goal. The page caps its column at 52rem and the rail widens to 22rem.
   Machine values stand one disclosure away, in More.
4. **Scope and boundaries.** In scope: the page's layout, its headers, the
   open state, the More body and the dialog. The Steps tab's grid too.
   Untouched: the masthead's controls, the section bodies' own editors
   and the steps rail's rows. The walk, the form editor and the Checks tab's
   grouping stay too. Anti-goals: a side inspector, dense property rows,
   machine chips, a second column.
5. **States and ranges.** Zero to about twelve ways out. Zero to three time
   limits. A summary runs one line at 52rem and wraps after it. German runs
   40% longer, and the studio ships English only. The header states read
   done, to do, optional and checked. The dialog counts zero to about twenty
   incoming ways out.
6. **Interaction and layout.** Tab order: masthead controls, then one header
   per section, then the open body's controls, then the walk. Enter or Space
   on a header toggles it. The page opens on the section that needs the
   author first. Below 64rem the rail stands above the page, and the tab body
   scrolls both.
7. **Constraints.** Every string comes from the studio catalog, one key per
   sentence. Mono only for an outcome, a process id, a registry type and the
   Developer view. One primary action on the screen, which is Publish in the
   header bar. A header is a `<button type="button">` with `aria-expanded`
   and `aria-controls`, per `spa-accessibility`.

## Goals / Non-Goals

**Goals:**

- One subject at a time on the step page, with the rest folded.
- Every header says what its section holds and whether the author has
  finished it.
- A check result stands at its section, and the header counts it.
- Removing a step asks first, in the dialog form the studio already has.
- Two scroll boxes below 64rem, down from three.

**Non-Goals:**

- Later changes of stage 64: the field card (11), Checks by subject (12), the
  one dialog component (13) and the header's two rows (14). The dialog here
  copies the two existing ones; change 13 folds all three into one.
- Keyboard arrow navigation between headers. The headers are plain buttons in
  the tab order, the pattern the sub-row and the form tab strip follow.
- Changing a section body's own editor. `PathsPanel`, `TimersPanel`,
  `ActionListEditor`, `SubprocessSpecEditor` and `PluginEnvelopeEditor` move
  into a body as they are.

## Decisions

### D1. Eight section names, six at most per step

`SectionName` becomes `"assignment" | "form" | "subprocess" | "paths" |
"howItEnds" | "timers" | "lifecycle" | "more"`. The old `entry` and `exit`
merge into `lifecycle`. The old `cancellable` and `collaboration` fold into
`more`. `sectionsFor` returns, in reading order:

| Kind | Sections |
|---|---|
| participant | assignment, form, paths, timers, lifecycle, more |
| subprocess | subprocess, paths, timers, lifecycle, more |
| terminal | assignment, form, howItEnds, lifecycle, more |

`sectionColumns` goes. A new `sectionLabel(section, performedBy)` returns the
catalog key. `stepSections.lifecycle` reads "When entered or left", and
`stepSections.lifecycleEntryOnly` reads "When entered" on an end step. Every
other section keeps its key.

<!-- antislop: allow run-ons -->
<!-- Why: the sentence lists three body keys and two sections; the code spans read as clauses. -->
`sectionIssues.ts`'s `LOC_SECTION` maps `onEntry`, `onExit` and `onCancel`
onto `lifecycle`, and `cancellable` and `collaboration` onto `more`. The
entity-id claims for actions follow: an `onEntry`, `onExit` or `onCancel`
action belongs to `lifecycle`.

Alternative considered: keeping When entered and When left apart, for seven
sections. Rejected: the owner's D3 names six, and the two editors are one
subject, what happens around the step.

### D2. The header

Each section renders as:

```
<section>
  <h3 class=sectionHeading>
    <button type=button id=<headerId> aria-expanded aria-controls=<bodyId>>
      <span class=sectionName>Who acts</span>
      <span class=sectionSummary>A member of IT Ops</span>
      <span class=sectionMark>…</span>
    </button>
  </h3>
  <div id=<bodyId> role=region aria-labelledby=<headerId> hidden>…</div>
</section>
```

The button fills the row, flush left, with 12px block padding and a 2px
divider under the section. The name takes the Legend style. The summary
takes the body text, in ink on a done section and in slate otherwise. A mono
value inside it takes `fonts.mono` at the size around it. The summary wraps
after one line; nothing clips.

The mark is one of three. A section with open checks draws the check badge.
That is `fonts.mono`, 11px, weight 600, a 2px `currentcolor` box. It prints
in refusal where any counted issue blocks a publish and in slate otherwise.
Its `aria-label` reads the count and `stepsRail.issueMark` or `issueMarkOne`.

A done section without a check draws Lucide `Check` at 18px in slate. A
visually hidden "Done" (`stepPage.sectionDone`) stands beside the icon. That
word is also its `title`. The icon therefore stands in for a secondary word
beside the label. A section with nothing set draws no mark.

The button's accessible name is its text: the name, the summary and the
mark's word or count. That is what the owner's principle 6 asks the header to
say.

Alternative considered: a stamp reading DONE. Rejected: the owner dislikes
machine chips, and a stamp names a case's state rather than an author's
progress.

### D3. The summary and the state

A new pure module, `panels/stepSummaries.ts`, exports:

- `type SectionState = "done" | "todo" | "optional"`.
- `sectionSummary(section, input)`. It returns `{ text, mono, state }`.
  `input` carries the step, the draft, the fields, the steps, the processes,
  the content locale and the base locale.
- `defaultOpenSection(sections, counts, states, selectedPathId)`. It returns
  a `SectionName` or `undefined`.

The summary and the state per section:

<!-- antislop: allow passive-voice -->
<!-- Why: the table's "Done when" column states a draft condition, and the draft has no actor. -->
| Section | Text | Done when | Else |
|---|---|---|---|
| assignment | the `assignmentWord` text, mono as it says | the step holds a strategy | todo on a task step, else optional |
| form | `formSizeText(...)` or `formsTab.miniatureEmpty` | a field entry counts | optional |
| subprocess | `processLabel` of the called process, else its id in mono, else `stepSummary.processNone` | the spec holds a `processId` | todo |
| paths | every `wayOutHeading` joined with ", ", else `stepSummary.pathsNone` | one path or more | todo |
| howItEnds | the outcome in mono, else `stepSummary.outcomeNone` | the step holds an `outcome` | todo where `draft.contract.outcomes` is non-empty, else optional |
| timers | `stepSummary.timersNone`, `timersOne` or `timersMany` | one timer or more | optional |
| lifecycle | `stepSummary.actions`, `actionsEntryOnly` on an end step, else `actionsNone` | one action or more | optional |
| more | the override words joined with ", ", else `stepSummary.moreDefaults` | the step holds `cancellable`, `collaboration.comments` or `collaboration.attachments` | optional |

The override words come in three pairs:

- `stepSummary.cancellableYes` or `cancellableNo`
- `commentsOn` or `commentsOff`
- `attachmentsOn` or `attachmentsOff`

The lifecycle counts are numerals: `onEntry.length`, and `onExit.length` plus
`onCancel.length`. A `{slot}` fills through a replacer function, so a `$`
pattern in a label prints as written.

`defaultOpenSection` answers in order. First `paths`, where `selectedPathId`
holds a value and the sections hold `paths`. Then the first section whose
count is above zero. Then the first section whose state is `todo`. Then the
first section. A section's count is the length `issuesBySection` holds for
it.

Alternative considered: a per-section component with its own summary logic.
Rejected: the pure module tests without a DOM, the way `formCardRows.ts`
does.

### D4. The open state

`StepPage` holds `openSection: SectionName | undefined` in state. Its initial
value is `defaultOpenSection(...)`. The page remounts per step through its
`key`, so a new step recomputes it. An effect watches `selectedPathId`: when
it takes a value, the state moves to `paths`. A header press sets its own
section, or `undefined` when it was open.

Every body renders. The closed ones carry `hidden` with a compiled
`display: none` style, the tab body's own mechanism. A body therefore keeps
its half-typed state across a fold, such as `PathsPanel`'s new-target
select. The sections wrapper keeps `role="group"` and
`aria-label={t("stepPage.sectionsLabel")}`.

Alternative considered: unmounting a closed body. Rejected: the subprocess
body holds a loaded child and a file input, and a fold would drop both.

### D5. The body and its checks

The body prints `IssueItems` over the section's step-level issues first,
then the controls. The step-level issues are `headingIssues(...).get(section)`
as today. A row's own issue stays at its row, drawn by the editor that owns
the row. The header's count reads the length of
`issuesBySection(step, validation.issues, sections).get(section)`, which
covers both. The masthead keeps `mastheadIssues` as today.

The `more` body holds three things in order. First the cancelling `<label>`
and its select, where the kind carries `cancellable` (task and subprocess).
Then the two `CollaborationControl`s, where the kind carries them (task and
end). Then the Developer view `<details>` as today.

The `lifecycle` body holds the `onEntry` editor. On a task or subprocess step the `onExit` and
`onCancel` editors follow. The other bodies are today's section bodies,
unchanged.

The terminal note `stepSections.terminalNoPathsOrTimers` stays under the
sections, and the walk follows it. The Developer view loses its own 2px top
rule and foot padding. More's section rule and the page's own padding frame
it now.

### D6. The layout

`StepPage`'s `page` style keeps `overflowY: "auto"` by default and sets
`"visible"` under `NARROW`, so the tab body scrolls the page below 64rem. The
`scrollPaddingBlock` stays. A new `column` wrapper caps at `52rem` and sits
flush left. It holds the masthead, the sections and the walk. The Ways out
row holds the widest control, the condition builder's three-control row.
52rem leaves it one line at the body size.

`EditScreen.tsx`'s `stepsTab` grid reads `"22rem minmax(0, 1fr)"`. Under
`NARROW` the rows read `"auto auto"`. The page then takes its content's
height, and the tab body scrolls. Below 64rem the rail keeps its 20rem cap.
It keeps its own scroll too. `studio-guidedSurfaceStyle.test.ts` gains an assertion on the
page's `overflowY` pair, beside the rail's cap assertion.

RAIL-6 resolves with the rail's width at 22rem. The 60-character label from
the browser check wraps to two lines. The page column still clears 52rem
from 1200px up. RAIL-7 resolves with the page's own scroll box gone below
64rem.

Alternative considered: a proportional rail, `minmax(18rem, 1fr)`. Rejected:
`studio-step-page` and `DESIGN.md` both call a rail a fixed-width column.

### D7. The removal dialog

`panels/RemoveStepDialog.tsx` copies `KindSwitchDialog.tsx`'s shape. It
keeps its own dialog styles and calls `useConfirmDialog(triggerRef)`. It
holds a heading, a `<dl>` of fact rows, notes, the outlined confirm and the
ghost Cancel with `autoFocus`. Its props are `label`, `reach`, `triggerRef`,
`onCancel` and `onConfirm`.

`draft/stepRemoval.ts` exports `stepRemovalReach(draft, stepId, fields)`. It
returns `{ incomingPaths, formFields, isInitial }`. `incomingPaths` counts
every path of another step whose `to` is the step. `formFields` is
`formCounts(step, fields).fieldCount`. `isInitial` reads
`draft.workflow.initialStep === stepId`.

The dialog's heading reads `removeStep.heading` with the step's resolved
label, or `steps.unnamedStep`. The facts: `removeStep.stepTerm` with the
label, then `removeStep.incomingTerm` and `removeStep.formFieldsTerm` where
their counts are above zero. The notes: `removeStep.noUndo` always,
`removeStep.incomingNote` where `incomingPaths` is above zero, and
`removeStep.firstStepNote` where `isInitial` holds. Confirm reads
`removeStep.confirm`; Cancel reuses `fieldCatalog.removeDialogCancel`.

The masthead's Remove this step button takes `btn btn-secondary
btn-destructive`. It stores itself in a `removeTriggerRef` and sets a
`removing` flag that mounts the dialog. Confirm calls `onRemoveStep(step.id)`
and clears the flag. `onRemoveStep` keeps its focus hand-off to the rail's
current row. That hand-off lands after the dialog's own cleanup returns
focus to the unmounted trigger.

The dialog opens on every press, reach or none. The studio has no undo, and
the owner's D7 asks one dialog form for every destructive action.

### D8. Strings

| Key | Text |
|---|---|
| `stepSections.lifecycle` | When entered or left |
| `stepSections.lifecycleEntryOnly` | When entered |
| `stepSections.more` | More |
| `stepSummary.pathsNone` | No way out yet |
| `stepSummary.timersNone` | No time limit |
| `stepSummary.timersOne` | 1 time limit |
| `stepSummary.timersMany` | {count} time limits |
| `stepSummary.actionsNone` | No actions yet |
| `stepSummary.actions` | {entered} when entered, {left} when left |
| `stepSummary.actionsEntryOnly` | {entered} when entered |
| `stepSummary.outcomeNone` | No outcome yet |
| `stepSummary.processNone` | No process chosen yet |
| `stepSummary.moreDefaults` | Follows the process settings |
| `stepSummary.cancellableYes` | Cancellable here |
| `stepSummary.cancellableNo` | Not cancellable here |
| `stepSummary.commentsOn` | Comments on |
| `stepSummary.commentsOff` | Comments off |
| `stepSummary.attachmentsOn` | Attachments on |
| `stepSummary.attachmentsOff` | Attachments off |
| `stepPage.sectionDone` | Done |
| `removeStep.heading` | Remove “{step}”? |
| `removeStep.stepTerm` | Step |
| `removeStep.incomingTerm` | Ways out leading here |
| `removeStep.formFieldsTerm` | Fields on its form |
| `removeStep.firstStepNote` | This is the process's first step. The first remaining step takes its place. |
| `removeStep.incomingNote` | The ways out leading here stay, and the checks report them. |
| `removeStep.noUndo` | The studio has no undo. |
| `removeStep.confirm` | Remove the step |

Keys that go: `stepSections.entry`, `stepSections.exit`,
`stepSections.cancellable` and `stepSections.collaboration`. The Who acts
summary reuses `assignment.none` ("Nobody in particular") and the form
summary reuses `formsTab.miniatureEmpty`. The lifecycle counts print as
numerals, so "2 when entered, 0 when left" is a full sentence from one key.

### D9. Tests

- `studio-sectionsFor.test.ts`: the three ordered lists of D1 and the
  `STEP_KEY_SECTION` map. That map puts `cancellable` and `collaboration` on
  `more` and the three action lists on `lifecycle`. The test also covers
  `sectionLabel`'s two lifecycle keys and the fresh-array case. The
  `sectionColumns` block goes.
- `studio-sectionIssues.test.ts`: an `onEntry`, `onExit` and `onCancel`
  action land at `lifecycle`; a `cancellable` loc lands at `more`.
- New `studio-stepSummaries.test.ts`: every row of D3's table, the mono
  flag, the three states, and `defaultOpenSection`'s four answers.
- New `studio-stepRemoval.test.ts`: `stepRemovalReach` counts two incoming
  paths from two steps and ignores the step's own paths. It counts form
  fields as `formCounts` does, and reads `isInitial`.
- `studio-stepPage.test.tsx`: six `<h3>` headers in D1's order per kind.
  Each is a `<button type="button">` with `aria-expanded` and
  `aria-controls`, and exactly one reads `aria-expanded="true"`. The
  default-open cases read off the rendered state. A closed section's body
  carries `hidden`.
- `studio-stepPage.test.tsx`, continued: the Done mark and the badge stand in
  the header. The Developer view stands inside the last body. The Remove
  control carries `btn-destructive`. A step-level issue prints once, inside
  its body. The two-column block goes.
- `studio-guidedSurfaceStyle.test.ts`: the page's `overflowY` reads `auto`
  by default and `visible` under `NARROW`; the `stepsTab` grid reads 22rem
  and `auto auto` rows.
- `studio-panels-literal-text.test.ts` stays green: every string is a key.

### D10. Docs, glossary and roadmap

`.claude/rules/ui-glossary.md` changes in four places. The section row reads
"one subject group on the step page, one of six, open one at a time". The
sentence on two columns of open sections reads "Its accordion of sections
takes the place of one". The Developer
view row says the step page's stands inside More. A new "section header" row
names the button.

`docs/authoring-guide.md`: sections 4 to 7 name the sections as the headers
read, and section 7 says "Who acts" for "Assignment".

`docs/browser-checks.md`: a new entry walks the accordion, the default open
section, the badge, the dialog and the 420px layout. The steps rail entry's
420px line stays true.

`docs/decisions.md`: RAIL-6 and RAIL-7 move to `docs/decisions-archive.md`
word for word. Each gains a resolution line naming this change. The entry
"Remove step and the field catalog's Remove field trigger have no destructive
treatment" gains a line too. It says the Remove step half resolved here and
the field catalog half stays. A new section "Open from studio-step-accordion"
takes what the browser check finds. `ROADMAP.md` marks change 10 shipped.

## Risks / Trade-offs

- Risk: a long Ways out summary pushes the header to three lines on a dense
  step. Mitigation: the summary wraps and clips nothing. The browser check
  reads `purchase_requisition`'s densest step at 1440px and 420px.
- Risk: a hidden body's `IssueList` rows are invisible, so an author misses
  a check. Mitigation: the header counts every issue of the section, and the
  Checks tab lists them all.
- Risk: the dialog's cleanup focuses the unmounted trigger before the rail
  row takes focus. Mitigation: `onRemoveStep`'s `requestAnimationFrame` runs
  after the cleanup, the order `KindSwitchDialog` already relies on. The
  browser check reads `document.activeElement` after a confirm.
- Risk: four retired `stepSections.*` keys still have a reader. Mitigation:
  `bun run typecheck` fails on a missing `CatalogKey`.
- Risk: the rail at 22rem narrows the page at 64rem to about 40rem.
  Mitigation: the condition builder's row wraps by design, and the browser
  check reads it at 1024px.
- Risk: `studio-sectionsFor.test.ts` loses its `sectionColumns` tests and the
  pass count drops. Mitigation: the new summary and removal tests add more
  than the four removed. The Verification task reads the count against the
  floor.

## Migration Plan

No data migration. The change ships in one PR. Rollback is a revert of the
PR. The address `/edit/steps` and the form editor's `/edit/form/:stepId`
stay as they are.

## Open Questions

- Whether a header later takes arrow-key navigation between sections. The
  sub-row and the form tab strip stay plain buttons too, so a later change
  decides all three at once. Nothing here depends on the answer.
