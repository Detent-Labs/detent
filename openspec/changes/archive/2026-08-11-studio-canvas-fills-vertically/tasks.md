## 1. The height chain

- [x] 1.1 In `packages/web/src/shell/shell.css`, give `.shell` `display: flex`
  and `flex-direction: column`, beside its existing `min-height: 100vh`.
- [x] 1.2 In the same file, give `.shell-header` `flex: 0 0 auto`.
- [x] 1.3 In `packages/web/src/areas/studio/app.css`, give
  `.studio-edit-screen` `flex: 1 1 auto`, `display: flex` and
  `flex-direction: column`, beside its existing `max-width: none`.
- [x] 1.4 In the same file, add `.studio-edit-screen > * { margin-top: 0 }`.
  Comment it: the column stops a child's top margin from collapsing into
  `.studio-header-bar`'s `margin-bottom`, which stays the gap.
- [x] 1.5 In the same file, replace `.studio-canvas-layout`'s `height: 36rem`
  with `flex: 1 1 auto` and `min-height: 36rem`.
- [x] 1.6 Rewrite that rule's comment. The fixed height it explains is gone.
- [x] 1.7 In `packages/web/test/studio-canvas-fit.test.ts`, reword the comment
  above `element = { width: 500, height: 576 }`. 576px is the floor now, not
  the height.
- [x] 1.8 In `shell.css`, add `.shell > * { width: 100% }`. The browser check
  found the reason. An area screen centers with `margin: 0 auto`, and a flex
  item with auto inline margins shrink-wraps rather than stretches.
- [x] 1.9 In `app.css`, drop `.studio-form-editor-page`'s
  `margin-top: var(--space-3)`. The rule in 1.4 loses to it on source order,
  so the gap above the page doubled.
- [x] 1.10 In `app.css`, give `.draft-incomplete` `margin: 0 0 var(--space-3)`.
  It carried the browser's own 15px, which is off the space scale.

## 2. Verify in a browser

<!-- "canvas edit screen" and "form editor" are glossary terms. The linter
     reads their "edit" as a synonym of "change". -->
<!-- antislop: allow synonym-rotation -->

- [x] 2.1 Serve the app. Open the canvas edit screen on a window of 1440px or
  taller. Confirm that the columns end at the window's bottom edge. Confirm that
  the canvas is taller than 36rem. Confirm that no page scrollbar appears.
  Measured at 1600x1440: grid 1230px tall, bottom edge 1416 of 1440, the
  remaining 24px the screen's own `padding-bottom`. `scrollHeight` 1440.
- [x] 2.2 Repeat on a window under 700px tall. Confirm that the columns hold at
  36rem. Confirm that the page scrolls to reach their bottom edge. Measured at
  1600x600: grid 576px, `scrollHeight` 786.
- [x] 2.3 Open the JSON surface of the same screen on a tall window. Confirm it
  keeps its content height, with space below it, and that nothing clips.
  Measured 478px tall, 12px below the header bar, no page scroll.
- [x] 2.4 Open the form editor branch of the same screen on a tall window.
  Confirm the same two properties. Measure the gap above
  `.studio-form-editor-page` and compare it against the current build. Task 1.4
  holds it at `var(--space-3)`. It measured 24px first, which task 1.9 repaired
  to 12px. Page 513px tall, nothing clipped.
- [x] 2.5 Open a draft that fails validation, so `.draft-incomplete` renders.
  Confirm its two gaps match the current build. They do not: 15px above becomes
  8px, and 15px below becomes 12px. Task 1.10 chose both, on the space scale.
- [x] 2.6 Open one screen per untouched area on a tall window: app My-tasks,
  admin instances, reporting. Confirm each keeps its width, its centering and
  its content height. Measured 736px, 960px and 960px, each centered at its own
  `max-width`, each at its content height.
- [x] 2.7 Add a wrapper element in `EditScreen.tsx` only if 2.1 to 2.6 need one.
  That answers `design.md`'s open question. Record the answer there. None
  needed. The CSS-only chain reaches the grid.

## 3. Record

- [x] 3.1 Add a check to `docs/browser-checks.md` covering 2.1, 2.2 and 2.6.
  Follow the format of the file's existing entries.
- [x] 3.2 Delete the "Studio canvas fills only horizontally, not vertically"
  entry from `docs/decisions.md`. The change closes it.
- [x] 3.3 Move item 1's status in `tmp/open-work-priority.md`. That file is a
  working note, and `.gitignore` holds `tmp/`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`. Report what it printed. `tsc --noEmit` for
  the engine, then `form-ui` and `web`, all three at exit code 0.
- [x] 4.2 Run `bun run build`. Report what it printed. The web build reported
  "built in 5.64s" at exit code 0.
- [x] 4.3 Run the full `bun test` with `DATABASE_URL` set. Report the pass count
  and the skip count. A single-file rerun is not the signal. 2327 pass, 1 skip,
  0 fail, 2328 tests across 138 files. The one skip is the timezone test
  `bun run test:tz` covers.
- [x] 4.4 Run the antislop linter over every Markdown file this change touched.
  Eight files, 0 findings.
- [x] 4.5 Run `git diff --check`. Clean.
- [x] 4.6 Run `git ls-files --eol`. Read the `w/` column for a CRLF file. Every
  changed file reads `w/lf`.
