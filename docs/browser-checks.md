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

### The panels screen (`studio-panels-screen`)

Source: stage 36. It replaced the shared modal's own four points. The routed
screen makes all four moot: no backdrop, no focus trap, no Close.

Open a draft in Studio. Choose Fields in the canvas rail's Process section.
Pass: the panels screen opens, the canvas is gone, and the address bar reads
`/studio/processes/<id>/edit/panels/fields`.

Read the third column. Pass: it lists every open check, grouped, in full. It
is not the one-line summary the inspector docks.

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
- **Checks rail, docked in the inspector** (`studio-edit-header-cleanup`):
  a step or a path selected. Check the collapsed one-line summary at the
  inspector's bottom edge. It carries three states: a count, "no count"
  when clear, the held-back indicator. Expand it in place. The grouped
  list beneath must match the standalone rail's own states above. It
  draws no border or padding of its own, so it never doubles the
  inspector's box.
- **Selection-driven inspector**: a selected step's sections, including
  its "Developer view" disclosure (expanded and collapsed). A selected
  path's sections too, including its own "Developer view" disclosure (raw
  CEL, expanded and collapsed). The no-selection state is the checks rail
  beside the canvas, covered above: the inspector itself never renders
  with nothing selected (`studio-edit-header-cleanup`).
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

Pass: the three columns end at the window's bottom edge, less the screen's own
`padding-bottom`. The canvas stands taller than 36rem. No page scrollbar
appears.

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
summary still docks there, with the same count the inspector shows.

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
