# Design

## Context

See `proposal.md` for the motivation. The spike report sits in the shared `tmp/briefs/`
folder as `spike-ui-sdk-canvas.report.md`, and its measurements are the baseline here.

The canvas is a hand-rolled `<svg>` that Panzoom transforms
(`packages/web/src/areas/studio/canvas/CanvasView.tsx:759`). Panzoom places a user-space point
`p` on screen at `C + s·(p + t − C)`. Here `C` is the element centre, `s` the scale and `t` the
pan (`fit.ts`, header comment). The frame around the `<svg>` is `.canvas-wrap`. Its compiled
style sets `overflow: hidden` (`CanvasView.tsx:94`).

Panzoom also writes the frame's overflow itself. Its constructor runs
`parent.style.overflow = options.overflow`, and the option defaults to `'hidden'`
(`node_modules/.bun/@panzoom+panzoom@4.6.2/.../panzoom.es.js:363`). That inline style wins over
the compiled class. A fix to the class alone changes nothing.

Four facts shape the rest:

- `measureFit` reads `clientWidth` and `clientHeight` and relies on the frame's clipping
  (`CanvasView.tsx:686`, comment at `:699`). Its insets are the toolbar's bottom edge plus
  `FIT_GUTTER` on top, and `FIT_GUTTER` (16px) on the other three sides (`fit.ts:58`).
- The canvas's own focus calls pass no options (`CanvasView.tsx:1023`, `:1370`).
- Enter calls `onOpenStepPage` (`CanvasView.tsx:1360`). `EditScreen` answers with
  `goToTab("steps")` alone (`screens/EditScreen.tsx:1373`). The Map tab's body turns `hidden`,
  and the focused node leaves the accessibility tree with it.
- `EditScreen` already holds a focus hand-off. `pendingFocus` names a tab and an element id. Its
  effect waits until the tab is open and the step page has taken any `sectionRequest`
  (`EditScreen.tsx:1111`, `draft/process-tabs.ts:101`). A new step and a Fix use it
  (`EditScreen.tsx:903`, `:1094`).

The connect drop's release lives at `CanvasView.tsx:1283`. It derives the trigger with
`triggerForNewPath` (`draft/createPath.ts:79`). It then calls `resolveDropGesture`
(`dropGesture.ts:24`) over the visible nodes alone (`CanvasView.tsx:1304`). That function refuses
a terminal source first, then asks `checkConnection`, then hit-tests. A drop on empty canvas
mints a task step with `newStep`, then a path with `newPath` (`createPath.ts:61`). The refusal
text shows beside the release point through `showRejection` (`CanvasView.tsx:1275`).

The canvas bar's menu is a native `popover="auto"` with `role="menu"`
(`canvas/CanvasBar.tsx:377`). Its `beforetoggle` handler places it under its trigger with
`position: fixed` (`CanvasBar.tsx:260`).

## Goals / Non-Goals

**Goals:**

- Every keyboard path in this change reuses the pointer path's own functions. A keyboard way out
  and a dropped way out stay identical.
- Each new computation is a pure function beside `computeFit`, so `bun:test` covers it.

**Non-Goals:**

- No pan keys. Reveal on focus is the keyboard's pan.
- No change to the wheel, the pointer gestures, layout or groups.
- No move to the UI SDK and no new dependency.

## Decisions

### D1. The frame clips, and Panzoom gets told so

The compiled `wrap` style takes `overflow: "clip"`, and the `Panzoom(el, {...})` call passes
`overflow: "clip"`. The class alone fails, since the option controls the inline style Panzoom writes. A clip
box is not a scroll container, so focus can never scroll it.

The clip keeps the property `measureFit` relies on. Clipped content adds nothing to an
ancestor's scrollable overflow. The comment at `CanvasView.tsx:699` changes to name `clip`.

Every `focus()` call the canvas makes passes `{ preventScroll: true }`. That covers `moveFocus`,
Escape's root focus, the new path focus after the menu, and the return from the menu.

Alternative: keep `hidden` and reset `scrollTop` on each `scroll` event. Rejected: one frame
paints wrong, and Panzoom still never learns.

### D2. Reveal on focus is one pure function

`fit.ts` gains `revealPan(target: Box, view: Size, insets: Insets, current: Fit): Fit`. The
target box and the view use the frame's own pixel space. The function works per axis:

- A target wider than the room between the insets aligns its left edge to `insets.left`.
- A target past the right edge shifts left until its right edge meets `view.width − insets.right`.
- A target past the left edge shifts right until it meets `insets.left`.
- Otherwise nothing moves. The vertical axis follows the same rule with the top and bottom
  insets.

A shift of `d` screen pixels moves the pan by `d / s`, from the projection above. The scale
stays as it was. The function returns the new `{ scale, x, y }`, and the canvas applies it with
`panzoom.pan(x, y, { animate: false })`.

The canvas measures the target with `getBoundingClientRect()`. It subtracts the frame's rect and
its `clientLeft` and `clientTop`, since the frame never transforms. One measure then serves a node
`<g>`, a path `<g>` and the HTML disclosure button alike. The insets come from the same reading
`measureFit` takes. A small `fitInsets()` helper serves both, so they cannot drift.

The reveal runs from the `<svg>`'s `onFocus`, which React fires for every focus inside it. A ref
records a pointer press: the frame's `onPointerDownCapture` sets it, and the next
`pointerup` clears it. A focus during a press reveals nothing. A root focus reveals nothing, since
the root is the whole view.

Alternative: reveal inside `moveFocus` alone. Rejected: it misses a Tab entry onto the initial
step and the focus the menu hands back.

The ring of a revealed element shows whole. The node ring reaches 4px outside the node, and the
path halo 3px (`FOCUS_RING_OFFSET`, `edgeFocusHalo`). The 16px gutter clears both.

### D3. Zoom keys apply a pure zoom step

The handler `onCanvasKeyDown` reads `e.key` before the arrow branch. The keys `+` and `=` zoom
in. The `-` key zooms out, and the `0` key calls `fitToView`. A press with Ctrl, Meta or Alt
returns early. It does not call `preventDefault`, so the browser zooms the page. Shift stays
allowed, since a US layout types `+` with it.

The factor is `ZOOM_KEY_FACTOR = 1.25` each way, the factor the spike measured. `fit.ts` gains
`zoomAbout(current: Fit, toScale: number, anchor: Point, view: Size): Fit`. It clamps `toScale` to
`MIN_SCALE` and `MAX_SCALE`. It keeps the anchor's screen point fixed:
`t' = t + (S − C)·(1/s' − 1/s)`, with `S` the anchor and `C` the view centre. The anchor is the
focused element's centre, measured as in D2. A root focus anchors at the view centre, so only
the scale changes. The canvas applies the result the way `fitToView` does
(`CanvasView.tsx:1050`): `zoom`, then `pan`, both with `animate: false`.

Alternative: Panzoom's own `zoomIn` and `zoomOut`. Rejected: their step is `exp(0.3)`, and they
take no anchor in our frame's pixel space.

Each zoom key announces `Math.round(scale × 100)`, after `0` too. A press at a bound announces the
level it holds, so the key never reads as dead.

### D4. One live region, mounted with the canvas

A `<p role="status" aria-live="polite">` with the visually hidden style stands inside
`.canvas-wrap`, after the `<svg>`. It follows the announcer at `panels/EntityTabs.tsx:708`. It
renders on the first commit, empty, so its first message reaches a screen reader. A helper
called `announce` writes the text. A repeated text gets an empty string first. The helper writes
the text one animation frame later, so the reader speaks it again.

The new catalog keys, all English, since the studio catalog carries one locale:

| Key | Text |
|---|---|
| `canvas.zoomAnnounce` | `Map at {percent} percent` |
| `canvas.wayOutMenuHeading` | `Way out to …` |
| `canvas.wayOutMenuNewStep` | `A new step` |
| `canvas.wayOutAdded` | `Added a way out from {source} to {target}.` |

| `canvas.connectRefused` | `This step cannot take another way out here.` |

A refusal reads a catalog sentence too (owner ruling 2026-11-18). D7 says which one.

`docs/decisions.md` holds an open entry on a canvas removal that announces nothing. A later change
can announce a removal through this region. This change leaves removal as it is.

### D5. Enter lands through `pendingFocus`

`EditScreen`'s `onOpenStepPage` handler stops ignoring its arguments:

- A step: `setPendingFocus({ tab: "steps", elementId: STEP_PAGE_NAME_ID })`. The id sits on the
  masthead's Name input (`panels/StepPage.tsx:1131`). A new step and a Fix on a step already land
  there.
- A path: `setSectionRequest({ stepId, section: "paths" })` and
  `setPendingFocus({ tab: "steps", elementId: wayOutNameId(pathId) })`. The request opens Ways
  out (`StepPage.tsx:705`). `pendingFocusLands` holds the focus until that section shows.

