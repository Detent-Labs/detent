## Context

See `proposal.md` for the motivation. Every path below under `panels/` or
`screens/` starts at `packages/web/src/areas/studio/`. The measurements
come from a production bundle on 2026-09-13, on the IT Offboarding draft.
The UI code then matched `main`.

### The shell header

The file `Chrome.tsx` lays the header out as one flex row. The register tab
comes first, then the area's `nav` element, then the account group. The
`header` style sets `flexWrap` to `"nowrap"`, and to `"wrap"` under
`@media (max-width: 30rem)` alone. The `accountGroup` style pushes the group
to the trailing edge with `marginLeft: "auto"`. The `accountName` style
gives the identity span a `6rem` floor and an ellipsis.

The file `navStyles.ts` holds the one `nav` style that all four area roots
import. It sets `flex: 1` and never wraps its buttons. Two of its rules read
the same 30rem condition, `order: 3` and `flexBasis: "100%"`. Below 30rem
they move the nav under the register tab and the account group. The
profile page's own 30rem rule belongs to its register, which this change
leaves alone.

In the studio the header needs 627px once the identity span reaches its
floor. From 627px down to 480px nothing relieves it. At 560px the Account
button clipped by 66.5px, and the page scrolled sideways.

The admin nav holds up to eight buttons with icons, and the app nav four.
This change's first review measured a replica of today's header in Chrome
152. The admin replica overflowed from 1200px in English and from 1300px in
German. The English app replica held one line at 900px. It first overflowed
between 800 and 900px. The `.btn` class sets no `white-space: nowrap`, so the
app's multi-word labels wrap inside their buttons.

### The form editor

The file `FormEditorScreen.tsx` declares `PREVIEW_NARROW` as
`"@media (max-width: 64rem)"`. Two styles read it. The `formEditorBody` grid
drops its third column under it. The `formEditorPreview` style then spans
the preview across both remaining columns.

The file `FormPreview.tsx` declares its own `NARROW` with the same query.
Its `pane` style reads it to move the 2px divider from the leading edge to
the top edge. No other file reads either constant. Seven studio files each
declare a 64rem constant of their own.

On the `full_name` card of "Submit the Exit Notification", the key read on
one line down to 1250px in three columns. It first wrapped between 1245px
and 1250px. At 1100px the canvas column measured 466px, and the key took
nine lines. At 1024px the preview dropped under the canvas, which widened to
742px.

### The tab row

The file `ProcessTabRow.tsx` lays out a `tablist` of ten buttons in one row
that scrolls sideways. The row's content measures 968px. The row sits 12px
in from each window edge, so it overflows in any window under about 992px.
Nothing in the component scrolls the row. A draft opened at `/edit/forms` in
a 400px window left the Forms tab wholly out of view.

Commit `a2f551fe` added `focusTabButton` to `EditScreen.tsx`, as ruling R16
of `changes-tab-entity-change-list`. It focuses a tab's button, then calls
`scrollIntoView({ block: "nearest", inline: "nearest" })` on it. Both paths
of `openTabFromRow` call it: a target tab already open, and the pending
focus after a tab switch. A row command's focus hand-off is its one caller.
A load, an address, a click, an arrow key and a resize all bypass it.

The keyboard model is roving tabindex. The open or focused tab holds
`tabindex="0"`, and the other nine hold `-1`. The left and right arrow keys
move focus with `focus()`. The handler calls `preventDefault`, so the row's
own arrow-key scroll stays off. The file `studio-processTabRow.test.tsx`
pins the stops, the roles, the counts and the live region through static
markup.

A probe in Chrome 152 measured three facts this design rests on. A plain
`focus()` on a tab clipped by 4px moved nothing. A `focus()` on a hidden tab
centered it. A `scrollIntoView` with `inline: "nearest"` honored a 24px
`scroll-padding-inline` on the row, stopping 24px from the edge.

