## Context

`packages/web` grew four areas plus a shell on top of one shared HTTP
client. Each area copied patterns forward rather than reaching up into
`shell/` or `api/`, per proposal.md's eight findings. All eight stay
inside `packages/web`. The engine and the HTTP wrapper keep their current
code.

`vite.config.ts` currently sets no `build.target`. esbuild uses its
default instead: `baseline-widely-available`. That is roughly Chrome 107,
Safari 16, or Firefox 104, as of the Vite version this repo pins. The
Popover API needs Chrome 114+, Safari 17+, or Firefox 125+. Finding 63
needs an explicit, higher `build.target`. Without it, the build silently
emits Popover markup for a floor that doesn't guarantee support for it.

## Goals / Non-Goals

**Goals:**
- Delete all eight findings with no change in visible behavior, except the
  one behavior change finding 63 forces (see Decisions below).
- Land one shared `ErrorBanner` and one shared `usePagedList`. Every
  future screen reaches for these instead of copying the pattern again.
- State, in the spec, the account menu's dismissal mechanism and the
  session's stored shape. Both change under this proposal. Neither was
  spec'd in full before.

**Non-Goals:**
- No new screens, routes, or role gates.
- No change to the HTTP wrapper, the engine, or any API response shape.
  The server still returns `expiresAt` in `POST /auth/login`. Only the
  client's `Session` type stops storing it.
- No redesign of the error, pagination, or busy-state visual treatment.
  `ErrorBanner` and `usePagedList` extract the existing shape. They do not
  restyle it.
- No `shell/ErrorBanner` adoption in the studio area.
  `areas/studio/app.css`'s `.studio-error-banner*` rules are byte-identical
  to the app/admin rules `ErrorBanner` replaces. Five studio screens
  (`EditScreen.tsx`, `MigrationPlanScreen.tsx`, `ProcessesScreen.tsx`,
  `ToolsScreen.tsx`, `VersionsScreen.tsx`) carry the same duplicated
  markup: an eighteenth through twenty-second instance of the pattern this
  change otherwise clears.
- It stays out because the studio catalog's `t(key)` takes only a key. The
  other three areas' `t(locale, key)` takes a locale too, and
  `ErrorBanner`'s `locale` prop assumes that shape. Folding studio in is a
  follow-up change.

## Decisions

**ErrorBanner lives in `shell/`, not `api/`.** Both `app/` and `admin/`
import it. This repo's rule states it plainly. An area never imports
from another area. An area imports only upward, into the shell, the API
layer, or i18n. That rule places the shared component above both areas.

The component renders JSX too, a UI concern. The API layer never carries
a UI concern, so it cannot hold the component either.

Its props match the one shape every call site already builds. One
exception surfaced when design re-read all 13 sites: `onRetry` and
`retryDisabled` are both optional, not required.

- `error: string`
- `locale: <area's own UiLocale>`
- `onRetry?: () => void`
- `retryDisabled?: boolean`

`ErrorBanner` renders the retry button only when a call site passes
`onRetry`. Twelve of the 13 call sites pass it. `MigrationsScreen`'s
current banner has no retry button. A migration run is a one-shot action,
not a re-fetchable list, so there is nothing a retry would re-issue.
Forcing an `onRetry` prop there would wire a button to an action the
screen has no version of today. `MigrationsScreen`'s converted call site
omits `onRetry` and keeps the no-retry banner it has now.

<!-- antislop: allow synonym-rotation -->

Eleven of the other 12 call sites currently disable their retry button
while a reload is already in flight. Each uses `disabled={loading}` or
the screen's own equivalent loading flag. Losing that on conversion would
let an admin-area operator fire overlapping retries. That is a real
behavior change, one a "pure refactor" must not introduce. Those 11 pass
`retryDisabled` alongside `onRetry`.

The twelfth is `InstanceScreen.tsx`'s first call site, the compound
`view`/`versions`/`timers`/`processes`/record `Promise.all` load. It has
no such guard today. Its converted call site passes `onRetry` alone,
matching what it does now.

Each area keeps its own `errorText` (or `describeCaughtError`) call, or an
area-specific override where an error variant needs one. Each area passes
the already-resolved message string in. `ErrorBanner` never imports an
area's `ClientError` union or its `errorText` function.

It renders the string it receives. It also renders the stamp and
retry-button labels the shell i18n catalog (`i18n/catalogs/shell.ts`)
supplies for the passed `locale`. That catalog already carries
`error.retry`. It gains `error.failed` for the stamp (task 1.1a): the same
"Failed"/"Fehlgeschlagen" text every area catalog carries under its own
key.

**`usePagedList` takes a `fetchPage(cursor?)` function, not a URL.**

