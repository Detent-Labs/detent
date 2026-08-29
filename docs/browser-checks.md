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
resolves to `::1` and the connection hangs.

`bash scripts/dev-up.sh` derives this checkout's own port, per
`worktree-isolation`. It publishes that port into the gitignored,
machine-generated `.devcontainer/docker-compose.ports.yml`.

A linked worktree then never collides with the main checkout's ports.

Source `scripts/worktree-env.sh` to read the port back. It prints the
derived `PORT_APP` into the shell you source it into.

The gitignored `.devcontainer/docker-compose.override.yml` stays the
contributor's own, for an extra binding of their own. A literal `3001:3000`
there would eventually collide with another worktree's derived port.
Publish one with a two-line override only for a binding the generated file
does not cover:

```yaml
services:
  app:
    ports:
      - "127.0.0.1:3001:3000"
```

The `127.0.0.1:` host_ip prefix is load-bearing on Windows: without it
Docker binds `[::]`, and the browser meets a connection reset. The engine
then serves the frontend bundle from `WEB_ROOT` on whichever host port you
chose. That is `3001` in the snippet above.

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

**Restart `bun run serve` after a backend edit.** Bun runs `src/` directly,
with no separate compile step. But a long-lived `bun run serve` process does
not reread its own source on a save. A browser check against a stale process
exercises the code from before the edit, silently.

`pkill -f "src/http/server.ts"` then a fresh `bash scripts/dev-up.sh`
restarts it with the right `AUTH_JWT_SECRET`. A bare `bun run serve` omits
that variable and breaks `POST /auth/login` outright.

Measured in `instance-query-data-source`. A stale server answered a publish
with no `findings` key. A fresh one, right after, answered the identical
request with the finding a fresh publish-time check now computes.

## Checklist

### Worktree dev-server hot reload

Source: `per-worktree-devcontainer-stacks` task 5.7.

Use a linked worktree, not the main checkout. Run `bash scripts/dev-up.sh`
first. Read its derived port with
`. scripts/worktree-env.sh && echo $PORT_VITE`.

Start the frontend dev server inside the container:
```
cd packages/web && bun run dev -- --host 0.0.0.0
```
Open `http://127.0.0.1:<PORT_VITE>/` in the browser. Edit a file under
`packages/web/src/` and save it.

Pass: the browser updates with no manual reload. This confirms
`vite.config.ts`'s `hmr.clientPort` (fed from `PORT_VITE`) points the HMR
websocket at the host-published port this checkout used. A fixed
in-container 5173 would point a differently-ported worktree at the wrong
socket.

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
is the precedent (`docs/current-state.md`). Without it, Panzoom's
native down-handler wins the race against React's synthetic dispatch. It
turns a node drag into a canvas pan.

### The panels screen (`studio-panels-screen`)

Source: stage 36. It replaced the shared modal's own four points. The routed
screen makes all four moot: no backdrop, no focus trap, no Close.

Open a draft in Studio. Choose Fields in the canvas rail's Process section.
Pass: the panels screen opens, the canvas is gone, and the address bar reads
`/studio/processes/<id>/edit/panels/fields`.

Read the third column. Pass: it lists every open check, grouped, in full. It
is not the one-line summary the inspector shows.

Type a name into the Contract view's outcome input without adding it. Switch
to Fields, then back. Pass: the typed text is still there. A remount would
have dropped it.

Reload the browser on that view. Pass: the same view reopens, not the canvas.
Press Back. Pass: the canvas returns and the draft keeps every change.

Load `/studio/processes/<id>/edit/panels/nonsense` directly. Pass: the canvas
renders and the screen reports no defect.

Break a field key so the checks rail names it, then fix it on the screen.
Pass: the entry leaves the rail with no reload.

Read the screen on a tall window, then on one under 36rem of content height.
Pass: the three columns fill the first, and hold the floor on the second with
the page scrolling. Measure it rather than judging it.

At 1440x1000 the grid reads 731px, with a 24px gap below and no page scroll.
The middle column scrolls its own overflow. At 1440x640 it holds the 576px
floor and the page scrolls. Item 1 archived a whole pass over this same
height, and this screen needed `flex: 1 1 0` where the canvas layout takes
`1 1 auto`.

### Studio canvas-first components under dark scheme

Source: `studio-canvas-first-dark-scheme-qa` tasks 2.1-3.5.

Open the studio's canvas-first editor with the OS or browser color scheme
set to dark (`prefers-color-scheme: dark`). Work through every component
`studio-canvas-first-structure-editor` and `studio-canvas-first-form-builder`
added:

- **Merged rail** (`EditRail`, `studio-edit-header-cleanup`): the "Add to
  canvas" group's default state. Check its drag-hover state too (the
  ghost that follows the pointer during a drag), for each of
  Step/Subprocess/End. The "Process" group's three rows (Fields, Data
  sources, Contract), each showing its own count.
- **Checks rail, beside the canvas** (nothing selected): the expanded
  grouped-list state, each source group (zod, structural, cel, registry,
  duration). Check the held-back state too (a later group waiting on an
  earlier one), and the all-clear state.
- **Checks rail, collapsed in the inspector** (`studio-edit-header-cleanup`):
  a step or a path selected. Check the collapsed one-line summary at the
  inspector's bottom edge. It carries three states: a count, "no count"
  when clear, the held-back indicator. Expand it in place. The grouped
  list beneath must match the standalone rail's own states above. It
  draws no border or padding of its own, so it never doubles the
  inspector's box.
- **Selection-driven inspector**: a selected step's identity zone and
  behavior tabs. Its diagnostics drawer too, including the "View raw
  JSON" toggle (expanded and collapsed). A selected path's own inspector
  too, including its own path-guard "Developer view" toggle (raw CEL,
  expanded and collapsed). That path-guard toggle is a distinct,
  out-of-scope control from the step's "View raw JSON" toggle. The
  no-selection state is the checks rail beside the canvas, covered above:
  the inspector itself never renders with nothing selected
  (`studio-edit-header-cleanup`).
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

Source: `fix-canvas-pan-dead-zone` tasks 3.1, 3.3, 3.4.

After a fit has zoomed out, start a drag from the empty margin it leaves
behind. Stay away from the graph and away from "Fit to view". Pass: the drag
pans the graph.

Scroll the wheel while pointing at that same margin. Pass: the graph zooms.
Scroll the wheel while pointing at "Fit to view" itself. Pass: neither pan
nor zoom happens.

Panzoom's own pan-drag, and this app's wheel listener, used to bind directly
to the SVG element. That is the same element the palette-drop defect above
already names. A zoomed-out canvas left most of the wrap outside that
element's own box. A drag or scroll started in the margin did nothing. That
is the same defect, for a different gesture.

`packages/web/test/studio-canvas-fit.test.ts` cannot see this either, for
the same reason it cannot see the palette-drop defect. It asserts numbers,
not which DOM element a pointer event reaches.

### Studio canvas: the graph centers on open, with no author action

Source: `canvas-autofit-browser-check` task 1.1.

Seed the database and open a draft holding one or more steps.

Pass: the canvas renders already framed, matching an explicit "Fit to
view" activation, with no action from the author.

`packages/web/test/studio-canvas-fit.test.ts` cannot see this. The defect
was a race in `@panzoom/panzoom` itself. Its own constructor applies
`startScale` synchronously. It defers `pan(startX, startY)` to a
`setTimeout`, at its default of `(0, 0)`.

Left there, that deferred call fires after the auto-fit effect's own
synchronous pan. It silently resets the graph to the top-left corner one
tick after mount. Fixed by computing the fit before constructing
`Panzoom`, and passing it as `startScale`/`startX`/`startY`. The deferred
call then lands on the same values already showing.

This check needs a real Panzoom instance racing its own internal timer
against real `getBBox()`/`clientWidth`. `packages/web/test/` assumes no
DOM at all. Nothing there can observe either side of the race.

### Users screen: the manager control past one page

Source: `admin-user-onboarding` task 8.6.

Put more accounts in the database than one request returns. `listUsers` caps
at `MAX_LIST_LIMIT`, which is 200, so 250 rows is enough. Insert them
directly with one statement carrying a constant `password_hash`. These rows
never log in.

Open `/admin/users`. Pass: the table holds every account, the last one
included. No "Load more" control appears.

Then open the manager control on any row. Pass: the choices hold an account
whose email sorts past the first 200. Pick it and save. Pass: the row's
manager cell shows that account's email.

The cell is the check. `managerLabel` falls back to the raw `user_id` for an
account the loaded array does not hold. A screen that renders one page
therefore prints `user_...` there. It also drops that account out of the
dropdown. Neither defect raises anything an operator can see as a defect.

`packages/web/test/admin-usersLogic.test.ts` pins both helpers against a full
set and a partial one. `test/auth-users.test.ts` pins the paging. Neither
reaches the screen's own cursor walk, which is what these two passes observe.

### Studio canvas: the columns fill a tall window, and the other areas do not

Source: `studio-canvas-fills-vertically` tasks 2.1, 2.2 and 2.6.

