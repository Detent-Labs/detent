## Context

See `proposal.md` for motivation. This section covers what the approach needs.

The file `screens/EditScreen.tsx` holds two components. The outer one,
`EditScreen`, loads the draft record and provides it. The inner one,
`EditorArea`, renders everything inside that provider and stays
module-private.

`EditorArea` carries two orthogonal sub-states. A toggle picks `"structure"`
or `"json"`. Inside `"structure"` a three-way ladder picks the panels screen,
the form editor or the canvas grid. The canvas grid is the last arm, at
`EditScreen.tsx:319`.

<!-- antislop: allow synonym-rotation -->
<!-- Why: `.claude/rules/ui-glossary.md` fixes "edit rail" as the one name for
     that column, and forbids "rail" alone. The rule reads its "edit" as a
     synonym for the "change" this document uses in the OpenSpec sense. -->
The grid `.studio-canvas-layout` is strict. Its template reads
`12rem minmax(0, 1fr) 22rem`, and its three children are the edit rail, the
canvas and one of three third-column branches. A fourth child would land in an
implicit fourth column.

Its parent is `<main className="studio-screen studio-edit-screen">` at
`EditScreen.tsx:260`. That element is already a flex column with
`flex: 1 1 auto`. The grid inside it carries `flex: 1 1 auto` and
`min-height: 36rem`. Item 1 built that pair, and this change reuses it whole.

Four facts about the tabs' own sources:

- The module `screens/versionDiffLogic.ts` exports `diffJson(a, b)` and
  `canDiff(selection)`. The first compares two bodies. The second guards a
  two-version selection on the versions screen.
- The panel `panels/FieldMatrixPanel.tsx` takes no props at all. It reads
  `useDraft()` and writes the draft through `setFlag`.
- A `Path` carries `to`, `trigger`, `guard` and `priority`. It carries no
  back-reference to the step it leaves, and no `kind` field. A guard sits on
  the path whatever its trigger.
- A `Draft` is `DraftOf<AuthoredProcessBody>`, so every nested property reads
  as optional.

## Goals / Non-Goals

Goals:

- Fill the canvas screen's lower band with three answers an author leaves the
  canvas for today.
- Keep the canvas above its 36rem floor at every dock state a tall window
  allows.
- Add no route, no persisted key and no schema field.

Non-Goals:

- No filter on either shipping tab. Four steps do not need one.
- No Player tab. `docs/decisions.md` rejected it, and the rejection stands.
- No translation-coverage tab and no CEL scratchpad. Both stay deferred.
- No change to the panels screen's field matrix or to its route.
- No rewrite of the live specs that use "dock" as a verb. Decision 10 covers
  the scope instead.

## Decisions

### 1. The dock is a flex sibling of the grid, not a fourth grid child

The dock renders directly after `</div>` closes `.studio-canvas-layout`, inside
the same fragment. Both become flex children of `.studio-edit-screen`.

That placement needs no change to `grid-template-columns`. It gives the dock
full width for free, because a flex column stretches its children.

The two flex declarations carry the height rule between them. The grid keeps
`flex: 1 1 auto` with `min-height: 36rem`. The dock takes `flex: 0 0 auto`, so
a short window shrinks neither the strip nor its tab bar.

The grid therefore yields its height to the dock until it reaches 36rem. Past
that point `.studio-edit-screen` overflows and the page scrolls. That is what
the screen does today in a short window.

The shell sets `min-height: 100vh`, a floor rather than a ceiling. So a page
taller than the viewport scrolls rather than compressing.
`.studio-panels-screen-layout` took `flex: 1 1 0` for that same reason.

The rejected alternative was a fourth grid child spanning `1 / -1` on a second
grid row. It works, and it costs a `grid-template-rows` declaration plus a
`grid-column` on the dock. The flex sibling costs neither.

### 2. The dock mounts inside the canvas arm of the ladder

<!-- antislop: allow synonym-rotation -->
<!-- Why: CLAUDE.md fixes "surface" as a domain term with no synonym, and
     `.claude/rules/ui-glossary.md` fixes "JSON surface" as that view's one
     name. The rule reads the word as a synonym for "render". -->