### The owner's picks

The owner chose on a mockup built from these measurements. The block below
copies the picks verbatim from the program record.

Mockup: <https://claude.ai/code/artifact/4684be5f-0c00-485e-b965-5a3ec70bf24b>

```text
- E1: shell header (`Chrome.tsx` `header`) wraps at every width, so below its 627px minimum the account group moves to a second line.
- F1: form editor `PREVIEW_NARROW` rises from 64rem to 80rem (1280px); measured, keys fit on one line in three columns down to 1250px.
- G2: FORMS-15 stays as is; the entry moves to decided/not built with the reason: the studio targets a desktop, and canvas and field matrix need the edit screen's fixed frame.
- H1: `ProcessTabRow.tsx` scrolls the open tab into view on load and on every change, and shows edge fades where more tabs lie beyond the row's edge; the row stays one line.
```

## Goals / Non-Goals

**Goals:**

- The studio's header keeps every item inside the window from 1440px down
  to 400px, in either locale.
- No header in another area overflows at a width where it fits today.
- The `full_name` key in the form editor reads on one line at 1100, 1280 and
  1300px.
- The open tab stands whole in the tab row's view after every way a tab
  opens, at any width.
- An author sees at a glance that more tabs lie past an edge of the row.
- One function scrolls the tab row, whatever asks for the scroll.

**Non-Goals:**

- A phone layout for the studio. The Forms tab grid keeps its own scroll
  box, and the process list table keeps its width.
- A nav that wraps its own buttons. NAV-1 records where a nav still
  overflows.
- The form editor below 1024px, which stays as it stands and unmeasured.
- A tab row that wraps (H2), or an overflow control after the last tab.
- A fixed breakpoint for the header (E2).
- A right-to-left row. Both shipped locales read left to right.
- A new catalog key or a new token.

## Decisions

### Shape brief

The brief below follows the headings of `/impeccable shape`, with the picks
E1, F1, G2 and H1 as the fixed direction.

- **Job and audience.** An author builds a process in a laptop window or a
  narrowed one. An actor in any area may open the app at a phone's width.
  The header must keep its controls in reach. The form editor must keep a
  key legible, and the tab row must keep the open tab in sight. The mode is
  Operate.
- **Direction.** The incumbent world from `DESIGN.md` stays. The one new
  visual is the edge fade, a cue with no color of its own.
- **States and ranges: the header.** One line from 1440px down to the
  header's minimum, 627px in the studio. The identity span shortens first,
  down to its 6rem floor. Below the minimum the account group takes a second
  line. At 30rem and below, the nav takes a line under the register tab and
  the account group. A nav wider than its line still overflows, as NAV-1
  records.
- **States and ranges: the form editor.** Three columns above 1280px. Two
  columns from 1280px down, with the preview under the palette and the
  canvas. Below 1024px the layout stays as it stood.
- **States and ranges: the tab row.** No fade in a window of about 992px or
  more. Below that, a fade at each edge with tabs past it. The open tab
  stands whole in view. At each edge the row can still scroll past, the tab
  keeps 32px clear, outside the 24px fade.
- **Layout and interaction.** The header's second line keeps the account
  group at the trailing edge. The form editor's preview keeps its own
  scroll-free pane under the canvas. The tab row jumps to the open tab and
  never moves under a pressed pointer.
- **Accessibility: the tab row.** The row stays one tab stop with arrow
  keys. Each arrow-key move, each hand-off and each Tab-key entry lands its
  tab in view. The fade does not add a node. Nothing animates, so reduced
  motion does not need a branch. Under forced colors the fade drops and the
  scrollbar stays.
- **Accessibility: the header.** A wrap above 30rem keeps the reading order.
  At 30rem and below the nav stands under the account group while focus
  reaches it first. The kept `order` rule already has that mismatch.