<!-- "canvas edit screen" is the glossary name of the screen. The linter reads
     its "edit" as a synonym of "change". -->
<!-- antislop: allow synonym-rotation -->

Seed the database. Open a draft on the canvas edit screen, in a window 1440px
tall or taller.

Pass: the three columns end at the top edge of the collapsed dock, which
`studio-editor-dock` added below them. The canvas stands taller than 36rem. No
page scrollbar appears.

Resize the window under 700px tall. Pass: the columns hold at 36rem, and the
page scrolls to reach their bottom edge. That is the floor, and it renders what
the fixed `height: 36rem` rendered before this change.

Then open one screen in each of the other three areas, in a tall window. Those
are app My-tasks, admin instances, and reporting. Pass: each keeps its own
`max-width`, stays centered, and stands at its content height. Empty space
below it is correct.

The third pass is the one that earns its place. The shell is a flex column now,
so every area screen is a flex item. A flex item whose inline margins are auto
is never stretched. It shrink-wraps to its content instead. Each screen centers
itself with `margin: 0 auto`, so all four shrink-wrapped. The canvas column
fell from about 1000px to 302px. `.shell > * { width: 100% }` is what holds
them.

A `bun:test` assertion cannot see any of this. Every pass reads a resolved
height or width, and `packages/web/test/` assumes no DOM at all.

### Studio: what the author role reaches, and what it refuses

Source: `split-studio-role-gate` task 9.5.

Seed the database. It provisions `demo-author@example.test`, holding
`system:author` alone. Log in as that account.

Pass: the shell lands on `/studio`. The nav offers Processes alone. Neither
Tools nor Templates appears. The drafts table renders its rows.

Open a process with two published versions, then its versions screen. Select
one version as diff side A. Select the other as side B. Pass: "Diff selected"
enables, and no "Plan migration" control renders beside it. Log in as
`demo-developer@example.test` and repeat. Pass: that control renders there.

That pass is the one that earns its place. The migration screen refuses the
author. A control leading there hands that account a refusal the product
itself offered. `ROUTE_ROLE` alone does not catch it. The map gates the
screen, and the button lives on a screen the map admits.

Navigate directly to `/studio/tools` and to a `/studio/processes/:id/migrate/1/2`
path. Pass: each renders "Not your screen", naming `system:developer`.

Open a draft on the canvas. Open the data sources panel. Add a data source.
Pass: the type picker lists `static` and `db.list`. Pick `db.list`. Pass: the
data list control renders and reports no defect.

Both controls read a route outside the studio prefix. A refusal there shows as
an empty control rather than a message, so read the network log to confirm.
Pass: `GET /registry` and `GET /admin/data-lists` both answer 200.

Open the Player. Build an instance there. Pass: the Record panel renders at
least one entry beside the form. `GET /instances/:id/record` answers 200. That read
admits the account only because it started the instance.

Last, log in as `demo-templates@example.test`. Pass: the shell lands on the
templates screen rather than on a refusal, and the nav offers Templates alone.

A `bun:test` assertion covers each route's status code already. It cannot see a
control the product renders beside a screen it then refuses. It cannot see an
empty picker that a 403 and an empty table render alike.

### Admin and reporting in German

Source: `i18n-catalogs-admin-reporting` task 6.2.

Log in as an account holding `system:admin`, `system:datalists` and
`system:reports`. Pick German in the account menu.

Walk every admin screen: instances, outbox, timers, users, migrations, data
lists, one data list's detail screen, and UI strings. Pass: no English word
remains. The date columns print German dates.

Narrow the window to about 1100px and read the four tables again: instances,
outbox, timers, users. Pass: no column clips its heading. A heading that wraps
to two lines is correct. A heading cut off at the column edge is not.

Measured on 2026-08-12. No heading clipped at any width. The users table is
the widest. It drives the page's own horizontal scrollbar at 1100px: 152px of
overflow in German against 4px in English. At 1280px and above German
overflows by 0. An operator tool goes wide, so that is graceful degradation
rather than a defect.

Read the number again if the users table gains a column.

Open a row's editors on the users screen: roles, manager, password. Pass: each
caveat line renders in German, and each `system:*` chip still reads as the
engine spells it.

Walk the three reporting views for a process with instances. Pass: each
heading, scope note and column heading is German. A duration prints `5,5 Std`
rather than `5.5 h`, and the SLA percent carries a space before the sign.

Switch back to English in the account menu, without reloading. Pass: the screen
under you re-renders in English at once.

Last, open the UI-strings screen. Pass: the area picker offers five entries,
ending with `admin` and `reporting`. Pick `admin` and `de`, override one key,
save, and open the screen that shows it. Pass: the override renders.

A `bun:test` assertion covers the key sets and the formatters already. It
cannot see a clipped column. It cannot see a literal somebody missed. And it
cannot see a German sentence that reads wrong beside its own control.

### Cases I started

Source: `starter-instance-list` task 6.2.

Seed the database and log in as a participant holding no reserved role.

Start a process from Start a process. Pass: the nav offers Cases I started
beside My tasks. Open it. Pass: the case is on the list, with a Running stamp
and its start date.

Activate the case's identifying control. Pass: the task screen opens for that
instance.

Now start a process whose first step names somebody else. Pass: My tasks does
not carry it, and Cases I started does. That is the gap this screen closes. An
inbox-shaped screen would hide it.

Discard a case from its task screen, then return. Pass: it stays on the list,
now stamped Cancelled, in the dormant tone rather than the refusal one.

Switch the account menu to German. Pass: the heading, the nav entry, every
stamp and the empty state read German. The date follows the German format.

Log in as an account that has started nothing. Pass: the screen states that in
words, not as an empty list.

A `bun:test` assertion covers the scope, the tone mapping and the route
already. It cannot see a stamp whose tone reads as a defect where a cancelled
case belongs. It cannot see a nav entry that wraps.

### The notification.email recipient picker

Log in as a developer and open a draft in the studio. Select a step, then add
an `onEntry` action and pick `notification.email` in the type control.

Pass: the config shows a generated form, not the raw JSON text area. That is
the whole point of the check. The `toActors` property is an array over three
fixed words. A property the descriptor cannot express drops the generated form
for `subject` and `body` along with it.

Pass: `toActors` shows one checkbox per word, for `candidate`, `claimant` and
`starter`. `to` keeps its free-text control.

Tick two boxes, then switch to the JSON view. Pass: the config reads
`"toActors": ["candidate", "claimant"]`, in that order whichever box you
ticked first. Switch back. Pass: the same two boxes still carry a tick.

Type an unknown word into `toActors` through the raw JSON path, then leave the
field. Pass: the form states which words it allows.

Open a step carrying an action from before this shipped, with `to` alone. Pass:
it loads with its addresses intact and no box ticked.

Clear `to` and untick every box, then publish. Publishing needs
`system:publish`, which the developer account does not hold, so switch to the
superuser account for this step. Pass: publish refuses and names that action by
its position, as `steps[6].onEntry[1].config.to`.

A `bun:test` assertion covers the descriptor and the schema already. It cannot
see a checkbox group that renders as a bare fieldset border. Nor can it see a
generated form that quietly reverted to a text area.

### Two tenants, one process

Needs SaaS mode, so this one costs setup. Build a control-plane database and
two tenant databases. Set `TENANT_CONTROL_PLANE_URL`. Provision both tenants
with `bun run src/tenancy/cli.ts add-tenant`. Then seed an account and a process
in each.

Point two hosts at the one server. `acme.localhost` and `globex.localhost` both
resolve to `127.0.0.1` on most systems. The first label is what the login reads.

Log in at `acme.localhost` as Acme's account. Pass: the login succeeds, and My
tasks lists Acme's cases.

Read the token's tenant from the network tab's login response. Pass: the token
carries `acme`.

Now open `globex.localhost` in a second browser profile. Log in as Globex's
account. Pass: that session lists Globex's cases and none of Acme's. This is
the check the whole model exists for. A green suite cannot make it for you: the
suite proves the lookup, not that two live sessions stay apart.

Take Acme's token and send it to `globex.localhost`. Pass: it still reads
Acme's data. The token names the tenant, and the host does not override it.

Stop one tenant's database and reload that session. Pass: the screen states a
defect where the data would sit, and the other tenant's session keeps working.

Unset `TENANT_CONTROL_PLANE_URL` and restart. Pass: the app behaves as it did
before any of this. One database, and no host requirement.

### Table-shaped data sources (`table-shaped-data-sources`)

Log in as the superuser. The publish step needs `system:publish`, which the
developer account does not hold.

Open Operations, then Data lists. Add a list `products`. Declare two
columns: `sku` as text, and `unit_price` as a number. Save. Pass: both columns
appear as headings on the values table, and each value row carries one input
per column.

Add two values, and fill both columns on each. Pass: the number input
right-aligns in the mono face, and the text input does not.

Take the `unit_price` column out and save. Pass: the screen states, before the
save, that the change drops that entry from every value. Dismiss that
confirmation. Pass: nothing changes. Then declare the column again and refill
it.

