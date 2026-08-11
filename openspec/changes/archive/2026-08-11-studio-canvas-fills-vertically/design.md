## Context

See `proposal.md`, Why. `docs/decisions.md` carries the recorded analysis.

The DOM between the window and the canvas columns is short. `Chrome.tsx` writes
`<div class="shell">`. That div holds two children: `<header class="shell-header">`
and the area's screen.

The studio area's `EditScreen` writes `<main class="studio-screen
studio-edit-screen">`. In the structure surface, `<div
class="studio-canvas-layout">` is one of that `<main>`'s own children. A React
fragment creates no element, so the chain is three elements deep.

Today `.shell` carries `min-height: 100vh` and no display rule. It stacks as
blocks. Nothing between the window and `.studio-canvas-layout` holds a height
for the grid to grow into. That is why the grid states `height: 36rem` outright.

`.canvas-inspector` already carries `overflow-y: auto`. A taller row therefore
shows more of the inspector instead of overflowing it.

## Goals / Non-Goals

**Goals:**

- One height chain, from `.shell` down to `.studio-canvas-layout`.
- The three other areas keep the layout they have today, byte for byte.
- The change stays in CSS, if the DOM allows it.

**Non-Goals:**

<!-- "JSON surface" is the glossary term for that view. The linter reads it as
     a synonym of the CSS `display` property this file also names. -->
<!-- antislop: allow synonym-rotation -->

- The JSON surface and the form editor branch of the same screen. Both keep
  their content height. The `<main>` leaves space below them.
- Any other studio screen, `PlayerScreen` included.
- Replacing `100vh` with `100dvh`. That is a separate mobile-viewport question,
  and this screen targets a desktop window.
- A scroll container inside the canvas columns. Each column handles its own
  overflow already.

## Decisions

**The chain is three declarations, all in CSS.** `.shell` gets `display: flex`
and `flex-direction: column`, beside its existing `min-height: 100vh`.
`.studio-edit-screen` gets `flex: 1 1 auto`, `display: flex` and
`flex-direction: column`. `.studio-canvas-layout` trades `height: 36rem` for
`flex: 1 1 auto` and `min-height: 36rem`.

One alternative got weighed: `height: calc(100vh - <header>)` on the grid alone.
It needs the header's height as a constant. The header wraps its nav when the
window narrows, so that constant is wrong at exactly the sizes that matter. The
flex chain reads the real height instead.

**`EditScreen.tsx` stays as it is.** `docs/decisions.md` named it as a third
file. The DOM above shows why the change does not need it.
`.studio-canvas-layout` is a direct child of the `<main>` that grows. A class
rule therefore reaches it. Two files, not three. If the browser check finds that
the screen needs a wrapper after all, the task list covers that case.

**The floor stays 36rem.** It is today's fixed height. A window too short to
grow therefore keeps exactly what it shows now. A smaller floor would regress
that case. A larger one would invent a number nobody measured.

**The header gets `flex: 0 0 auto`.** The automatic minimum size of a flex item
already stops the header from shrinking below its content. The declaration
states the rule the spec carries, in one line. It leaves nothing to that
inference.

**Growth is opt-in.** The three other areas opt out. The `app`, `admin` and
`reporting` screens set no `flex-grow`. Each therefore keeps its content height
inside the column. Their `max-width` and `margin: 0 auto` still center them.
Horizontal auto margins work on a flex item the way they work on a block.

**The screen zeroes its children's top margins.** A flex column stops sibling
margin collapsing. Three direct children carry a top margin today. The form
editor page sets `margin-top: var(--space-3)` at `app.css:946`. The
`draft-incomplete` paragraph carries no rule at all, so the browser's own `1em`
applies. The `studio-error` paragraph sets a color alone at `app.css:87`, so
the same `1em` applies there.

Each one collapses into the header bar's `margin-bottom` today. Without
collapsing they would add. The gap above the
form editor page would then double. One rule holds every one of them at today's
spacing: `.studio-edit-screen > * { margin-top: 0 }`. It stays scoped to this
screen, so the other `studio-error` sites keep their own margins.

**Every screen states `width: 100%`.** The browser check found this, and the
plan missed it. A flex container stretches an item only when that item's
cross-axis margins are not auto. Each area screen centers itself with
`margin: 0 auto` under a `max-width`. As a flex item it therefore shrink-wraps
to its content. The canvas column measured 302px where it had measured about
1000px.

One rule in `shell.css`, `.shell > * { width: 100% }`, restores the width a
block box had. The auto margins then center the screen under its own
`max-width`, the way they did before. Measured after the fix: 736px in the app
area, 960px in admin and in reporting, each centered.

**The design skills add no constraint here.** `CLAUDE.md` routes UI work
through them. This change alters no color, no type, no spacing scale and no
component state. It adds one height chain. `.claude/rules/design-language.md`
governs the screen, and none of its five rules concerns height.

**A browser check verifies this, not a `bun:test` assertion.** The behavior is a
resolved height. Reading one needs a layout engine. `bun:test` has none. So the
check goes to `docs/browser-checks.md`, under the `development-toolchain` split
rule.

## Risks / Trade-offs

<!-- "edit rail" is the glossary term for that column. The linter reads its
     "edit" as a synonym of "change". -->
<!-- antislop: allow synonym-rotation -->

- Making `.shell` a flex container changes the layout mode for every screen in
  all four areas. The browser check covers one screen per untouched area, on a
  tall window, against what it shows today.
- `min-height: 100vh` plus a grown child can leave the page one hairline taller
  than the window. A padding or a border that rounds up does that. The browser
  check looks for a scrollbar on a tall window.
- The edit rail column carries no `overflow-y` of its own. A tall window makes
  it taller with no visible effect. No action: the palette is short.
- The auto-fit runs once per mount, which `studio-canvas` requires. A window
  resize now changes the canvas height without a re-fit, so the framing goes
  stale. Width already behaves that way, so this is no regression. No action.
- `packages/web/test/studio-canvas-fit.test.ts` passes an element of
  `500 x 576`, and its comment calls that the studio canvas. The test still
  passes, since `computeFit` takes the size as an argument. Task 1.7 rewords
  the comment.

## Migration Plan

There is nothing to migrate. The change writes CSS. It touches no database, no
stored draft, no published body and no API response. A running instance sees
nothing. The build needs no flag and no ordering.

Rollback is a revert of the two CSS files and the test comment. The reverted
tree renders exactly what today's tree renders.

## Open Questions

**Does the CSS-only chain reach the grid, or does `EditScreen.tsx` need a
wrapper?** Task 2.7 answered it in the browser. The chain reaches, and the file
needs no wrapper. The chain cost two rules the plan did not foresee. One is the
`width: 100%` above. The other drops `.studio-form-editor-page`'s own
`margin-top`, which beat the screen's blanket rule on source order. Both are
CSS, so the file count stayed at two.