- **Constraints.** Components read roles from `tokens.stylex.ts`. The fade
  width, the scroll padding and the line gap sit on the 4-point scale, at
  24px, 32px and 12px. The detector hook stays silent in a worktree without
  the skill folder.
- **Risks.** A scroll under the pointer would lose a click, so the scroll
  waits for the open tab. A growing identity span would widen its tooltip,
  so the `title` moves inward.

### The header wraps, and the identity span shortens first (E1)

The `header` style sets `flexWrap: "wrap"` with no media condition. Wrap
alone breaks the line too early. A flex line breaks on each item's content
width, and the account group's content width includes the whole name. A
replica of the studio header in Chrome 152 broke its line near 700px with
wrap alone.

Three style changes keep the floor in that decision instead:

- The `accountName` style sets `contain: "inline-size"`. The actor's name
  then adds nothing to the group's content width, and the 6rem floor counts
  alone.
- The `accountName` style also sets `flexGrow: 1` and `textAlign: "end"`.
  The identity span takes the room its line leaves, and its text sits
  against the Account button.
- The `accountGroup` style sets `flexGrow: 1` in place of
  `marginLeft: "auto"`. The `nav` style drops `flex: 1`, so the account
  group alone takes a line's free room.

The same replica then held one line down to 620px, with the name cut to an
ellipsis. It moved the account group to a second line at 600px. At 400px it
held two lines, where wrap alone held three.

A growing identity span would raise its `title` tooltip anywhere in the free
room. The `title` therefore moves onto an inner span, which holds the actor's
name alone.

The second line looks like this:

- The header's `gap` of `space.s3` spaces the lines 12px apart as well.
- The account group fills its own line. The identity span and the Account
  button sit flush with the trailing edge.
- The register tab and the nav stay flush left on the first line.
- The muted background and the 2px divider span the whole header. The
  divider runs under the last line.
- Focus order and reading order follow the DOM, and a wrap leaves the DOM
  as it stands.

Rejected: wrap alone, one declaration. It breaks every area's header above
its minimum, by the part of the name the floor would hide. Rejected: a fixed
breakpoint at 48rem (E2). A German label or a new nav button would move the
minimum again.

### The area nav keeps one line

The `nav` style drops `flex: 1` and gains no `flexWrap`. All four roots share
it. A nav wider than its line therefore still overflows, in the app, admin
and reporting areas.

The first proposal of this change wrapped the nav's own buttons too. That wrap
restyles every area's header, and the owner's mockup showed the studio alone.
The program shows the owner a mockup before any visible decision, so the
wrap leaves this change. That wrap grew the German admin header to 239px at
400px on the review's replica.

The review also measured E1 alone on the replica. No area regressed against
today. The English app header at 400px overflowed by 22px, as it does today.
The English admin header at 600px overflowed by 297px, down from 610px. A new
section of `docs/decisions.md` records the rest. It reads:

```text
## Open from the studio-narrow-widths review (each needs its own OpenSpec change)

The first review of `studio-narrow-widths` measured the shell header on a
replica in Chrome 152, on 2026-09-13. That change wraps the header and keeps
each area nav's buttons on one line. The NAV tags are local to this section.

- **NAV-1: an area nav wider than its line still overflows the header.** The
  shared `nav` style never wraps its buttons
  (`packages/web/src/shell/navStyles.ts:<nav block line>`).
  - On the replica, the English admin nav overflowed below about 900px. At
    600px the admin header overflowed by 297px, down from 610px before that
    change.
  - At 400px the English app nav, four buttons wide, overflowed its own line
    by 22px, as it did before. German labels widen both navs.
  - The reporting nav holds five buttons on a view route, and stays
    unmeasured.
  - A wrap of the nav's buttons restyles the app, admin and reporting
    headers. The owner picks its look on a mockup first.
  - Risk (Low): an actor in a narrow window scrolls the page sideways to
    reach a nav button.
```