Declare eleven columns. Pass: the screen refuses the save and names the bound
where the data would sit. This is the case the bound exists for.

Take one column back out, so ten stand. Read the values table at a 1100px
window. Pass: that table scrolls sideways inside its own box, and the page
does not. The page still scrolls about 152px in German at that width. Every
admin screen does, and stage 13c measured it.

Retire the value you filled, then read its row. Pass: its attribute inputs
stay on screen and refuse to take a keystroke. The values route retires such a
row rather than rewriting it. An editable input would promise a write that
never lands.

Fill and clear a column key while the refusal list holds several lines. Pass:
every line the state calls for appears, and the whole list clears the moment
the last defect does. Two blank columns give the same sentence twice, and both
lines have to appear.

Switch the locale to German. Pass: every heading, every refusal line and the
warning above read in German, with no reload. Read the values table at
1100px. A German heading is longer, and this is where it shows.

Open Studio. Assemble a process with a `select` field bound to a `db.list` source
naming `products`. On the raw definition view, give that field a
`columnMapping` sending `sku` to a text field and `unit_price` to a number
field. Mark both targets readonly on the step's view. Publish.

Start the process from Tasks. Open the step. Pass: each option reads as its
label, then its SKU, then its price, separated by a middot. A screen reader
reads that as one line, because a native option carries one text run.

Pick a row and submit. Pass: the two readonly fields hold the row's values on
the next screen, and the participant typed neither.

Back in Operations, retype `unit_price` from number to text and save. Start a
second case, pick the same row, and submit. Pass: the submission succeeds, the
number field stays empty, and the instance record carries a
`datasource.attribute-dropped` entry naming the column.

### Which processes map a column (`report-column-usage`)

This walk continues the one above. It needs the `products` list, and the
published process that maps `sku` and `unit_price`.

Open Operations, then Data lists, then `products`. Read the "Used by" section.
Pass: the published process appears, and the line names `sku` and
`unit_price`, alphabetically, in the mono face.

Publish a second process that reads `products` and maps nothing. Reload the
list. Pass: the second process appears and its line says in words that it maps
no column. No blank space stands in for that sentence.

Take the `unit_price` column out and press Save. Pass: the warning carries two
sentences. The first names the column. The second names the process that maps
it, once. Dismiss it, and nothing changes.

Save the removal for real, then reload the list. Pass: the "Used by" line
still names `unit_price`. The mapping outlived the column. That is what this
section is for.

Take `sku` out as well and press Save. Pass: the second sentence names that
one process once, not twice.

Switch the locale to German and repeat the removal. Pass: both sentences read
in German, and the column keys stay untranslated in the mono face.

### The column-mapping editor (`column-mapping-editor`)

Source: stage 29's deferred builder. This walk needs a `products` data list
declaring `sku` and `price`, and a draft to edit.

Open Studio, then a draft, then Fields. Add a `db.list` data source naming
`products`. Pass: the key picker offers it, which is the widened read working.

Set a field's type to `select` and bind it to that source. Pass: the column
mapping editor appears under the `dataSource` picker. Set the type to
`multiselect`. Pass: it goes. Set it back to `select`. Pass: it returns.

Choose "Map a column". Pass: the first picker offers `sku` and `price`, and no
other key. The second offers the catalog's fields, without the mapping field
itself and without any group field.

<!-- antislop: allow synonym-rotation -->
<!-- Why: `.claude/rules/ui-glossary.md` fixes "JSON surface" as the one name
     for the raw definition view. The rule reads its "surface" as a synonym for
     the "render" this file uses of a browser painting a page. -->
Pick `sku` against a text field. Open the JSON surface. Pass: the body carries
`columnMapping` with that pair, and nothing else changed.

Map `price` onto the same field. Pass: the editor keeps both rows, and the
checks rail names the duplicate. The panel refuses no keystroke, and the rail
is where a publish rule reports.

In Operations, drop `sku` from the list. Save the draft, then reload the
editor. Pass: the `sku` row stays, keeps its target, and carries a warning. It
does not vanish. The data list screen reports the same key under "Used by".

### Canvas grid snapping (`canvas-grid-snap`)

Open Studio and a draft with several steps. This whole entry is a visual
judgment against the dots the canvas paints. That is why none of it is an
assertion.

Drag a step a short way and release. Pass: it settles on a dot, rather than
where the pointer stopped. It does not jump at the moment you let go. The node
you hold is the node you get.

Press a step and release without moving. Pass: it selects, and it stays where
it was. A click is not a tiny drag.

Zoom in two steps and drag a step again. Pass: the dots sit further apart, and
the step still lands on one. Zoom out past the fit scale and repeat. Pass: the
dots sit closer together, and the step still lands on one.

Pan the canvas, then drag a step. Pass: the dots travelled with the graph, and
the step lands on one of them. The dots and the steps move together, never
against each other.

Drop a step from the creation palette. Pass: it lands on a dot, at whatever
zoom you are at.

Open a draft nobody has dragged yet. Pass: every step already sits on a dot.
Drag one by a whole number of dots. Pass: it moves by exactly that, with no
extra nudge on the first drag.

### Canvas multi-select (`canvas-multi-select`)

Open Studio and a draft with four or more steps. The shift key carries the
whole gesture vocabulary. Hold it to build a selection. Release it to work as
before.

Click one step, then shift-click a second. Pass: both draw with the accent
outline, and the third column reports a count of 2. Shift-click the second one
again. Pass: it drops out, the count is gone, and the first step's inspector is
back.

Click a fifth step with no shift held. Pass: the canvas draws that step alone
as selected, whatever the set held before.

Shift-drag a band over two steps, starting on empty canvas. Pass: the band
draws as you move, the canvas does not travel under it, and both steps end up
selected. Watch the graph, not the band. A canvas that pans here is the defect
this check exists for.

Repeat that after panning and zooming in two steps. Pass: the band still lands
on the steps under it, and the canvas still holds still. Zoom out past the fit
scale and repeat. Pass: the band's outline is still a hairline, not a fat rule.

Shift-drag a band over nothing. Pass: the selection empties.

Drag one member of a three-step selection. Pass: all three travel together,
each lands on a dot, and their spacing is what it was. Drag a step the
selection does not hold. Pass: it moves alone, and it becomes the only
selected step.

Press a member of a selection and release without moving. Pass: nothing moves.

Select three steps and choose Remove steps. Pass: those three are gone, the
others stay, and the column shows the full checks rail again. If one of them
was the initial step, the start marker moved to a remaining step.

Select two steps and read the bottom of the column. Pass: the collapsed checks
summary still sits there, with the same count the inspector shows.

Now pan the canvas with a plain drag. Pass: it pans, as it always did. The
marquee took nothing away.

### Canvas edge routing (`canvas-edge-routing-styles`)

Open Studio and a draft with four or more steps. Most of this entry is a visual
judgment against the drawn routes. Little of it is an assertion.

Read the edges of a draft nobody has rearranged. Pass: a step and its successor
on the same row join by one straight line, with no corner. That is the common
case. Watch for the defect: a route that turns two corners to cross a straight
gap.

Find a path whose target sits on another row. Pass: the line leaves the source's
right edge and turns once. It runs vertically, turns again, and enters the
target's left edge horizontally. The arrowhead points into that edge.

Drag a step so one of its paths points backwards, to a step on its left. Pass:
the route leaves rightwards and drops to a row between the two. It runs back
past the target and turns in from the left. It does not cut diagonally across
the graph.

Drag a step so a backward path's two ends sit on one row. Pass: the route dips
below both steps rather than folding onto itself.

Choose Rounded corners. Pass: every corner becomes an arc, and the straight
same-row lines stay straight. No arc appears where there is no corner. Choose it
again. Pass: the corners go square.

Zoom in and read a corner. Pass: the arc is a quarter circle, and it does not
overshoot the corner it rounds.

Click a route where it turns, well away from a straight line between the two
steps. Pass: that path selects. Its row highlights in the inspector, so the
pointer follows the drawn route.

Look at the area a five-segment route encloses. Pass: it is empty canvas. A
filled shape there means the hit area lost its `fill: none`.

Save the draft and open it again. Pass: the style you chose is the style you
get, and every step kept its position.

A guard label on a routed path sits at the middle of the route. On a route that
turns, that puts it on a vertical run. Pass: it is legible and clear of every
step. It is not expected to sit between the two steps.

An edge crosses a step that lies in its path. Pass: it does. Nothing routes
around an obstacle, by decision, and stage 33's control points are the answer.

### Canvas subprocess marker (`canvas-subprocess-step-shape`)

Open Studio and a draft. Drag the palette's Subprocess entry onto the canvas,
beside an ordinary step. This entry is a visual judgment. No test in this
repository reads a rendered node.

Read the two nodes. Pass: the subprocess step carries a second rule inside its
rectangle, and the task step carries one rule alone. Watch for the defect: a
filled rectangle over the label and the key. That means the rule lost its
`fill: none`.