`draft/process-tabs.ts` gains `wayOutNameId(pathId)`, beside `sectionHeaderId`. The Name input in
each Ways out row carries it (`panels/PathsPanel.tsx:270`).

A double-click calls the same handler, so it lands the same way. The pointer had dropped focus
to `<body>` there too.

Alternative: a focusable masthead heading with `tabindex="-1"`. Rejected: a ring on a heading
reads as a control. It would also add a second landing rule for one page.

### D6. The way-out menu

A new module `canvas/wayOutMenu.ts` holds the pure parts:

- `wayOutMenuItems(steps, hidden, texts)` returns the step items in draft order, then a
  separator, then the new-step item. It skips a step with no id and a step in `hidden`. It
  includes the source step.
- `typeAheadIndex(items, from, letter)` returns the next item after `from` whose text starts with
  the letter, compared case-insensitively. It wraps, and it skips the separator.

A component `canvas/WayOutMenu.tsx` renders it as a sibling of `.canvas-wrap`, and `CanvasView`
returns a fragment. Panzoom's press handler and the wheel listener both bind on the frame
(`CanvasView.tsx:759`, `:776`). A menu inside the frame would pan on a press and zoom on a wheel.
Outside the `<svg>`, its keys never reach `onCanvasKeyDown` either. The canvas region is a flex
box, and a closed popover takes no space in it.

The markup is a `popover="auto"` container holding a heading `<p>` and a `<div role="menu" aria-labelledby>`. The items are `<button role="menuitem">`
with `tabindex="-1"`, and the separator is a `<div role="separator">`. The heading sits outside
`role="menu"`, since a menu owns items and separators alone.

The canvas key handler opens it with `showPopover()` on `C`. Its `beforetoggle` places it with
`position: fixed`, under the node's client rect and left-aligned, 4px below it. This is the
canvas bar's own placement (`CanvasBar.tsx:260`). A menu that would pass the viewport's bottom
opens above the node instead. On the open edge the first item takes focus.

The menu's own `onKeyDown` answers Down, Up, Home, End, Enter, Tab and a printable letter. Escape
falls to the popover's native light dismiss. The `toggle` handler for the closed edge returns
focus to the step, with `preventScroll`. It acts only while focus sits inside the menu or on
the page body. A press elsewhere keeps the focus it took.

Each step node gains `aria-keyshortcuts="C"`. No visible hint draws.

`docs/decisions.md` also records that the canvas bar's caret menu ignores the arrow keys. This
change leaves that menu as it is. Its later fix can reuse this menu's keyboard model.

### D7. The menu adds through the drop's own code

`dropGesture.ts` gains `checkConnectSource(sourceTerminal, existingPaths, trigger)`. It returns
the terminal refusal or `checkConnection`'s answer. `resolveDropGesture` calls it first, so its
results stay identical. The `C` key calls it too, with `triggerForNewPath(source)`. A refusal
shows through `showRejection` at the node's top centre, and the live region reads the same text.

The owner ruled on 2026-11-18 that the refusal reads author's words, for the drop and the key
alike. A new pure `refusalSentence(refusal, step)` in `canvas/connection.ts` picks the sentence:

- A terminal source reads `canvas.connectHandleEnd`, "An end has no way out."
  (`studio.ts:1207`). The connect handle on an end already prints it.
- A trigger reason resolves through `literalRuleFor(reason)` (`draft/checkSentence.ts:382`).
  That is the table the checks rail uses, with rows such as `checks.paths.noOrder`
  (`checkSentence.ts:295-299`). It fills `{step}` with the step's printed text and
  `{section}` with the Ways out section's name, as the checks rail does.
- A reason the table does not match reads `canvas.connectRefused`.

`checkConnectSource` therefore returns a refusal kind and the engine's reason, never display text.
`resolveDropGesture`'s `rejected` result carries the same pair, and `CanvasView` turns it into the
sentence. The engine's `checkPathTriggerConsistency` stays as it is, since `src/schema` is out of
scope. The hard-coded English sentence at `dropGesture.ts:31` goes.