The six call sites differ in endpoint, query params, and response shape.
They converge only on `{items, cursor}`. Each screen keeps its own fetch
function and hands the hook a thin adapter. The hook owns only the
loading/error/append-vs-replace state machine. It does not own the
network call.

`InstanceScreen.tsx` is the one call site that doesn't hand the hook its
initial load. That screen's `load` awaits `view` first, then fetches
`versions`, the record page, `timers`, and `processes` in one
`Promise.all`, behind one shared `loading`/`error` pair. Only the
record's continuation, `loadMoreRecord`,
is a pure paged fetch. `InstanceScreen` keeps its own
`load`/`loading`/`error` for the compound fetch. It hands `usePagedList`
only the record continuation. That is the same "thin adapter, side
effects allowed" shape `OutboxScreen`'s `counts` already uses elsewhere in
this change.

The hook's owned state still needs seeding from that first fetch. Its
returned API gains one more function beyond `load`/`loadMore`:
`reset(items: T[], cursor?: string)`. `reset` writes the hook's internal
`items` and `cursor` directly, with no fetch of its own.

`InstanceScreen`'s `load()` calls `reset(recordItems, recordCursor)` once
its `Promise.all` resolves, using the record page the compound fetch
already retrieved. The screen then renders the record list from the
hook's own `items`/`cursor`, not from separate local state. That way
`loadMoreRecord`'s later call to the hook's `loadMore()` continues from
the seeded cursor instead of refetching page one.

`reset` is additive to the hook's API. The other five call sites don't
use it. Each seeds through the hook's own `load` instead.

**`profileFields.ts` keeps the `editable` split. It drops the `control`
union.** Two branches exist: a local account and a federated actor. Each
branch's shape is now fixed at the call site. The federated branch is
100% read-only. The local branch has exactly one text field and one
locale-select field, never a third combination.

Encoding that split in a discriminated union bought flexibility no caller
uses. The page renders the two branches as two small JSX blocks instead.
`profileFields.ts` keeps two helpers, `ABSENT` and `rolesText`. The page
still needs both. One formats a missing value. The other joins a role
list. Inlining them would recreate a smaller version of the same
duplication.

**`parseErrorBody`'s passthrough arms become a `Set<ClientError["type"]>`
lookup, not a shared function.** Nineteen `case` labels return
`{type: err.type, message}` verbatim. The type itself IS the payload. A
`Set` of those nineteen strings, checked once, replaces all nineteen arms
with one branch. That value, `err?.type`, has type `string | undefined`,
since nothing validates the parsed response body's shape. `PASSTHROUGH`
holds only the narrower `ClientError["type"]` string-literal union. The
membership check below narrows `err?.type` to that union before the
function returns it:
```ts
const type = err?.type;
if (type !== undefined && PASSTHROUGH.has(type as ClientError["type"])) {
  return { type, message } as ClientError;
}
```
The five `publish-validation` variants collapse the same way, narrowing
`err?.type` before the `PUBLISH_VALIDATION` membership check. They feed a
second, smaller set into one `{type: "publish-validation", kind, issues}`
return. `validation` and `concurrency-conflict` keep their own arms. Each
returns a distinct shape the `Set` approach can't express.

**Delete the unused tokens; don't comment them out.**

An unused custom property with no reference anywhere in
`packages/web/src` is dead weight, not a documented option. A future
author may want a second accent ramp one day. They should write it
against the current design language then. A frozen 2026 guess at what
shade it should start from serves them worse.

**Chrome.tsx: the Popover API, with an explicit `build.target`.** The
alternative keeps the hand-rolled listener. That leaves 13 lines of
duplicated platform behavior in the one place a native primitive now does
the same job. It also keeps a rough edge the current code half-handles.
No `mousedown` event fires on a touch device the way the effect expects.
Outside-tap dismissal there already works, but by accident, not by
design. `vite.config.ts` gets:
```ts
build: { target: ["chrome114", "safari17", "firefox125"] }
```
This names the floor Popover needs. Without it, esbuild would down-level a
future syntax feature for an older browser this UI no longer targets. With
it, esbuild compiles for the floor the UI already requires. `aria-expanded`
on the trigger button stays
hand-set, from a `document.activeElement`/`:popover-open` check. The
Popover API wires no ARIA state of its own, and that gap stays documented
inline.

The menu `<div>` currently mounts only while `open` is true:
`{open && (<div className="shell-menu" ...>)}`. A `popovertarget` trigger
needs its target in the DOM at all times to resolve it. The menu mounts
unconditionally once `popover="auto"` replaces `open`. The UA stylesheet's
own `[popover]:not(:popover-open) { display: none }` hides it while
closed. That is the same visibility the `open &&` guard gave it before.