Select the task step and switch its "performed by" control to subprocess. Pass:
the rule appears on that node, with no reload and no other node touched. Switch
it back. Pass: the rule leaves.

Select the subprocess step. Pass: the outer rule turns to the accent, and the
inner rule stays the border colour.

Double-click the subprocess node's label. Pass: the rename field opens over the
node, and the inner rule stays clear of it on both sides.

Point at the subprocess node's connect handle. Pass: the handle draws whole. It
overlaps the inner rule's right edge by 3px and covers it there.

Set the subprocess step terminal. Then set another step as the initial step.
Pass: each node shows its stamp above the rectangle, and the inner rule sits
inside. Neither hides the other.

Switch to the dark scheme. Pass: both rules stay legible, and neither turns
black on a dark ground. Zoom away from 1 in both directions. Pass: the inner
rule scales with the node and stays inside it.

### Canvas floating anchors (`canvas-floating-anchors`)

Open Studio and a draft with three or more steps. Most of this entry is a
visual judgment against the drawn routes.

Drag a target step directly below its source, further down than across. Pass:
the path leaves the source's bottom edge at its middle. It enters the target's
top edge at its middle. Every segment stays square.

Drag that same target above the source instead. Pass: the path leaves the top
edge and enters the bottom edge. Watch for the defect: a route drawn on the
far side of the canvas. That means the upward transform did not map back.

Drag the target slowly around the source, through all four quadrants. Pass:
each anchor pair jumps to the facing sides as you cross the diagonal. No route
ever leaves at an angle.

Drag a target to the left of its source, on the same row, clear of it. Pass:
the path is one short straight line from the source's left edge to the
target's right edge. It does not loop around the outside of either node.

Now drag that target until the two nodes overlap horizontally. Pass: the route
takes five segments and comes in from outside the target's right edge.

Read the arrowhead in each of the four cases. Pass: it points into the side
the route enters, and it is never sideways to that edge.

Find a guarded automatic path whose route runs vertically. Pass: its guard
label and its priority badge sit on the route and stay legible. They do not
overlap a node.

Click a vertical route away from its ends. Pass: that path selects.

Press a step's connect handle. Pass: the handle still sits at the node's
right-middle, whatever side that node's own paths leave from. The preview is a
straight line to the pointer.

### Canvas edge waypoints (`canvas-edge-waypoints`)

Open Studio and a draft with three or more steps. Most of this entry is a
visual judgment against the drawn routes.

Click a path. Pass: one outlined square appears at the middle of its route,
and no other path shows a square. Click empty canvas. Pass: the square goes.

Drag that square well above both steps and release. Pass: the square fills in,
the route now climbs to it and back down, and every segment stays square.
Watch for the defect: a route that jumps to the new point without passing
through it.

Read where that route leaves its source. Pass: it leaves the top edge, not the
right edge. The anchor faces the waypoint, not the target.

Choose Rounded corners. Pass: every corner of every leg becomes an arc, and
the waypoint does not move. Choose it again.

Drag the filled square sideways. Pass: it moves, the route follows, and the
count of squares does not change. It lands on a grid dot.

Bend the same path a second time, using one of the two new midpoint squares.
Pass: the second waypoint lands between the right pair of points. The route
does not fold back on itself, which is what an insert at the wrong index
looks like.

Save the draft and open it again. Pass: the path draws through the same
waypoints, and every step kept its position.

Double-click a filled square. Pass: that waypoint goes. Delete the last one.
Pass: the path draws the straight route it drew at the start.

Find a guarded automatic path and select it. Pass: the midpoint square sits
over its guard label and stays grabbable. Deselect. Pass: the label reads
whole again.

### Canvas step groups (`canvas-step-groups`)

Open Studio and a draft with four or more steps. Most of this entry is a
visual judgment against the drawn boxes.

Click one step, then shift-click a second. Pass: the third column offers
"Group these steps". Activate it. Pass: a hairline box encloses both nodes,
carrying the name "Group", and the grid dots stay visible through it. Watch
for the defect: a box that hides a node, which means it drew in front.

Drag the box by its NAME. Pass: both members move by the same amount and land
on grid dots. The box follows them, and no other step moves. The interior is
not a handle. A drag started inside the box pans the canvas instead, which
leaves the marquee usable over a group.

Collapse the group. Pass: both members go, one node-sized box remains with an
opaque fill, and it reads "2 steps". A path from a step outside now ends on
that box. A path between the two hidden members does not draw at all.

Shift-drag a marquee over the collapsed box. Pass: the selection reports the
group's own member count, and the summary offers Expand and Ungroup. No
hidden step of any other group joins it.

Expand. Pass: every member returns to the position it held, and every path
draws again.

Save the draft and open it again. Pass: the box, its name and its members are
as you left them.

Ungroup. Pass: the box goes. Every step keeps its position and every path
still draws.

One case this walk leaves to a test. A path may carry a waypoint into a group
that then collapses. `studio-canvas-groups.test.ts` asserts two things about
its route. It passes through the waypoint, and it ends on the box's own side.

### View flags in the form editor (`studio-view-flags-module`)

Open Studio, `purchase-requisition`, step `finance_review`, the form editor,
and select the `vendor` field. Pass: the Visible checkbox reads ticked. This
field carries no `visible` key, and the old checkbox read this state
unticked.

<!-- antislop: allow synonym-rotation -->
<!-- Why: `.claude/rules/ui-glossary.md` fixes "JSON surface" as the one name
     for the raw definition view. The rule reads its "surface" as a synonym for
     the "render" this file uses of a browser painting a page. -->
Untick Visible. Pass: the Required and Read-only checkboxes disable, and any
tick each held clears. Tick Visible again. Pass: both re-enable, still
unticked. Open the JSON surface. Pass: this field's view entry carries no
`visible` key, no `required` key and no `readonly` key.

Tick Required, without touching Visible. Open the JSON surface. Pass: the
entry carries `required: true` alone. Untick Required. Pass: the key goes.

Open the checks rail. Pass: a `view` group sits after `duration`, reading
clear.

The strip itself cannot author `visible: false` beside `required: true`
anymore: unticking Visible clears Required in the same write. Reach the
hidden-required state through the JSON surface instead. Give a view entry
`visible: false` and `required: true` there. Pass: the checks rail's `view`
group shows one entry, naming the step and the field: hidden but required.
Set `visible` back to `true` (or delete the key). Pass: the entry clears.

Give a field `readonly: true` and `required: true` through the JSON surface.
Pick a step no other step's view lists that field editable on. Pass: the
`view` group shows a second kind of entry, naming that step and field. It
reads required and read-only, with nothing writing it. Add that field to
`Action.output` on any action. Pass: the entry clears.

Repeat the walk in German. Pass: the Visible, Required and Read-only labels
and the checks rail heading translate. The two new rail messages stay in
English, the same as every other engine-validator message the rail shows.

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: this file already carries the rule's two collisions elsewhere.
     "JSON surface" is `.claude/rules/ui-glossary.md`'s fixed name, and an
     earlier canvas section's "render" (of a browser painting a page) is a
     different concept the rule reads as a synonym for it. This section's
     own "issue" names the checks rail's EditorIssue concept, per the
     "View flags" walk just above it; an earlier canvas section's "defect"
     names an unrelated rendering bug the rule also conflates it with. -->
### The field matrix (`field-matrix-toolbar-and-inline-editing`)

Open Studio, `purchase-requisition`, the canvas rail's Process section.
Pass: a fourth row, Field matrix, sits below Contract, reading 54 as its
count.

Open the field matrix. Pass: 22 rows, `line_item` drawn as a group header
over its four children, indented once. Pass: 13 columns, in the process's
own step order. Pass: three columns hatch. They are `approval_routing`,
`issue_po` and `receipt_check`, the three steps with no view at all. Each
column header shows the step's `key` beside its label; each row header
shows the field's `key` beside its `type`.

Pass: a toolbar sits above the grid. It carries a "Hide inert columns"
toggle, a count line reading "54 view entries · 22 fields × 13 steps ·
232 cells the visible steps do not declare", and a seven-line legend,
visible with no click or hover.

Engage "Hide inert columns". Pass: the grid draws 10 columns, none of
them `approval_routing`, `issue_po` or `receipt_check`. The count line
now reads 10 steps and 166 cells. Every row still draws.

Select the "draft" column's `required` bulk badge. Pass: it presses, and
every live, non-CEL, non-gated cell in that column reads `required`
true. Select it again. Pass: every one of those cells clears its
`required` key.

Click a live cell's Visible checkbox off. Pass: the Required and
Read-only controls in that same cell disable at once, and both clear.
Click it back on. Pass: both re-enable.

Give a view entry `visible: false` and `required: true` through the
JSON surface, then return to the field matrix. Pass: that cell carries a
ring marker, the checks rail's Field matrix count reads 1, and the
`view` group names the field, exactly as the form editor's own walk
above already covers.