`CanvasView` moves the two branches of the drop's release into one `addWayOut(sourceIndex,
target)`. The target is a step id, or a new step at a point. The drop and the menu both call it.
Each branch keeps the calls it makes today: `newPath`, `updateInDraftArray`, `newStep("task",
seedLocalizedText(contentLocale))`, `mutate` and `onMoveStep`.

The drop places a new step at the release point. The menu has no such point. It places the new
step at `freeLatticePoint(snapToGrid({ x: source.x + COLUMN_WIDTH, y: source.y }), drawn)`
(`geometry.ts:71`, `layout.ts:13`). `COLUMN_WIDTH` is the auto-layout's column pitch. The new
step stands where the auto-layout puts a step one level deeper.

Alternative: the canvas bar's press rule, the visible canvas centre (`EditScreen.tsx:969`).
Rejected: the new step lands far from its source, and its way out crosses the graph.

The target list follows the drop. A drop hit-tests the visible nodes, the source included. So
the menu lists the source and leaves out a step hidden in a collapsed group.

After the add, a pending path focus in `CanvasView` waits for the new path's `<g>`. A layout
effect then focuses it, with `preventScroll`, and D2 reveals it. The announcement fills
`canvas.wayOutAdded` from `stepTextMap`. A new step reads the text its node prints, such as
"(unnamed step)". The selection stays as it was, as after a drop.

### D8. Shape brief for the Map tab

The impeccable skill is not installed in this worktree. The `shape` playbook ran by hand from
the main checkout's copy, reading `PRODUCT.md`, `DESIGN.md` and
`.claude/rules/design-language.md` directly. No discovery round ran: the owner's settled
decisions answer it. Each line marked *assumed* is a reading nobody confirmed.

- **Job and audience.** A process author who works from the keyboard or a screen reader. The
  place is the Map tab, in Operate mode. Success: about five keys add a way out, on the canvas.
- **Direction.** The incumbent register language. The menu is a ledger list, flush left. It takes
  the canvas bar menu's box: a 1px hairline frame on paper, with no radius and no shadow. The focal
  point is the focused step and the list beside it.
- **The menu.** The heading takes the Label style: 11px, uppercase, tracked, slate. Each item is
  one register row in the body face, with a 1px hairline under it. The separator draws the 2px
  divider, so it reads apart from the row rules. "A new step" stays plain text, with no icon
  (*assumed*). Items wrap rather than clip, for German text up to 40% longer.
- **Ranges.** A draft holds 1 to about 50 steps. Past roughly half the viewport's height, the item
  list scrolls inside its own box (*assumed*). That box pads by `focus.reach` and sets it as its
  scroll padding (`spa-accessibility`).
- **The revealed element.** It keeps the 2px accent ring it already draws. The pan is instant,
  since the design language declares no motion. The gutter keeps the whole ring inside the view.
- **Key hints.** None draw: the owner wants no visible keys and no machine words. A screen reader
  hears `aria-keyshortcuts`. `docs/authoring-guide.md` names the keys.
- **Untouched.** The canvas bar, the toolbar, the stamps and the sentences.

## Risks / Trade-offs

- [On a Tab into the canvas, the browser moves focus with no `preventScroll`. The tab body
  scrolls (`EditScreen.tsx:235`). The browser can scroll it toward a clipped node.] → The canvas
  reveals that node first. It then calls `scrollIntoView` with `nearest` on both axes, for a
  focus the canvas did not make alone. A ref set around the canvas's own `focus()` calls marks
  those. A browser check walks it in a short window.
- [Panzoom rewrites the frame's inline overflow in its public `resetStyle` and in `setOptions`.] →
  The canvas never calls `resetStyle`, and no `setOptions` call passes `overflow`. A source-text
  test pins the option in the constructor call.
- [One Escape press could reach both the popover and the canvas.] → The menu stands outside the
  frame. Its Escape never reaches the canvas's key handler.
- [A later move to the UI SDK changes the transform. Its model is `t + s·p`, from the top-left
  corner.] → Both
  pure functions keep the projection in one place each. The reveal's shift of `d / s` holds under
  either model. Only `zoomAbout`'s formula would change, and its tests state the behaviour in
  screen points.
- [`overflow: clip` needs Chrome 90, Firefox 81 or Safari 16.] → The studio already relies on the
  Popover API, which needs later versions than these.
- [The handler for `C` could swallow a typed letter.] → The canvas's key handler already returns
  early for a text field (`CanvasView.tsx:1365`). The menu stands outside the `<svg>`.

## Migration Plan

The change stores nothing new and changes no stored shape. A deploy ships the bundle, and a
revert of the commit rolls it back.

## Open Questions

- None open. The owner settled the refusal wording (D7) and the double-click landing (D5) on
  2026-11-18.