A dock beside the ladder would render on the panels screen and the form editor
too. A dock beside the toggle would render on the JSON surface as well. Both
placements are wrong, so the dock sits inside the last arm.

The panels screen and the form editor each replace the canvas. The dock's
premise is the band the canvas grid leaves.

The JSON surface has a harder rule behind it. The capability
`studio-json-view` keeps every draft-body-mutating component out of reach
while that surface is active. The dock's Field matrix tab writes flags through
`setFlag`, so it is one.

The last arm becomes a fragment holding the grid and the dock. That arm already
sits inside the `surface === "structure"` branch, which carries the JSON rule.

### 3. The open flag and the active tab live in `EditorArea` state

Two `useState` hooks, beside `selectedStepIds` and `surface`. The draft's
`layout` blob takes no key.

That blob is its own column on the `drafts` row. It never reaches
`definitionHash`, and it never reaches `ProcessBody`. It is per-draft rather
than per-author, which is the reason that matters here.

One author's open dock would therefore open for every author of that draft. A
per-author preference store would answer it, and no area has one.

Because `EditorArea` stays mounted across the ladder, the dock's state survives
a trip to the panels screen and back. A reload resets it.

### 4. The Changes tab diffs the live draft, and it needs a new prop

`EditorArea` holds `draft` from `useDraft()`, which carries edits nobody has
saved. The versions screen diffs the server's saved draft instead. The dock
takes the live one, because an author reading this tab is mid-edit.

The base body is not in scope. `EditScreen.load` fetches the draft record and
forwards `revision` and `layout` alone. The field `DraftRecord.baseVersion`
exists at `api/types.ts:32`, and only the versions screen reads it today, at
`VersionsScreen.tsx:67`.

So `EditorAreaProps` gains `loadedBaseVersion: number | null`. The name says
what it is. In this file `initialRevision` and `initialLayout` seed a
`useState`, and this value seeds nothing.

`EditScreen` never refreshes that record. Only `load()` writes its `state`.
That callback depends on `processId`, `token` and `onUnauthorized` alone.
Neither the publish path nor the conflict reload touches it.

A publish does move the stored base version. `markDraftPublished` sets
`base_version` to the new version inside the publish transaction
(`src/engine/drafts.ts:213`, called at `src/http/studio-routes.ts:158`). The
response carries that number as `PublishResult.version`.

`EditorArea` already holds `publishResult` at `EditScreen.tsx:78`. So it
derives the value: `const baseVersion = publishResult?.version ?? loadedBaseVersion`.
The dock takes that, and its fetch keys on it. A publish therefore refetches
with no reload.

The base body arrives compiled. The tab strips it through
`stripCompiledContent` before the compare, the same call
`VersionsScreen.diffAgainstBase()` makes at line 123. The compile pass injects
a cancel sink, and no author wrote it.

The call is `diffJson(strippedBase, draft)`, base first. That function reports
a key present in its second argument alone as `added`. It reads `from` off the
first argument. Base first therefore runs every entry from the published
version toward the draft, the direction a publish moves.

`VersionsScreen.diffAgainstBase()` passes the draft first, at line 123. That
order suits its neutral A-against-B framing beside `diffSelected`. This tab
does not copy it. Draft first would read a newly added field as removed.

The call runs inside a `useMemo` over the live draft and the stripped base. It
is pure, so a keystroke recomputes and nothing else does.

`canDiff` does not reach this tab. It guards a two-version selection of shape
`{ a, b }`, and the dock compares a draft against one version. The guard here
is `baseVersion !== null`. `docs/decisions.md` named both exports, and only
`diffJson` carries the tab.

### 5. `FieldMatrixPanel` mounts a second time, and its stylesheet needs one rule

The component takes no props. It reads `useDraft()`, and both mounts sit under
one `DraftProvider`. So both read and write one draft.

`docs/decisions.md` says the view is read-only, and that premise is wrong. The
panel calls `mutate` through `setFlag` at `FieldMatrixPanel.tsx:160`. The
conclusion survives for a different reason: the panel holds no state the two
mounts must share.

