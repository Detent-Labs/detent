# Browser checks

`CLAUDE.md` requires a real browser for any UI change. `development-toolchain`
states the rule that decides where a check lands. This repository already
produced the defect, and a `bun:test` assertion can observe it with no
browser: the check becomes an assertion. Otherwise it stays here. This file
holds a browser vendor's own behavior, a pointer gesture, a visual judgment.
It sits outside `openspec/`. Archiving a change never takes it along.

Each entry below states what to open, what to do, and what a pass looks
like. Each names the change that first asked for it.

## Before you start

**Address.** Use `127.0.0.1`, not `localhost`. Under Windows, `localhost`
resolves to `::1` and the connection hangs. The port is your own choice. Git
ignores `.devcontainer/docker-compose.override.yml`, so no port number in
this file binds every contributor. Publish one with a two-line override:

```yaml
services:
  app:
    ports:
      - "3001:3000"
```

The engine then serves the frontend bundle from `WEB_ROOT` on whichever host
port you chose. That is `3001` in the snippet above.

**Build the bundle first.** The engine serves `packages/web/dist`, a build
output the repository does not track. `resolveWebRoot`
(`src/http/static.ts:143-153`) falls back to that path and returns
`undefined` when it is absent. An unbuilt bundle answers every navigation
with a JSON 404, not a page. Build it first, inside the devcontainer:

```sh
bun run --filter './packages/web' build
```

**No overlap.** Run no `bun test` while a manual run is active. The dev
server's outbox poller claims rows the suite is driving. `CLAUDE.md`
records the measurement. Three red runs of twenty happen with a dev server
up. Zero of twenty happen with none. Stop the dev server before you run the
suite. Do not start one while a suite run is in flight.

## Checklist

### `iframe` framing from a second origin

Source: `2026-08-06-deliver-framing-and-sniffing-headers` task 5.3.

Serve a plain HTML page carrying `<iframe src="http://127.0.0.1:<published
port>/">` from a second origin. A second published port works, or any static
file server started from a scratch directory. Open that page in Chrome.

Pass: Chrome refuses to render the framed page. That is Chrome honoring the
`frame-ancestors` directive `test/http-static.test.ts` already asserts on
every serving path. It is the browser's own behavior, not something
`bun:test` can observe.

### Attachment download

Source: `2026-08-06-harden-http-response-boundary` task 7.3.

Upload an attachment to a running instance through the app area, then open
its download link.

Pass: the browser saves the file to disk. It does not render the file
inline. `test/http-disposition.test.ts` already asserts the
`Content-Disposition: attachment` header that causes this. This entry
confirms a real browser honors it.

### Form editor pointer work

Source: `2026-08-06-view-layout-and-form-editor` task 8.3.

In the studio's form editor: drag a field to a new position to reorder it.
Resize the browser window to see the two-column canvas lay fields out side
by side. Reorder a field using the keyboard alone, with no pointer device.

Pass: the drag reorders the field. The two-column canvas shows two fields
per row. The keyboard-only reorder moves the focused field.

This stays manual because pointer event ordering runs on a real event loop.
`bun:test` cannot observe it. `@panzoom/panzoom`'s `panzoom-exclude` class
is the precedent (`docs/current-state.md:1270`). Without it, Panzoom's
native down-handler wins the race against React's synthetic dispatch. It
turns a node drag into a canvas pan.

### Studio modal: stacking, focus, backdrop, Close

Source: `2026-08-06-studio-edit-shared-modal` tasks 6.3 and 6.4.

Open the shared editing modal from the studio canvas. Confirm it stacks
above everything else on the page.

Tab away from the modal and back. Confirm focus returns to the control
that opened it. Click the backdrop while a change sits unsaved. Confirm the
modal stays open. Click Close. Confirm it discards nothing that was already
saved.

Pass: all four hold. Each one is a visual or interaction judgment, not a
property a `bun:test` assertion can observe.

### Studio canvas-first components under dark scheme

Source: `studio-canvas-first-dark-scheme-qa` tasks 2.1-3.5.

Open the studio's canvas-first editor with the OS or browser color scheme
set to dark (`prefers-color-scheme: dark`). Work through every component
`studio-canvas-first-structure-editor` and `studio-canvas-first-form-builder`
added:

- **Checks rail**: default state, each source group (zod, structural, cel,
  registry, duration). Check the held-back state too (a later group
  waiting on an earlier one), and the all-clear state.