Tab to the grid with no cell activated. Pass: exactly one control across
the whole grid carries `tabindex="0"` — the grid's own roving cell.
Press an arrow key. Pass: focus moves one cell in that direction, and
the grid stays the page's one tab stop. Press Home, End, Ctrl+Home and
Ctrl+End. Pass: each moves focus as it did before this change.

Press Enter or Space on a live cell. Pass: its own Visible, Required and
Read-only controls become the grid's only reachable tab stops — three
checkboxes, one per flag. Press Escape. Pass: focus returns to the
cell, and the grid is again the page's one tab stop.
Activate a cell, then click elsewhere on the page. Pass: the cell
deactivates without focus jumping back to the grid.

Switch the studio's content locale to German. Pass: no column clips or
overflows at 1280px. No column width visibly derives from the English
step label; a German label wraps inside its column instead.

Open the canvas dock's Field matrix tab. Pass: it shows no toolbar, no
count line, no legend and no bulk badge. Its cells still take writes
inline. The dock body holds its own 16rem cap; the grid's own scroll box
fits inside it with no double scrollbar.

Open `subprocess-loan-parent` for one more check: badge-to-checkbox
alignment (`field-matrix-badge-alignment`). Mark `result`
(`field_l_result`) Technical and place it on `submit`'s form, exactly as
the Technical fields check below does. `submit`'s column now has one
live cell, and `visible` is its only eligible flag. Through the JSON
surface, add one more view entry to the `check` step: `amount`, with no
`required` or `readonly` override. `check`'s column now has all three
flags eligible. Neither edit needs to survive past this check. Pass:
`submit`'s column shows one badge, `visible`, sitting directly above its
own checkbox column with no drift. Pass: `check`'s column shows all
three badges, each sitting directly above its own checkbox column with
no drift, and the two ineligible slots in `submit`'s column leave the
`visible` badge's position unchanged rather than centering it.

On `check`'s three-badge column, confirm equal badge width
(`field-matrix-badge-equal-width`). Pass: the `readonly` (`RO`) badge
renders exactly as wide as `visible` (`VIS`) and `required` (`REQ`) — no
narrower, no wider — while each badge still sits above its own checkbox
column.

### Technical fields (`technical-field-marker`)

Open Studio, `subprocess-loan-parent` (`examples/subprocess-loan-parent.json`,
`key: "loan_application"`). `field_l_result` (`key: "result"`) is written by
the `check` step's `subprocess.outputMapping` alone; the body declares no
`view` on any step yet.

Open the field catalog and select `result`. Through the JSON surface,
place `result` on the `submit` step's form with `required: true`. This is
the stale-key case the proposal's Why describes.

Back in the field catalog, check Technical on `result`. Pass: a
confirmation names one key it will delete before the check takes effect.
Confirm it. Pass: the field catalog's Technical checkbox now reads
checked, and the JSON surface shows no `required` key left on `submit`'s
view entry for `result`.

Open the form editor's per-step strip for `submit`, `result` selected.
Pass: the strip offers Visible, Group and Span. It offers no Required or
Read-only control. Note how the strip's layout reads with the two
controls gone — this is the browser-check judgment design.md's Open
Questions leaves to implementation time.

Open the field matrix. Pass: `result`'s row header carries a
technical-field marker, visually distinct from the flagged-cell ring
marker. Note its exact visual form — the matrix's own open judgment.
No other row carries the marker. `result`'s cell on `submit` shows its
Required and Read-only checkboxes disabled; its row header offers no
Required or Read-only bulk badge, but still offers the Visible one.

Select a `type: "group"` field in the field catalog. Pass: its Technical
checkbox is disabled. Select one of its children instead. Pass: that
child's own Technical checkbox is enabled.

Publish the draft. Pass: it succeeds — the stale key is gone, and a
technical field's view entry now declares neither `required` nor
`readonly`.

Return to the field catalog and remove `check`'s `subprocess.outputMapping`
entry for `result` (through the JSON surface). Pass: the checks rail
reports `result` as an unwritten technical field, under the Fields view's
own badge — not the field matrix's, since the finding anchors on the
field rather than any one cell.

### Automatic canvas layout (`studio-canvas-auto-layout`)

Open Studio, `purchase-requisition`, the canvas. Pass: the toolbar
carries a third control, Arrange, beside Fit to view and Rounded
corners.

Click Arrange on the freshly seeded draft. Pass: no confirm dialog
appears, since no step carries a hand-placed position yet. All 13 steps
land at distinct, non-overlapping positions, in a legible left-to-right
flow. The browser console shows no error.

Click Arrange again. Pass: a confirm dialog appears this time, since
every step now carries an explicit position from the first arrange.
Decline it. Pass: every step's position stays exactly where the first
arrange left it.

Drag a step Arrange has just positioned, by a real pointer gesture
covering exactly 3 grid steps in `x` and 2 in `y`. Pass: the step lands
at exactly that delta from its arranged position, with no extra offset.

Select two steps and group them. Note their relative offset. Click
Arrange, accept the confirm. Pass: the group's own position on the
canvas changes, and the two members keep their exact prior relative
offset.

Collapse the group. Drag a waypoint onto a nearby path by hand. Click
Arrange, and accept the confirm. Pass: the collapsed group still
renders as one box, and its members still keep their relative offset.
The waypoint is gone.

Switch the account menu's Language to German. Pass: the button still
reads "Arrange". The studio catalog carries English only, the same
finding the field matrix's own walk above already made. The toolbar's
three buttons stay well inside a 1280px viewport either way.

### The editor dock (`studio-editor-dock`)

Source: `studio-editor-dock` tasks 9.6 to 9.14.

<!-- "canvas edit screen" is the glossary name of the screen. The linter reads
     its "edit" as a synonym of "change". -->
<!-- antislop: allow synonym-rotation -->

Seed the database and open a draft on the canvas edit screen.

Pass: the dock sits below the three columns, collapsed. It shows one control
row and no tab body. That control is a `<button type="button">` carrying
`aria-expanded="false"` and `aria-controls="studio-dock-body"`.

Open the dock. Pass: three tabs appear, Changes active. The grid holds at or
above 36rem, and the canvas stays visible above the dock.

Measure the height at a 1440 by 900 window. The header rows take 186px. The
grid therefore draws 40rem collapsed and 36rem open, and the page then
scrolls. Both numbers are the point of the check. Read them rather than
judging them.

Choose Paths. Pass: `purchase-requisition` gives 22 rows over five columns.
Each row names the step the path leaves and the step it enters. An automatic
path shows its priority and its guard's CEL.

A manual path with neither reads "No priority" and "No guard". The body holds
16rem. It scrolls inside itself.

Choose Field matrix. Pass: the grid draws inside the dock. Scroll it and watch
the column header. Pass: the header stays put.

That is the check that earns this walk. Lifting `.studio-matrix-scroll`'s cap
leaves the header behind. The cap comes down instead. `overflow: auto` keeps
that box a scroll container with nothing to scroll.

Rename the process without saving, then read Changes. Pass: the entry reads
`label.en`, its first value is the published name and its second is the unsaved
one. That order is the whole point. The reverse reads every addition as a
removal.

Save, then publish from the header menu. Pass: the tab refetches with no
reload, and it reports that the draft matches the version just published.

Open the panels screen, the form editor, and the JSON surface in turn. Pass:
none of the three shows the dock, control included. The JSON one is a rule
rather than a preference. The Field matrix tab writes the draft body, and
`studio-json-view` keeps every such component out of reach there.

Narrow the window to 1024px wide with Paths open. Pass: the table scrolls
inside the dock. Neither the page nor the screen scrolls sideways.

Switch the account menu's Language to German. Pass: the dock still reads
English. The studio catalog carries English only, the same finding the two
walks above already made.

### `useFail`: no refetch loop

Source: `ponytail-web-client-catalog-dedup` design.md decision 2.

Open any screen that loads on mount through `useFail`, for example the admin
Users screen. Watch the network panel for ten seconds. Pass: the load request
fires once. Reload the page and repeat on a second screen from a different
area, for example the studio Templates screen.

This stays manual because the hazard is a render loop, not a wrong value.
`useFail`'s returned callback must keep one identity for the life of the
component. A re-created callback would make every effect listing it as a
dependency re-run each render. That re-run would refetch in a loop.
`packages/web` has no DOM test runner. `studio-draftToolbarState.test.ts` and
`studio-processHeaderLogic.test.ts` both note this in their own headers. No
suite here ever re-renders a component, so none could catch it. A pure-logic
test covers `is401`, the branch inside the hook; it cannot cover the hook's
own render stability.

### Studio canvas: drop a rail step onto a path to insert it

Source: `canvas-edge-affordances` tasks 6.6-6.8.

Open a draft holding at least one path between two steps. Drag a Step from
the edit rail and hold it over that path before releasing.

Pass: the path renders in a heavier, accent-colored stroke while the drag
holds over it. No other path does. Release. Pass: a new step lands at the
release point, selected. The source step's path now names the new step, with
its guard and priority unchanged. The new step holds one path naming the old
target.

Drag an End from the rail over the same kind of path and release. Pass: the
end step drops free-standing, at the release point. The path it released over
still names its original target. No drop-target stroke drew during that drag
either.