Each mount keeps its own selected cell, its own focus position and its own
roving tabindex. That is the behaviour we want. A cell selected in the dock
does not move the panels screen's own selection.

The component needs no change. Its stylesheet does. `.studio-matrix-scroll`
caps at `32rem` and scrolls itself, twice the dock's bound. Inside the dock
that overflows the body and pushes the cell editor out of reach.

One dock-scoped rule brings the cap DOWN, to 11rem. The rule
`.studio-map-section .studio-empty` is this stylesheet's own precedent for a
descendant override.

Lifting the cap instead looks right and breaks the sticky headers. The
browser check measured it. `overflow: auto` still makes
`.studio-matrix-scroll` a scroll container. A `position: sticky` header
therefore resolves against that box, not against the dock body below it. The
column header moved 858px to 608px under a 250px scroll.

Keeping the inner scrollport also keeps the `tabindex="0"` region
`spa-accessibility` asks for. The grid scrolls in its own box. The cell editor
sits below it inside the dock body, the structure the panels screen has.

### 6. Two new files, and neither one is a panel

`dock/EditorDock.tsx` holds the strip, its control, its tab bar and all three
tab bodies. `dock/pathRows.ts` holds the pure row derivation.

The Changes body carries a fetch, an error state and a waiting state. It stays
inside `EditorDock.tsx` rather than taking a third file. That file lands near
200 lines, under `FieldMatrixPanel.tsx`'s 260.

All three bodies mount while the dock is open, and `hidden` reveals one. That
is the reveal-rather-than-mount rule `PanelsScreen` already follows for its
four views. The Changes fetch therefore runs once per open, and the matrix
keeps its selected cell across a tab switch. A collapsed dock mounts none of
the three.

`.claude/rules/ui-glossary.md` states that "panel" alone names nothing. The
inspector holds inspector panels, and the panels screen holds views. A dock
section is neither, so no file here carries the word.

`panels/PathsPanel.tsx` keeps its name. It edits one step's outgoing paths, and
the dock lists every path in the process.

### 7. The row derivation returns raw values, and the component resolves them

`pathRows(steps)` walks `draft.workflow.steps`. A path carries no back-reference
to its source, so the walk supplies the source for free.

Each row carries `pathId`, `sourceKey`, `sourceLabel`, `targetKey`,
`targetLabel`, `trigger`, `priority` and `guardSrc`. Every row carries
`guardSrc`, with no branch on the trigger. A manual path can hold a guard, and
the engine reads it.

The two label values take the type `DraftLocalizedText` from
`draft/localized-text.ts`, unresolved. A `Draft` is
`DraftOf<AuthoredProcessBody>`, so a step label reads `string | undefined` per
locale entry. The engine's own `LocalizedText` does not type that, and `strict`
rejects the assignment.

That type also admits `undefined`, which is what a dangling `to` leaves in
`targetLabel`.

Keeping the labels raw leaves the module free of the content locale, so the
test needs no i18n setup. The component resolves them through
`resolveDraftLocalizedText(value, locale, baseLocale)`. That function takes
three arguments and returns `string | undefined`, so each call needs a
fallback.

A `to` naming no step in the draft leaves `targetKey` and `targetLabel` unset,
and the row shows the raw id. A draft is mid-edit and may hold a dangling
reference, so the tab must render it rather than throw.

### 8. The dock's own accessibility uses two patterns the area already ships

The tab bar takes `role="tablist"`, `role="tab"` and `aria-selected`. The
toggle at `EditScreen.tsx:288` already uses that trio.

The control is a `<button type="button">` carrying `aria-expanded` for its
state and `aria-controls` naming the dock body's id. The capability
`spa-accessibility` asks a disclosure for all three, and `studio-canvas`
restates them for the inspector's section entries. The collapsed checks rail
ships that shape already.

The Paths body is a real `<table>` with `<th scope="col">` on its five columns.

Neither pattern is new to `packages/web`, so `spa-accessibility` takes no
delta. The field matrix needed one because a `role="grid"` with a roving
tabindex was new. A table and a tablist are not.