The two 30rem rules stay. At 30rem and below, the register tab and the
account group share the first line. The nav takes the line under them.

### The form editor turns at 80rem (F1)

The file `FormEditorScreen.tsx` raises `PREVIEW_NARROW` to `"@media
(max-width: 80rem)"`. The file `FormPreview.tsx` renames its constant to
`PREVIEW_NARROW`, with the same value. Its divider then turns with its host,
and a search for the name finds both. A new test fails on any other value in
either file.

Above 80rem, at 1300px, the editor keeps three columns. Those are the 16rem
palette, the canvas and a preview of at most 22rem. The measured key read on
one line down to 1250px.

At 80rem and below, the editor keeps two columns, the palette and the
canvas. The preview spans both, under them, with the 2px divider on its top
edge. At 1100px the canvas takes about 818px. The key read on one line at
1024px, with 742px.

Two comments in `FormEditorScreen.tsx` tie the turn to the step page and the
entity tabs. Those still turn at 64rem, so both comments change with the
value.

Two base requirements of `studio-form-editor` change with the turn. "A live
participant preview stands beside the form canvas" keeps the preview beside
the canvas above 80rem alone. "The form editor renders from compiled styles"
drops its match at the turn's width. The `unified-shell` migration
requirements drop theirs for the header the same way.

Rejected: F2, a card that stacks its key over its marks through a container
query. It keeps the preview beside the canvas. Its price is taller cards and
a first container query in this file. The owner chose F1.

### The Forms tab grid stays (G2)

The code stays as it stands. The record in `docs/decisions.md` moves
FORMS-15 into its `Decided, not yet built` section, as its last top-level
bullet. That section already records one decided refusal, "The Player stays
rejected", as a sub-bullet. The entry takes the owner's reason. It also
records the process list table from `process-list-create-once`'s audit,
which overflows at 480px and below. The entry reads:

```text
- **The studio stays a desktop tool at phone width.** The owner decided
  this on 2026-09-13, as pick G2 of `studio-narrow-widths`. This entry
  replaces FORMS-15.
  - Measured that day at 400x800, before `forms-card-legend`, the Forms tab
    grid scrolled a 394px box over 1740px of cards. That change's final
    review put its two-line legend there at about 52px. The box then shrinks
    to about 342px.
  - Measured the same day, the process list table keeps its width at 480px
    and below. The page scrolls sideways to its action column. The audit of
    `process-list-create-once` found it.
  - Both stay: the studio targets a desktop, and the canvas and field matrix
    need the edit screen's fixed frame. A touch audience would reopen both.
  - This entry does not decide FORMS-18 in the Forms tab audits section. A
    200% zoom on a desktop window is no phone width.
```

### One function scrolls the tab row (H1)

The file `ProcessTabRow.tsx` exports `scrollTabIntoRow(button)`. It calls
`scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant"
})`, the call from `a2f551fe` plus the behavior key. Five callers use it,
and no other code scrolls the row:

1. A layout effect on `open`, which runs on mount and on every tab change.
2. The row's resize observer, under the two conditions its section below
   names.
3. The arrow-key handler, right after its focus move.
4. Each tab's `onFocus` handler, when the button matches `:focus-visible`.
5. The function `focusTabButton` in `EditScreen.tsx`, in place of its own
   `scrollIntoView` line.

Each focus move passes `{ preventScroll: true }`. The probe found that a
plain `focus()` leaves a tab clipped by a few pixels, which R16 had also
met. The function alone then decides where the row stands.

The row sets `scrollPaddingInline: space.s8`. The scroll then stops 32px
clear of each edge. A tab's focus ring reaches 4px past its button, so the
ring stays outside the 24px fade. At the first or the last tab the scroll
clamps, and no fade stands at that edge.

Why `scrollIntoView` over a computed `scrollLeft`: it reuses the call R16
proved, and the platform clamps and aligns. A computed position would need
its own helper for the padding, the clamp and a tab wider than the view.