Then collapse a group holding the source step, so its path renders to the
group's box. Repeat the first drag over that path. Pass: the drop still
inserts the new step. The new step joins no group and stays visible.

A synthetic `click` cannot drive this. The rail's drag reports its moving
position through `onPointerMove`. Only a real pointer sequence fires that, a
tool that dispatches trusted pointer events, e.g. `playwright-cli`.

### Panels screen: Fields and Data sources as list and detail (`panels-list-and-detail`)

Source: `panels-list-and-detail` tasks 6.5-6.6.

Open a draft with many fields (`purchase_requisition`, 22 fields, one data
source) and go to `/edit/panels/fields`.

Pass: the rail lists all 22 field labels under Fields, indenting
`line_item`'s four children once. No row prints a key. The main view renders
one field's editor, the first (`cost_center`), not all 22 stacked. That row
alone carries `aria-current`.

Click a top-level field (`line_item`, a group). Pass: the view switches to
that field's editor and the rail marks it current.

Click a nested child (`item_description`, under `line_item`). Pass: the rail
marks the parent (`line_item`) current, not the child. The child's own input
scrolls into view, inside the still-open group editor.

Click "+ Add field" (either the rail's own entry or the panel's own button;
both call the same handler). Pass: a new "(unnamed field)" row appears at
the end of the rail sub-list, selected at once. Its key input is empty and
focus-ready. It carries an issue-mark badge reading "1", aria-label "1
issues": the empty key is a real validation issue, live.

Click "Remove field". Pass: the neighbour (the field before it, since it was
last) becomes selected.

Open the Data sources view. Pass: the Fields sub-list disappears, and a Data
sources sub-list appears in its place. The two never show at once. The new
sub-list lists `approved_vendors` and an "+ Add data source" entry.

Click "+ Add data source". Pass: a new "(unnamed data source)" appears,
selected at once. Click "Remove data source". Pass: `approved_vendors`, the
only remaining entry, becomes selected.

Reload the page: a fresh navigation to the same URL. Pass: selection resets
to the first field, `cost_center`. That matches the reset a canvas round
trip already gives every other screen-owned selection here.

Throughout: zero console errors or warnings. `playwright-cli console`
reported 0/0. A screenshot confirmed the field CSS: label above control, the
`key` input in the mono face, hairline dividers between rail rows. Every
input took a sharp corner, and the checks rail read clean throughout.

### Base-locale control moves the content locale on a well-formed value

Source: `ponytail-studio-small-cuts` task 5.1.

Open a draft's canvas edit screen (`purchase_requisition`). Open the process
header's `⋮` menu. Type into the `baseLocale` control: first `d` alone, then
complete it to `de`.

Pass: after `d`, the content-locale switcher still reads `en` selected. A
`d` option appears in the list, but selection stays put. After `de`, the
switcher's selection moves to `de`. Typing `en` back over it moves the
switcher back to `en`.

This exercises the kept `processHeaderLogic.ts` (`resolveBaseLocaleChange`).
It also exercises task 1's `EditScreen.tsx` `useState` change. The
base-locale wiring and the `savedBody` state it feeds both had to survive
that conversion.

### Save, then a 409 conflict and reload, read the unsaved-changes gate correctly

Source: `ponytail-studio-small-cuts` task 5.2.

Open the same draft in two tabs. In tab 2, edit the process label and save.
That advances the revision. In tab 1, edit the process label differently
and save.

Pass: tab 1's save answers 409. The header shows "Unsaved changes" before
that save and after the 409 too. A conflict banner appears with a Reload
action.

Click Reload. Pass: the header reads "Saved". The revision number advances
to match tab 2's. Edit the label once more. Pass: the header reads
"Unsaved changes" again. The reload does not turn the dirty gate off for
good.

This is the regression task 1's `useReducer`-to-`useState` conversion
exists to guard. `EditScreen.tsx` now seeds `savedBody` with
`useState<Draft>(() => structuredClone(draft))`. It advances that state
only through `(body: Draft) => setSavedBody(structuredClone(body))`.
`DraftToolbar`'s `reload()` calls that wrapper.

A dropped clone would leave a byte-identical draft reading dirty. So would
a dropped advance on reload. Either bug persists for the rest of the
session. `studio-draftToolbarState.test.ts` pins that exact bug at the unit
level. Here the real save/conflict/reload sequence drives it in a browser
instead.

### Selecting a path switches the inspector to the source step's Paths tab with the row highlighted

Source: `redesign-step-inspector`.

On the canvas, select a step. Then click one of its outgoing path edges. A
guard label works as a click target.

Pass: the inspector switches to the path's source step. The Paths tab
shows, marked current in the behavior tab row. The selected path's own row
shows a highlight border, distinct from the tab's other rows.

This exercises `defaultTabFor`'s `selectedPathId ? "paths" : "assignment"`
ternary, called from `StepsPanel.tsx`'s selection effect.

### The no-assignment warning renders on a non-terminal step and not on a terminal one

Source: `ponytail-studio-small-cuts` task 5.4.

On the canvas, select a non-terminal step with no `assignment` set. Use
`approval_routing` on the `purchase_requisition` draft. Open its Assignment
tab. Then select a terminal step with no `assignment`, `closed`, and open
its Assignment tab too.

Pass: the non-terminal step shows "This step has no assignment. Only the
starter or an admin can act on it, and it stays out of everyone's My-tasks
inbox. Publishing still works." beside the assignment editor. The terminal
step shows no such warning.

This exercises task 2.2's inlined `assignmentWarning` guard. It now reads
as one local `assignmentWarningText`, computed once in `StepsPanel.tsx` and
read at both the conditional and the paragraph body.

### The Tools screen's CEL scratchpad populates its field catalog

Source: `ponytail-studio-small-cuts` task 5.5.

Open `/studio/tools`. Pick a process (`purchase_requisition`) and its
current draft as the field catalog. Type a CEL expression that names a real
field key, `data.quantity > 0`. Then type one that names a bogus key,
`data.totally_bogus_field_xyz > 0`.

Pass: the real-field expression reports "Parses and type-checks against
this catalog." The bogus-field expression reports a "No such key" error
naming it. Both outcomes need the field list to have populated from the
fetched draft body. Neither reads correctly against an empty list.

This exercises task 2.3's inlined `extractFields` read, now inline in
`ToolsScreen.tsx`'s `selectCatalog` callback.

### Canvas: node, group, waypoint, connect-drag and marquee gestures still move, connect and select

Source: `ponytail-studio-small-cuts` task 5.6.

On the `purchase_requisition` draft's canvas, run five gestures. Drag a
step node to a new position. Multi-select two steps, group them, then drag
the group box. Select a path and drag its midpoint handle to insert a
waypoint. Drag a non-terminal step's connect handle to another step to
create a new path. Shift-drag a marquee over several steps.

Pass: each gesture gives the same result the pre-change five separate
handlers gave. The node's and the group's on-screen position moved to the
drop point. Each element's `getBoundingClientRect()`, read before and
after, confirmed the move. The waypoint drag inserted a real waypoint: a
second midpoint-insert handle appeared past it.

The connect-drag added a new path to the source step's `paths` array,
targeting the correct step id. The visual edge alone did not confirm this
at this draft's zoomed-out scale, so the JSON surface did. The marquee
selected exactly the steps inside its bounding rectangle: "Steps selected:
5", with all five outlined.

`playwright-cli`'s `drag <start> <end>` command does not apply here. It
only drags between two existing elements, never to an arbitrary canvas
point. Every gesture instead needed a raw
`mousemove`/`mousedown`/`mousemove...`/`mouseup` sequence. Each read fresh
coordinates from `getBoundingClientRect()`, via `playwright-cli run-code`.
The accessibility snapshot's refs carry no pixel position. Panzoom's own
scale and pan also move node positions between actions.

The marquee needed one thing more. It needed
`page.keyboard.down('Shift')` before the mouse sequence, and `up('Shift')`
after it. `click --modifiers` only applies to a full click action. It never
applies to a raw mousedown/mouseup pair.

The connect-drag's target handle is small. At this draft's fit-to-view
scale it draws as roughly a 5 to 10 pixel circle. `playwright-cli
mousewheel 0 -- -N` zoomed the canvas in enough to hit it. Pass the `--`
explicitly. A bare negative delta parses as a flag instead.

A tall inspector column can also push the canvas element far down the
page. That is a pre-existing layout property, unrelated to this change.
Reading `getBoundingClientRect()` fresh before each interaction, instead of
reusing an earlier snapshot's ref, handled that on its own.

### Chrome.tsx account menu: native Popover open, position and dismissal

Source: `web-client-ponytail-cleanup` task 11.6.

Sign in and open the account menu from the header's Account button. Nine
checks follow. A trigger click, an outside click, and Escape come first.
Then the language picker, an area-switcher entry, and the profile entry.
Then a mousedown-inside/drag-outside/mouseup sequence, a same-browser
floor check, and the logout entry.