**The menu needs JS-computed positioning once it carries `popover`.**
`.shell-menu` currently uses `position: absolute`, anchored to
`.shell-account`'s `position: relative`. It sits at `right: 0` and `top:
calc(100% + var(--space-1))`. A `popover="auto"` element renders in the top
layer instead. The UA stylesheet's own `position: fixed; inset: 0; margin:
auto` applies there, and it centers the menu in the viewport. The old
`absolute` rule no longer reaches the menu, because the top layer sits
outside `.shell-account`'s containing block.

CSS anchor positioning (`anchor-name`/`position-anchor`) would restore the
relationship declaratively. Safari 17, the stated floor, ships no support
for it. Safari added anchor positioning only in a later release. The fix
stays JS.

A `beforetoggle` listener on the menu checks `event.newState === "open"`.
It reads the trigger button's `getBoundingClientRect()` on that check. It
then sets `position: fixed` plus `top` and `right` as inline styles on the
menu, before the menu paints. The `top` value lands at the button's
bottom edge, plus the existing gap. The `right` value lands at the
viewport width minus the button's right edge. The menu keeps its current
right-aligned, below-the-button placement.

`shell.css` drops `.shell-menu`'s `position: absolute`, `right: 0`, and
`top: calc(100% + var(--space-1))`. The popover top-layer promotion
overrides them regardless. In their place, `.shell-menu`'s own rule sets
`left: auto`, `bottom: auto`, and `margin: 0`, kept permanently rather
than set inline.

Those three matter because the popover UA stylesheet gives every
`[popover]` element `inset: 0` and `margin: auto`. JS sets only `top` and
`right` inline, leaving `bottom` at `0` and `margin` at `auto` on a
fit-content-height box. CSS auto-margin resolution can then re-center the
menu instead of pinning it below-right of the trigger. That happens even
after the JS computes the correct numbers. The CSS reset removes that
path before the JS ever runs. The listener recomputes only on open.

A page scroll or a viewport resize while the menu is open can leave it
detached from the button. The new `position: fixed` styling does not move
with the document flow the way the old `absolute` anchoring did. The
header itself does not scroll. The window rarely resizes mid-menu. The
real-browser task (11.6) checks the common open/act/dismiss path, not a
resize-while-open case.

**Session.expiresAt: delete, and change the spec to match.** The field
was speculative from the start. Its own comment names no consumer, only a
hypothetical one. `unified-shell`'s "One session carries the token,
actor, roles and expiry" requirement currently mandates storing it. This
proposal edits that requirement rather than letting the implementation
drift out of spec silently.

## Requirement check

`end-user-app` and `admin-app` each carry requirements naming error display,
pagination, or busy-state behavior for one of the 13 converted screens. This
check states, requirement by requirement, that the refactor keeps the stated
outcome.

**end-user-app:**

- "A returned cursor shows a load-more control with a stated scope
  caveat" governs My tasks (`TasksScreen`). That hook owns only the
  state machine, not rendering (see the decision above). The screen
  keeps its own load-more control and caveat text. Only the state
  behind it moves into the hook.
- "Typed engine errors map to a legible, distinct UI treatment" (Task
  screen / `TaskScreen.tsx`). `TaskScreen.tsx` is not one of the 13
  `ErrorBanner` call sites. Its per-`ClientError`-type handling (claim
  prompts, the lost-claim message, the OCC-conflict reload) stays exactly
  as written. This change does not touch that file.

**admin-app:**

- "All instances are listable with filters and paging"
  (`InstancesScreen`). The next-page control and its request shape stay
  unchanged. `usePagedList`'s `loadMore` replaces only the screen's own
  `load`/`loadMore` state, the same substitution as `TasksScreen` above.
- "A Users screen lists accounts and toggles disable/enable"
  (`UsersScreen`). The `busy()` helper (section 3) runs the same
  set-busy/await/clear-busy sequence each of the five actions ran inline
  before. The acted-on row's controls disable for the same span and
  re-enable the same way.
- "A Migrations screen runs a registered plan" (`MigrationsScreen`). The
  409-with-no-registered-plan case still renders as `ErrorBanner`'s
  inline banner, carrying the same message. Only the markup changes, not
  the message itself. `ErrorBanner`'s `onRetry` is optional for exactly
  this reason (see the Decisions section above). `MigrationsScreen`'s
  call site omits it and keeps the no-retry banner it has today.
- "The data list screen edits the column declaration" (`DataListScreen`,
  scenario "A rejected declaration reports in place"). The screen's
  error still renders where the declaration sits, through `ErrorBanner`
  in place of the screen's own inline markup.

`OutboxScreen`, `TimersScreen`, `DataListsScreen`, `UiStringsScreen`, and
`InstanceScreen`'s two call sites follow the same refresh convention as
the screens above. Neither spec states a pagination or busy-state
scenario specific to them, beyond an error rendering somewhere on the
screen. The `ErrorBanner`/`usePagedList` swap preserves that rendering
the same way it does for the screens named above.

## Risks / Trade-offs

- **[Risk]** The higher `build.target` could break an older browser this
  product used to support. That risk reaches past the account-menu
  dropdown alone. A `build.target` change affects the whole bundle's
  emitted syntax, not one call site.

  Mitigation: this design document and the proposal both name the new
  floor. The proposal flags the change **BREAKING**. The real-browser
  task confirms more than the dropdown. It confirms login, the task
  list, and the canvas. Each still runs on the oldest browser the new
  floor claims to support.

- **[Risk]** Popover light-dismiss fires on pointer-down. The old code
  instead checked containment on mouse-down. A drag that starts inside
  the menu and lets go outside it may now close the menu. The old
  listener let that same drag pass.

  Mitigation: the real-browser task runs this exact case. It opens the
  menu, presses down inside, drags outside, then releases. A pass
  confirms the new behavior is fine. A fail catches the regression
  before merge, not after.

- **[Risk]** The top-layer promotion strips `.shell-menu`'s CSS anchoring
  to `.shell-account`, so the menu needs its position set in JS instead.
  A `beforetoggle` handler that reads a stale `getBoundingClientRect()`
  shows a wrong position. A handler that never runs shows the UA's
  default: centered in the viewport, not below the trigger button. The
  same centered default also survives a handler that computes the right
  numbers. That happens if `.shell-menu`'s own CSS still leaves
  `left`/`bottom` at the UA's `0` and `margin` at `auto`. Auto-margin
  resolution then re-centers the box around the JS-set `top`/`right`
  instead of pinning it to them.

  Mitigation: task 7.3 computes the position in the same `beforetoggle`
  handler that opens the popover. It reads the trigger's rect at that
  moment, not a cached one. Task 7.4 pairs that with `left: auto`,
  `bottom: auto`, and `margin: 0` on `.shell-menu`, per the Decisions
  section above. That leaves the JS-computed `top`/`right` values as the
  only ones auto-margin resolution has left to apply. The real-browser
  task (11.6.1) confirms the menu opens in its expected place, below and
  right-aligned to the
  trigger.

- **[Risk]** The nested language `<select>` sits inside the
  `popover="auto"` menu. Native `<select>` dropdown lists are a known
  source of light-dismiss edge cases in some browser engines. Opening
  the native option list could itself register as an outside
  interaction and close the popover underneath it.

  Mitigation: task 7.6 confirms the `<select>`'s `onChange` still runs
  and leaves the menu open. Task 11.6.4 repeats that check in a real
  browser. A regression here fails one of those two checks before merge.

- **[Risk]** A future screen may hand `usePagedList` a cursor shaped
  unlike the six audited here: an object, not a string.

  Mitigation: the hook's fetch-page signature already captures what
  varies, cursor presence and append versus replace. A seventh caller
  needs only its own adapter, not a hook change.
- **[Trade-off]** Collapsing `parseErrorBody`'s switch to two `Set`
  lookups makes each error type's mapping less greppable. Searching for
  `"not-claimed"` in the file now finds the `Set` literal, not a `case`
  block naming its return shape beside it. Accepted: the 19 identical
  returns carried no per-type information a `case` label added over the
  `Set` membership check.

## Migration Plan

1. Land `ErrorBanner` and `usePagedList` first. Verify each against one
   converted screen before touching the rest. A shape mismatch then
   surfaces on one screen instead of thirteen.
2. Convert the remaining call sites for both, area by area.
3. Land the `UsersScreen` `busy()` helper, the `profileFields.ts` /
   `ProfilePage.tsx` simplification, and the `parseErrorBody` collapse.
   These three are independent of each other and of steps 1-2.
4. Delete the unused `tokens.css` custom properties.
5. Bump `vite.config.ts`'s `build.target`, then land the Popover swap in
   `Chrome.tsx` in the same commit. The target bump must land first. A
   later Popover swap risks down-leveled markup on an unsupported floor.
6. Delete `Session.expiresAt` and land the `unified-shell` spec delta.
7. Run the full verification gate: typecheck, build, `bun test` with
   `DATABASE_URL`, antislop on touched Markdown, `git diff --check`. Then
   run the real-browser task. Then request review.

No server-side or database migration applies. This change touches only
`packages/web`'s build output. Rollback is a plain revert of the commits
above, in reverse order. No step depends on a schema or data change that
would need un-migrating.

## Open Questions

None. This design resolved every choice above instead of deferring it, per
this repo's OpenSpec convention.