Why a layout effect: a passive effect would paint the row at its start for
one frame, then jump.

Why a focus scroll for the keyboard alone: a mouse press focuses its button
on `mousedown`. A scroll then would move the button before `mouseup`, and
the click would miss it. Chromium, Gecko and WebKit match no pointer press
against `:focus-visible`. The `onFocus` call therefore skips a press.

A Tab-key entry does match that pseudo-class. The probe found that a native
focus leaves a clipped tab where it stands, so that entry needs the call. A
native focus centers a wholly hidden tab, so only a partly clipped one shows
the call working.

Why a width change as well: the pick names load and every tab change.
Narrowing a window with Forms open would still strand the tab out of view.

A count change can move the open tab too. The Changes tab prints its count
once `getVersionBody` resolves, after the first scroll. The Checks and Field
matrix counts move once `useRegistry`'s fetch resolves. A tab ahead of the
open tab then widens, and the open tab slides while `scrollLeft` stays.

The `onScroll` handler records whether the open tab rests in view. It rests
there when its box stands inside the view. The box must also stand clear of
the scroll padding at each edge the row can still scroll past. At an edge
where `scrollLeft` sits at its limit, 0 or `scrollWidth − clientWidth`, the
padding counts as met. A 1px tolerance applies, as in `fadeState`.

Each call the component makes to `scrollTabIntoRow` updates the record too,
whether or not the row moved. A call that moves nothing fires no `scroll`
event. When a button's width changes while that record reads true, the
observer calls `scrollTabIntoRow`. The callback updates the record once it
has acted. A tab the author scrolled out of view by hand stays where it is.
The tab row entry's twelfth browser step widens a tab after a tab change that
moved nothing.

The file `ProcessTabRow.tsx` exports a pure
`tabRestsInView(tabStart, tabEnd, scrollLeft, clientWidth, scrollWidth, padding)`.
The row sets `position: relative`, so a button's `offsetLeft` already reads
against the row's content. The component reads `padding` from the row's
computed `scrollPaddingInlineStart`, so the record and the scroll share one
value.

The call `scrollIntoView` also scrolls an ancestor that hides the row. The
probe saw it bring a row back into a scrolled document. This screen's
document did not scroll at 400x800, so no ancestor moves in practice.

The scroll jumps. The Still Page Rule in `DESIGN.md` says a state changes at
once. Reduced motion therefore does not need a branch of its own.

### The edge fade is a mask on the row (H1)

The file `ProcessTabRow.tsx` exports a pure `fadeState(scrollLeft,
clientWidth, scrollWidth)`. It returns `"none"`, `"start"`, `"end"` or
`"both"`. The leading edge fades once `scrollLeft` passes 1px. The trailing
edge fades while more than 1px of content lies past the view. That 1px
absorbs a fractional `scrollLeft` on a high-density screen.

The component keeps the value in `useState`. It picks one of three named
styles from it: `fadeStart`, `fadeEnd` or `fadeBoth`. The row's `onScroll`
handler recomputes the value. React skips the component's next pass while
the string holds.

One `ResizeObserver` watches the row and its ten buttons. A window resize
moves the row's width, and a count's digits move a button's. Its callback
recomputes the fade value and writes the band height below. It calls
`scrollTabIntoRow` when the row's own width moved. It also calls it when a
button's width moved while the record above reads true. The callback reads
the open tab from a ref, which the layout effect on `open` updates. One
observer then serves every tab.

The cost stays small. A scroll event fires at most once a frame. It reads
three numbers, and the open tab's box against the row's. React runs the
component again only when the value flips, at most twice in one sweep of the
row. The observer fires on a size change alone, and no layout read runs
during a React pass.

Each named style sets `maskImage` to two layers. The first is a horizontal
gradient, transparent at a fading edge and opaque `space.s6` in from it. The
second is a solid layer. The row's own style sizes the first layer to the
band and the second to the rest:

- `maskSize: "100% var(--tab-row-band, 100%), 100% calc(100% - var(--tab-row-band, 100%))"`
- `maskPosition: "top, bottom"`
- `maskRepeat: "no-repeat"`

The band is the row's `clientHeight`, which leaves out the scrollbar and the
divider. The observer callback writes it as `--tab-row-band` with
`style.setProperty`. No named style holds a measured length, and
`Chrome.tsx` already writes the account menu's position inline for that
reason. The gradient's opaque stops read `colors.text`. A mask reads alpha
alone, so that color never reaches the screen.

Why a sized layer: the probe compared three masks over a row with a classic
15px scrollbar. A plain gradient faded the scrollbar's arrows and the
divider's ends. A three-layer ring on the padding box kept the divider but
still faded the arrows. Chrome counts the scrollbar inside the padding box.
The sized layer alone kept both at full strength.

Why a mask over overlays: an overlay gradient repeats the ground's color.
It would draw a band wherever the ground differs. It also needs a wrapper
and two hidden nodes beside the `tablist`. A mask fades whatever lies behind
the row, in both schemes, and does not add a node. A pseudo-element on
the scrolling row would scroll away with the tabs. On a wrapper it equals an
overlay.

Why no scroll-driven CSS: `animation-timeline: scroll()` would run without
script. It needs a keyframe animation, though, and the Still Page Rule
counts a new animation as a design change. An engine without it would also
show no fade at all.

Under forced colors, each fade style sets `maskImage` to `"none"`. Forced
colors promise system contrast for every visible letter, and a fade lowers
it on a partly visible tab. The scrollbar stays the cue there.

The rules file `design-language.md` rules out decoration, and a fade that
meant nothing would be one. This fade states a fact the row otherwise hides:
tabs lie past this edge. It has no color, no shadow and no motion. It leaves
once no tab lies past its edge.

### Tests

Each test below fails against today's code unless it says otherwise. Both
new files declare a `stripComments` helper, as
`studio-guidedSurfaceStyle.test.ts` does. Each of their matches reads source
with its comments stripped.

- The new file `shell-headerWrap.test.ts` reads `Chrome.tsx` and
  `navStyles.ts` as source text. The `header` block declares
  `flexWrap: "wrap"` and names no `30rem`. The `accountGroup` block declares
  `flexGrow: 1` and no `marginLeft`. The `accountName` block declares
  `contain: "inline-size"`, `flexGrow: 1`, `textAlign: "end"` and
  `minWidth: "6rem"`. The `nav` block declares no `flex` shorthand, and keeps
  its two 30rem rules.
- The file `chrome-header.test.tsx` gains one case. The `title` stands on a
  span that holds the actor's name alone, inside the identity span.
- The new file `studio-narrowWidths.test.ts` reads source text too. Both form
  editor files declare `PREVIEW_NARROW` at 80rem and name no `64rem`. The row
  block declares `scrollPaddingInline: space.s8` and the band's mask size.
  Each fade style drops its mask under forced colors. The file
  `ProcessTabRow.tsx` declares no `transition` and no `animation`.
- The same file guards the one mechanism. The file `EditScreen.tsx` calls
  `scrollTabIntoRow` and names no `scrollIntoView`. The file
  `ProcessTabRow.tsx` names `scrollIntoView` once, with `inline: "nearest"`
  and `behavior: "instant"`.
- The file `studio-processTabRow.test.tsx` gains `fadeState` and
  `tabRestsInView` cases. It reads both functions through a namespace import,
  so a missing export fails each assertion and the module still loads. The
  `fadeState` cases cover no overflow, the start, mid-scroll, the end and the
  1px tolerance at each edge. The `tabRestsInView` cases cover a tab mid-row
  32px clear, and the same tab 20px from an edge. They also cover the last
  tab 0.5px short of the end limit, and the first tab at the start. A tab 1px
  inside the padding still reads `true`.