Pass, by check:

- Trigger click: the menu opens. `aria-expanded` reads `"true"`. A rect
  check on the menu and the trigger confirms the position. The menu's top
  sits at the trigger's bottom edge, plus the gap. Its right edge lines up
  with the trigger's. It does not center in the viewport.
- Outside click: the menu closes. `aria-expanded` returns to `"false"`.
- Escape: the menu closes. `document.activeElement` is the trigger button
  again.
- Language picker: a changed selection changes the interface locale. The
  menu stays open; `:popover-open` still reads true.
- Area-switcher entry: the menu closes and the shell navigates to that
  area's URL prefix.
- Profile entry: the menu closes and the shell navigates to `/profile`. A
  second click on it while already on `/profile` closes the menu too. That
  case carries no route change, so `Chrome` never unmounts: the explicit
  `hidePopover()` call task 7.3 added is what closes it there.
- Mousedown-inside/drag-outside/mouseup: the menu stays open through the
  whole sequence. Native light-dismiss keys off the pointerdown location,
  not the pointerup location. The pointerdown lands inside the menu, so no
  dismissal arms at all. Design.md's stated risk, that the drag might
  close the menu, did not materialize.
- Same-browser floor check: login, the task list and the studio canvas all
  render and respond. The account menu opens, positions below and
  right-aligned, and dismisses on an outside click, all on the one browser
  `playwright-cli` drives. That browser runs materially newer than the
  `build.target` floor (Chrome 114/Safari 17/Firefox 125). This check did
  not install and drive those exact versions. It confirms the mechanism
  works on a modern engine, not on the stated floor itself.
- Logout entry: the menu closes and the shell returns to `/login`.

A CSS bug surfaced during this walk. `.shell-menu` carried an unconditional
`display: flex`, needed back when the menu mounted only conditionally.
That declaration outranked the popover UA stylesheet's
`[popover]:not(:popover-open) { display: none }`: an author-origin
`display` wins the cascade over a user-agent one, regardless of
specificity. The closed menu stayed laid out at its would-be open
position and intercepted the trigger's own click. The fix moves
`display: flex` and the rest of the flex layout onto a
`.shell-menu:popover-open` rule. The UA's `none` now stays in force while
closed.

### The Field tab's disclosures, the rail row, and the Default-value editor (`field-catalog-editor-rework`)

Source: `field-catalog-editor-rework` task 6.5.

Open a draft with several fields (`purchase_requisition`) and go to
`/edit/panels/fields`.

Pass: the rail lists each field by its resolved label and friendly type
alone. No row prints a key.

Select a field. Pass: the Field tab shows key, label, description, type
and the Technical checkbox without opening anything. A badge beside the
label reads "base locale". "How it will look" and "Used in" both start
closed.

Open "How it will look". Pass: it expands in place. Switch to the Rules
tab, then back to Field. Pass: the preview is still open, and the Field
tab's own content is the only content on screen. Values and Rules render
nothing while another tab is active.

Switch to the Values tab on a `select` field with static options. Pass:
three ruled zones show in order: "Where values come from", "Default
value", "Column mapping". The third shows only when the field's data
source is mappable. Choose an option in the Default value zone's own
`value` control, then switch to the JSON surface. Pass: the field's
`default` key carries that option's value.

Click "Edit as CEL" in the Default value zone and type an expression.
Pass: no parse error shows, and the JSON surface's `default` key now
carries `{ lang: "cel", src: "<the typed text>" }`.

A CSS bug surfaced during this walk. It is the same defect class as the
`.shell-menu` one above. `.field-tab-panel` carried an unconditional
`display: flex`. That outranked the UA stylesheet's own `[hidden]` rule.
All three tab panels stayed laid out and visible at once, stacked
vertically. That held regardless of which tab the tablist marked
selected.

The fix moves `display: flex` onto a `.field-tab-panel:not([hidden])`
rule. The UA's `none` now stays in force for an inactive tab.

### The widened registry group and the chaining-target fetch (`validation-sequence-module`)

Source: `validation-sequence-module` task 7.3.

Open a draft naming an action type the server does not register. Open the
checks rail. Pass: the registry group shows a real issue naming the
unregistered type, not a held-back state. It still shows
`registryConfigHeldBack`'s own note below that issue, since the
config-validation half stays held back regardless.

Add a `process.start` action mapped into a field its target process does not
declare. Pass: the checks rail's CEL group names that field. `ActionListEditor`'s
row for that action carries no "chaining target" badge, since the target
loaded successfully.

Add a second `process.start` action targeting a process that is not
published. Pass: that action's own row carries the "chaining target" badge.
The CEL group shows no entry for that site. A not-checked site never reads
as a clear pass.

With a draft already holding a resolved chaining target, edit an unrelated
field elsewhere in the draft. Watch the network panel. Pass: no repeated `GET
/processes` or `GET /processes/:id/versions/:v` request fires for that
already-resolved target.

Separately, build a draft carrying two `process.start` action sites that
target the same `processId`. Pass: only one `GET /processes/:id/versions/:v`
request fires for that shared target, and both sites' rows read checked.

`test/validate-sequence.test.ts` and
`packages/web/test/studio-draftProvider-chainingFetch.test.ts` already assert
the underlying dedup guard and the rail's data-layer state as pure logic.
This entry confirms the same behavior through a real fetch sequence a
browser drives, which those two files cannot observe.

### The field matrix's checkbox colors (`field-matrix-checkbox-colors`)

Open `purchase_requisition`'s draft, the panels screen's Field matrix view.
Pass: the legend's seventh line reads "Each checkbox's color names its own
flag:" followed by three swatches, one per `visible`/`required`/`readonly`.

Pass: every live cell's checked `visible` checkbox renders the same blue.
Every checked `required` checkbox renders the same gold-brown, and every
checked `readonly` checkbox the same violet. Each swatch's color matches
the grid's own. Reopen the same process on the canvas dock's Field matrix
tab. Pass: the same three colors render there, with no toolbar and no
legend.

Through the JSON surface, give a view entry `required: true` and
`visible: false` directly. This bypasses the checkbox's own gating, which
would otherwise clear `required` the moment `visible` goes false. Pass:
back on the grid, that cell's `required` checkbox reads checked. It shows
its own gold color, at reduced opacity, not neutral gray.

Click that checkbox with the mouse. Pass: the click has no effect. The
checkbox stays checked. The underlying view entry keeps both its
`required` and `visible` keys exactly as set. `aria-disabled` guards the
write here. It refuses the click itself, the same job the old native
`disabled` attribute did.

