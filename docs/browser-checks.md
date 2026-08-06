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
