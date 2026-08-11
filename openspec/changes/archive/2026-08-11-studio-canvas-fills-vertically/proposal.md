## Why

<!-- "canvas edit screen" is the glossary name of the screen. The linter reads
     its "edit" as a synonym of "change", which this file also names. -->
<!-- antislop: allow synonym-rotation -->

The canvas edit screen grows with the window's width. It ignores the window's
height. `.studio-canvas-layout` carries `height: 36rem`, so in a 1440px-tall
window the canvas stops at 576px. The rest of the window stays empty.

An author drawing a process of more than a few steps then pans a small viewport
across a large graph. The window has the room to show more of it.
`docs/decisions.md` records the cause and the fix.

## What Changes

- `.shell` becomes a flex column. The area screen below the header then has a
  height to grow into. The header keeps its own height.
- The canvas edit screen (`.studio-edit-screen`) grows into that height. It lays
  its own children out as a column.
- `.studio-canvas-layout` drops its fixed `height: 36rem`. It takes the height
  the screen leaves it.
- `36rem` stays as the floor. A window too short to grow shows what it shows
  today.
- The screen zeroes its children's top margins. A flex column stops margin
  collapsing, and that rule holds today's spacing.
- The three other areas keep their content-height layout. Each of their screens
  asks for no growth, so a flex column parent leaves it alone.
- No JSON contract change, no API change, no new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the canvas edit screen's three columns gain a height rule.
  They fill the window's remaining height, above a floor.
- `unified-shell`: the shell states that its screen slot is a growable column. A
  screen fills the remaining height only when it asks.

## Impact

- `packages/web/src/shell/shell.css`: `.shell`, the header's shrink behavior,
  and a `width: 100%` every screen needs once the shell is a flex column.
- `packages/web/src/areas/studio/app.css`: `.studio-edit-screen`,
  `.studio-canvas-layout`, one rule zeroing the screen's children's top
  margins, `.studio-form-editor-page`'s own top margin, and
  `.draft-incomplete`'s spacing.
- `packages/web/test/studio-canvas-fit.test.ts`: one comment, which names 576px
  as the canvas height. It is the floor now.
- `docs/browser-checks.md`: one new entry.
- `docs/decisions.md`: the entry this change closes goes.
- `tmp/open-work-priority.md`: item 1's status. That file is a working note, and
  `.gitignore` holds `tmp/`.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: no change.
  `design.md` reads the DOM and shows why the class rules reach the grid.
- A browser check on a tall window and on a short one. It covers the three
  untouched areas too.
- The change touches no engine file, no HTTP file and no schema file.