A technical field's row never carries the readonly color at all
(`checkUnwrittenTechnicalFields`'s own walk above names one, `result`).
Its `readonly` checkbox renders unchecked, dimmed, and uncolored.
`FLAG_DEFAULT.readonly` reads `false` for an absent key. That holds
regardless of the engine's own forced `true` for that field.
`design.md`'s Non-Goals section names this as a pre-existing gap, out of
scope here.

This walk checked dark mode by reading the parsed `@media
(prefers-color-scheme: dark)` rule from the live stylesheet. It did not
toggle the OS theme. Each token's dark value matched `tokens.css`
exactly. Task 1.3 already ran the contrast math: every light/dark pair
clears 4.5:1 against both `--color-surface` values.

### Task screen: save a form draft, navigate away, and restore it

Source: `instance-form-drafts` task 5.6.

Log in as a participant and open a running task. Edit a field, then click
Save. Pass: the screen stays on the task, and a confirmation naming the
save time appears. It never navigates away.

Leave the task for My tasks, then reopen it. Pass: the edited field shows
the saved value. A notice reports the restored form draft and names the
save time.

Submit the task down a path. Pass: the instance moves on. Route the case
back to the same step through the admin area, or start a fresh case that
reaches it. Pass: the field shows its committed value, not the earlier form
draft. A submit clears the form draft, and the `step_id` gate holds even if
it did not.

`test/instance-drafts.test.ts` and `test/http.test.ts` already assert the
save, restore and clear mechanics against the API. This entry confirms
`TaskScreen.tsx` renders the Save control, the two notices, and the
seed-from-draft behavior, which those files cannot observe.

### Studio: path creation names

Source: `require-path-key-label` task 5.6. No defect record exists for
these behaviors, so `development-toolchain`'s split rule keeps them manual.
Each is a pointer gesture or a visual judgment. No `bun:test` assertion can
observe it.

Open a draft with at least two named steps on the canvas.

Drag a connect handle from one named step to another. Pass: the new path
appears in the inspector's Paths tab with a derived `label` reading
`"<source step> → <target step>"`, and a non-empty `key`.

Drag a connect handle from a step to empty canvas. Pass: the gesture creates
both a new step and a path to it. The new step carries no name yet. The new
path's label names it with the "unnamed step" placeholder, on the target
side.

Drop a step from the edit rail's palette onto an existing path. Pass: the
retargeted path keeps its own `key`/`label` unchanged. The new path from
the dropped step carries the "unnamed step" placeholder on its source side.

Open a step's Paths tab and use "add path" without choosing a target
first. Pass: "add path" stays disabled, and clicking it creates no path
even if forced. Choose a target in the new selector, then click "add path".
Pass: a new path appears with a derived `key`/`label` matching the chosen
source and target step. The target selector resets to no selection
afterward.

### Instance screen: the Audit Log section

Source: `instance-audit-log-view` task 3.2.

Seed an instance whose audit log holds several `set` entries for a
redactable field, then redact it. Open its `/admin/instances/:id` screen.

Pass: an Audit Log section renders below Record. Each entry shows its
field id, operation, actor, source and timestamp, in `seq` order. The
redaction clears some entries: the `set` rows its own `body.data` wipe
wrote, and the explicit `redact` row itself. Every one of those shows a
"Redacted" stamp in place of a value. None shows a blank cell. The
`redact` row alone carries the reason line.

A heading-level "Verified" stamp sits beside "Audit log". It sources
from one `GET .../audit/verify` call. The network log shows that call
firing once per screen load, not once per page turn.

Push the same instance's audit log past 200 entries, task 1.1's page
size. Pass: a "Load more entries" control appears. Activating it appends
the remaining entries. Paging repeats no entry and skips none. The last
page's own last entry is the log's true last entry, and the control then
disappears. Paging through entries triggers no second call to
`.../audit/verify`.

Measured on 2026-08-28. The section reused the existing
`admin-timeline`/`admin-load-more` classes. It reused the existing
`admin-badge` stamp component too, with no new tone, matching
`design.md`. The redacted marker reused the instance-level redaction
badge's own tone.

`test/admin-queries.test.ts` and `test/http-admin.test.ts` already
assert the read, the cursor paging and the role gate against the API.
Neither can see a cleared `set` row's absent `value` next to an
authored JSON `null` in a rendered page. This entry confirms the screen
draws that distinction correctly. It also confirms a real "Load more"
click drives the paged list to completion. No row repeats, and none is
missing.

### The report builder (`instance-data-tables`)

Log in as `demo-superuser@example.test` (holds both `system:reports` and
`system:admin`, so the same account both builds reports and passes the
process `read` gate). Open `/reporting/reports`.

Pass: the empty state reads "You have no reports yet." Choose "New report".
Pass: the process picker gates the screen. No filter/column controls render
until you choose a process, which mirrors the three existing views' own
process-first shape.

Pick a process with at least one instance. Pass: the "Add column" picker and
"Add comparison" button populate from real field ids. Both stay disabled
against a process with zero instances. Column choices resolve from in-range
instances' own pinned versions, not the bare field catalog.

Name the report and add one direct-field column and one merge column naming
two source fields. Reorder a column with "Move earlier"/"Move later", and
remove a merge source. Add a viewer and an editor by id. Pass: the owner's
own editors entry shows "Owner, always an editor" with no Remove control
from the start. The UI blocks the one removal the engine also rejects,
before a request is ever sent.

Run "Preview table" against seeded instances covering a real value, an
unset field (no-value), and a redacted instance. Also include an instance
with both merge sources set, and another with only one set.

Pass: the value cell prints plain, and the unset cell prints an em dash. The redacted cell
prints a solid bar with no visible text. An `aria-label` carries "Redacted"
for a screen reader. The merge cell with two sources concatenates and
carries a "Collision" marker beside it. The column header states the
aggregate count as "1 collision", singular, not "1 collision(s)".

Save. Pass: the URL moves to `/reporting/reports/<id>`, and the reports list
now shows the saved name with an "Owner" tag. Reopening it from that list
restores the same process, filters, columns and share lists exactly,
including the just-added viewer. Confirm this after a full page reload, not
only from the in-memory state a save leaves behind.

Push a process past the 50-instance execution bound and preview again. Pass:
a stated notice starts "This table is incomplete" and explains more
instances matched than the table can show. The table never goes silently
short with no explanation.

Switch the account menu to German and repeat the preview. Pass: every
control translates, including the owner-lock caption, the sharing hint, the
redacted/no-value cells' wording, and the collision marker. No English word
remains. No singular/plural literal survives either ("1 Kollision", not "1
Kollision(en)").

Measured on 2026-08-28. This walk did not reach the "not-in-this-version"
cell state or the column picker's per-field version-coverage note. Both
need a second published version with a diverging field catalog and an
in-range instance on each. `test/reports.test.ts`'s 3.4/3.5 cases already
exercise both directly against the engine. This walk already confirmed
that the same `fieldCellDisplay` switch renders three of its four kinds
correctly. That switch renders the fourth kind by the same code path.

`test/reports.test.ts` and `test/http-reporting-reports.test.ts` already
assert the CRUD, membership, redaction-priority and truncation rules
against the API. Neither test can see a stale ref after a client-side route
change. Neither can see an accessible name a screen reader gets. This walk
caught the "Add columnAdd" duplicate name, since fixed in
`ColumnEditor.tsx`'s `FieldPicker`. Nor can either see a save that silently
fails to persist a locally-added viewer. This walk confirms that round trip
with a real reload, rather than trusting in-memory state.

### The instance.query data source's purpose-built form

Source: `instance-query-data-source` tasks 6.1-6.5.

Open a draft's Data sources panel (Process links -> "Data sources" ->
"+ Add data source"). Select `instance.query` in the type picker. Pass: the
purpose-built form replaces both the generated form and the raw JSON
textarea, for this type alone. Switch the type to `db.list` and back. Pass:
`db.list`'s own dedicated list-key picker still renders untouched.

Pick a target process. Pass: the step checkboxes and the label-field,
comparison-field and attribute-field pickers populate with that process's
real step and field labels. They draw from every published version's
catalog, never free text. Check a step, pick a label field, add one
comparison row and one attribute row, filling every control.

Click "Edit as JSON". Pass: the textarea holds the plain `{ type, config }`
object the raw JSON path would have produced. It carries the same
`processId`, `stepIds`, `labelFieldId`, `where` and `attributes` keys the
form's controls wrote, byte for byte.

Hand-edit `labelFieldId` to an id no version declares, then click "Edit as
form". Pass: the form re-renders with every prior control intact. The
label-field row shows a stale-reference warning as a sibling of the picker,
not inside its `<label>`. The picker's own accessible name stays "label
field", not lengthened by the warning text.

Save the draft, then Publish. Use an actor holding `system:admin`, or a
process-scoped `read` grant on the target; a developer with neither sees a
real, correctly-mapped 403.

Pass: the publish succeeds even though `labelFieldId` names a process with
no live instance. Right below the "Published vN (hash)" line, the header bar
lists one line per unresolved reference. Each reads "Stale reference in
<data source id>: <field id> (not carried by any live version)". Change the
config back to a resolvable reference and publish again. Pass: no finding
line renders.

Measured on 2026-08-29 against the production build served from `WEB_ROOT`
(`bun run --filter './packages/web' build`, then the engine's own port), not
`bun run dev`. The dev server's esbuild pre-bundle of
`workflow-engine/validate` reaches `src/log.ts`'s module-level
`process.env.LOG_LEVEL` read. That throws `ReferenceError: process is not
defined` in a browser. It crashes the whole Studio area behind its
`ErrorBoundary`, on the first draft-validation call.

Confirmed pre-existing and unrelated to this change. `registry.ts`'s diff for
this change adds types only. `git show main:src/engine/registry.ts` already
carries the same `process.env` reference `src/log.ts` does. Not fixed here.
It sits out of scope for a data source change, and it affects every draft,
not only one carrying `instance.query`.

`test/instance-query-source.test.ts`, `test/instance-query-cross-process.test.ts`
and `test/http-studio.test.ts` already assert the handler, the publish-time
checks and the route's response shape against the API. None can see the
generated-form/raw-JSON precedence `PluginEnvelopeEditor` renders. None can
see an accessible name a screen reader gets. None can confirm a picker's
options match a real published catalog. This walk caught the labelFieldId
picker's stale mark polluting its own accessible name. The fix moves the
mark outside the `<label>`, in `InstanceQueryForm.tsx`.

### The instance.transition action's config form (`instance-transition-action`)

Source: `instance-transition-action` tasks 4.1 and 7.5.

Open a draft. Select a step. Open its on-entry action list. Add one action.
In the type picker, choose `instance.transition`.

Pass: the generated form renders three text inputs. They are `processId`,
`instanceIdField` and `pathId`. The raw JSON textarea does not stand in for
the form.

Fill all three. Name a published target process. Name a field of this process
that holds an instance id. Name a manual path on the target's own step.

Save the draft. Publish it. Pass: the publish succeeds.

Now change `pathId` to an id no live version of the target carries. Publish
again. Pass: the header bar lists one finding line below the published-version
line. That line names the action's location in the body, since an action
carries no data source id to name instead.

`test/config-descriptor.test.ts` asserts the descriptor this form reads.
`packages/web/test/studio-processHeaderBar-findingFallback.test.tsx` asserts
the finding line's own text. Neither one sees which surface
`PluginEnvelopeEditor` picks for this type. That half stays a browser check.