### 9. The dock body bounds at 16rem, and the browser check measures that bound

The bound is 16rem, and the browser check measured what that costs. The
screen's three header rows take 186px at a 1440 by 900 window, so the grid
draws 40rem with the dock collapsed. Opening the dock takes it to the 36rem
floor, and the page scrolls the rest.

The spec allows that scroll, and a short window already scrolls today. The
bound stays at 16rem. The grid keeps its floor, and the canvas stays visible
above the dock at every state measured.

Each tab body scrolls inside that bound. The dock never grows to fit content.
Both axes scroll inside the dock, so a wide row never scrolls the page
sideways. A 1024px-wide window with the longest guard in
`purchase-requisition` scrolled neither the page nor the screen.

The Field matrix tab is the one body carrying its own scroll region, which
`spa-accessibility` requires to stay focusable. Decision 5 caps that region at
11rem. The grid then scrolls in its own box, and the dock body reaches the
cell editor below it.

### 10. The glossary gains a noun, and the live specs keep the verb

`.claude/rules/ui-glossary.md` reads "The inspector then docks a second
instance, collapsed, at its bottom edge." That sentence uses "dock" as a verb
for the collapsed checks rail.

Registering **dock** as a noun beside that sentence contradicts it. The verb
goes there, and the sentence reads "shows" instead.

The verb survives elsewhere, and it stays. The spec `studio-checks-rail` uses
it six times. The spec `studio-canvas` uses it twice, inside a requirement this
change does not otherwise touch. Rewording those costs two full MODIFIED
copies for one word.

The glossary entry names its own scope instead. The noun **dock** names the
strip below the canvas columns, and nothing else. Three documents this change
already edits lose the verb, because their edits are free.

The CSS class `.studio-checks-rail-docked` keeps its name. No document and no
catalog string reads it.

## Risks / Trade-offs

- **A second field matrix mount doubles its render cost**. The grid draws 286
  cells on `purchase-requisition`. Two mounts in the DOM at once would need an
  author on the panels screen with the dock open. That cannot happen. The
  panels screen replaces the canvas, so the dock unmounts with it.
- **The Changes tab recomputes on every keystroke**. The call `diffJson` walks
  two whole bodies. A `useMemo` bounds it to one run per draft change. The tab
  body mounts only while the dock is open. A debounce waits for a measurement
  showing the walk matters.
- **The base body caches until the base version moves**. A publish from the
  toolbar moves it. `EditorArea` derives the version from
  `publishResult?.version`, so the fetch key changes and the tab refetches.
- **The dock takes height an author may want for the canvas**. It starts
  collapsed for that reason, and a collapsed dock shows one control row.
- **A 16rem body is tight for the field matrix**. That tab carries a grid and a
  cell editor. The browser check measured both at 11rem of grid, and the
  sticky headers and the roving tabindex both survive. A larger process makes
  the grid scroll further, which is what the scroll region is for.

## Migration Plan

None. No schema change, no engine change, no API change and no stored key. The
`layout` blob keeps the shape it has today: one key per hand-placed step id,
plus `canvasEdgeStyle`, `waypoints` and `groups`. A draft saved before this
change and a draft saved after it are byte-identical for the same edits.

## Open Questions

1. Should the Paths tab carry a sixth column for the path's own `key`? The
   five columns come from `docs/decisions.md`, and the row already carries
   `pathId`. Two paths that leave one step for one target read alike without
   it. Ship five, and add the column when an author reports that collision.
2. Should a Paths row select the path on the canvas? The canvas holds
   `selectedPathId`, and `EditorArea` owns it. A row click could set it. This
   change ships the table alone. A selection that scrolls the canvas raises
   its own questions about panning to a path off screen.
3. Should the Changes tab report a list element rather than the whole list?
   The difference computation treats an array as one value. A draft that adds
   one catalog field therefore reports one changed entry over the whole
   `fields` array. That prints a wall of JSON for a one-key change.

   Keying an array by each element's own `id` would name the element instead.
   That work belongs to `versionDiffLogic.ts`, which the versions screen
   shares. It is a change of its own, not a dock decision.