- **Palette**: default state, drag-hover state (the ghost that follows the
  pointer during a drag). Check each of Step/Subprocess/End.
- **Selection-driven inspector**: no-selection state. Check a selected
  step's sections, including its "Developer view" disclosure (expanded
  and collapsed). Check a selected path's sections too, including its own
  "Developer view" disclosure (raw CEL, expanded and collapsed).
- **Canvas-edge guard label**: a plain-English summary and a raw-CEL
  fallback.
- **Process-identity header bar**: clean, dirty, and just-published states.
- **Routed form editor**: the palette, the canvas, and the selected-field
  strip.
- **"Add a field" palette section**: default and drag-hover states.
- **Rule-row builder**: a row in its default state, an incomplete row, and
  the "Developer view" disclosure open and closed.
- **Override-strip "Developer view"** (the `visible`/`required`/`readonly`
  CEL escape hatch): open and closed states.
- **Field-catalog panel "Developer view"** (the JSON escape hatch): open
  and closed states. Select a custom-typed field first: this disclosure
  renders only then.

Pass: every state above reads well. Text against its background clears a
comfortable contrast. No state shows a light-mode color left over in dark
mode. No border or accent goes invisible.

`tokens.css` defines dark mode entirely through `@media (prefers-color-scheme:
dark)`, so a correct component needs no separate dark-mode styling of its
own. A defect here means a component reached for a hardcoded color, or a
primitive token, instead of the semantic layer. See
`.claude/rules/design-language.md`.

### Profile page: `displayName` and locale

Source: `add-personal-profile-page` task 7.6.

Log in. Open the account menu and follow it to the profile page. Set a new
`displayName` there and save. Change the language in the account menu. Reload
the page.

Pass: the profile page shows the new `displayName` after the reload. The
chrome renders in the chosen language. `test/http-account.test.ts` already
asserts what `GET` and `PATCH /account/me` store and return. This entry
confirms the shell reads both values back on a real reload.

Walk two more paths on an account that set no name. Its `display_name` column
holds `NULL`. The page renders the email in place of the name.

First, open the profile page and read the name control before typing. Pass: the
control is empty. It never seeds the email. Then change only the language and
save. Pass: the name control stays empty, and `display_name` stays `NULL`.

Second, on an account that has a name, clear the name control and save. Pass:
the control stays empty afterward, and the page renders the email again.

Both paths guard one defect. A control seeded from the resolved name writes the
email into the column on the next save. It also makes a name impossible to
clear. `packages/web/test/profileFields.test.ts` covers the mapping, and
`test/http-account.test.ts` covers the route. Neither one reaches the
save-and-reseed round trip, which needs the DOM.

This stays manual because the round trip crosses the browser's own address
bar and `localStorage`. Every file in `packages/web/test/` assumes no DOM.
The federated `editable: false` state is out of reach here too, for its own
reason. A login token always carries `iss: "bps"`, and such a token
guarantees a local `auth_users` row. That state gets its coverage in
`packages/web/test/profileFields.test.ts` instead.

### Studio canvas: "Fit to view" frames every step

Source: `fix-canvas-fit-to-view` task 4.3.

Seed the database and open a draft of `expense_approval`, which holds six
steps. Make the browser window narrow enough that the canvas column falls to
about 240px, well under the graph. Activate "Fit to view".

Pass: all six steps render, none clipped at an edge, none under the "Fit to
view" button. Activate it a second time. Pass: the framing does not move.

`packages/web/test/studio-canvas-fit.test.ts` covers the scale and pan as
numbers, and it cannot see this. The defect was an SVG that refused to render
outside its own viewport. Only a browser reports that. The second activation
matters on its own. It starts from the zoom level the first one set. The old
code read that state back through a transformed rect.

Then drag a Step from the palette onto empty canvas, twice. Do it once at the
opening zoom level, and once after a fit has zoomed out. Pass: each drop adds
a step.

The second drop is the one that earns its place. Panzoom scales the SVG
element itself, so a zoomed-out canvas leaves most of the wrap outside the
SVG's own box. The wrap paints the grid and shows the graph there, so an
author reads that area as canvas. For that reason `onPaletteDrop` resolves the
canvas through `.canvas-wrap`.

A synthetic mouse drag does not exercise this. The palette listens for pointer
events, and raw `mousedown`/`mousemove` leaves it inert. Use a real drag, or a
tool that dispatches pointer events.