The existing tab row tests keep passing as they stand. No DOM test library
exists here. The scroll, the drawn fade and the wrap therefore go to
`docs/browser-checks.md`, per `development-toolchain`'s split rule.

### Documentation

- The file `docs/decisions.md` deletes FORMS-11, FORMS-12 and FORMS-16.
  FORMS-15 becomes the entry quoted under G2. The change
  `authoring-command-ink-advisory-role` removes FORMS-7 and FORMS-14, and
  records its own finding in a section of its own. FORMS-18, which
  `forms-card-legend` recorded, stays open in the Forms tab audits section,
  so task 5.3 keeps the heading. That task counts the section's bullets at
  apply time, and removes the heading and opening paragraphs only where none
  stands.
- The same file gains the section quoted under the area nav, directly above
  `Refused simplifications`.
- The file `docs/browser-checks.md` gains three entries: the header, the form
  editor and the tab row. It amends the StyleX pilot entry's 30rem paragraph.
  It adds a 400px step to "Keyboard focus hand-off from a Checks row and a
  Changes row". The entry "Tabbed step form" names a window wider than 1280px
  where the preview stands beside the canvas.
- The file `DESIGN.md` rewrites the Layout list's 30rem line and adds an
  80rem line. Its Navigation section's Header bullet gains the wrap. Its Tab
  Row section's Row bullet gains the scroll and the edge fade.
- The file `docs/current-state.md` rewrites three paragraphs of the entry
  that names `panels/ProcessTabRow.tsx`: the tab row, the hand-off and the
  form preview. No passage there describes the header's wrap.
- The glossary `.claude/rules/ui-glossary.md` adds *edge fade* beside the tab
  row. Its form preview row names the turn at 80rem. Its entry for *header*
  states the wrap in place of "the one fixed row". The file
  `design-language.md` states no header or tab row layout, so it stays.
- A citation sweep follows the doc edits. It re-reads each line citation in
  `docs/decisions.md` that points into a file this change edits.

## Risks / Trade-offs

- [StyleX 0.19 might drop a mask longhand, `contain` or
  `scrollPaddingInline`, each a first use here] → The task that writes them
  reads the compiled stylesheet before any later task. The rule set
  `web-styling` names the fallback, a literal residual rule.
- [A replica measures no real screen] → The browser check reads the real
  thresholds. It covers all four areas and both locales. A surprise lands in
  this design before the change merges.
- [A nav wider than its line still overflows] → The header's wrap leaves no
  area worse than today. NAV-1 records the rest, and
  the header entry's fourth step records each width.
- [From 1024px to 1280px an author scrolls down to reach the preview] → The
  owner accepted that price on the mockup. The key stays legible, which the
  preview beside it could not keep.
- [A zoom or a new scrollbar moves the band] → The observer sees the row's
  new height. It writes the band again.
- [A width change pulls back a hand-scrolled row] → A resize of the row moves
  it by the least distance. A tab's width change
  moves the row only while the open tab rested in view.
- [A right-to-left locale] → The helper `fadeState` and its tests assume a
  positive `scrollLeft`. Both then need a direction argument.
- [`forms-card-legend` and `authoring-command-ink-advisory-role` touch the
  same docs] → Both merge first. This change names sections and entries in
  its edits. Its citation sweep re-reads the line citations that point into
  files it edits.

## Migration Plan

No data, schema or contract moves, and nothing persists. The branch starts
from `main` once `forms-card-legend` and
`authoring-command-ink-advisory-role` have merged. Before the first UI task,
copy the main checkout's `.claude/skills/impeccable` into the worktree. The
detector hook stays silent without it. One pull request carries the change,
and a revert of its commits restores the old header, turn and row.

## Open Questions

None that move the specs, the approach or the tasks. The browser check
records the real header thresholds that the replica figures above predict.
