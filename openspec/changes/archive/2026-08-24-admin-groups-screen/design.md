## Context

`group-based-assignment` adds the groups store, the deletion guard, and the
`/admin/groups*` routes this change consumes. See proposal.md - Why for the
gap this change closes: those routes ship with no screen. This document
covers the two frontend surfaces the proposal names. One is the admin
`GroupsScreen`. The other is the one link inside Studio.

Three existing files set the conventions this change follows.
`packages/web/src/areas/admin/screens/UsersScreen.tsx` sets the inline-edit
shape. A per-row control swaps a cell for a text input. A save control and
a cancel control sit beside it. A background reload never disturbs an open
editor's pending text.

`packages/web/src/areas/admin/screens/MigrationsScreen.tsx` sets the
process-filter shape. It is a plain `<select>` populated from
`GET /processes`, no more.

`packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` is the
process-identity header bar's `⋮` menu. It is already the one home for
process-level settings. The "Process, saved with the draft" group inside
it holds the process key and the base-locale control.

## Goals / Non-Goals

**Goals:**
- Give an operator every group operation `group-based-assignment` exposes.
  That is list, filter by process, create, rename, and delete with the
  guard's refusal surfaced. It is also member add and delete, and scope
  editing.
- Give a developer one path from a process's own context in Studio to that
  process's groups. Studio itself stays out of group management.

**Non-Goals:**
- No engine, schema, or route work. `group-based-assignment` owns all of
  it.
- No native group-management surface inside Studio. The link is the whole
  of Studio's involvement. The proposal rejects a second CRUD surface on
  purpose.
- No live authorization check when an author adds a group to
  `allowedGroups` at draft-edit time. That stays deferred, tracked outside
  either change.

## Decisions

### The route shapes this screen assumes

`group-based-assignment` has not shipped yet. No route contract exists to
read. This design assumes routes that mirror `/admin/users*`'s existing
shape exactly, since the proposal states that mirroring as the intended
design. The assumed routes: `GET /admin/groups`, `POST /admin/groups`,
`PATCH /admin/groups/:groupId/name` (rename), `PATCH
/admin/groups/:groupId/members`, `PATCH /admin/groups/:groupId/scope`,
`DELETE /admin/groups/:groupId`.

The spec delta uses these literal paths in its scenarios. `admin-app`'s
existing requirements name `/admin/users/:id/roles` and similar the same
way. This screen's own routes use `:groupId` instead, confirmed against
`group-based-assignment`'s task 6.4 route registrations. See Open
Questions.

### The member editor takes emails, not a picker

The design brief names the roles editor's shape as the pattern to mirror:
a text input, not a multi-select. Members are account ids. An operator
does not carry ids in their head. So the input holds comma-separated
emails. The screen resolves each one against `GET /admin/users`, the same
directory `UsersScreen` already walks in full for its own manager control.

This adds one dependency: the screen loads the full account directory
alongside its own group list. That is one more request on a screen an
operator opens occasionally. This design treats that cost as small.

An email the directory does not hold gets refused before any request
fires, named inline. Reusing the directory this way needs no new route.

### A dangling member id round-trips through the editor unchanged

A member id need not resolve to any account, in either direction.
`group-based-assignment`'s own spec
(`specs/group-administration/spec.md`) names that state as first-class
and permanent.

<!-- antislop: allow passive-voice sentence-length -->
<!-- Why: these two lines quote the sibling change's requirement text and its scenario title verbatim; paraphrasing them would misquote the source. -->
It states: "An operator may list a member before that account exists,
or after that account stops existing." Its own scenario title reads "A
member id naming no account is accepted."

This screen's member editor must round-trip that state. It must not
merely tolerate it.

Seeding the editor's initial text needs a reverse resolver, id-to-email,
alongside the forward one above. Task 3.2 adds `memberDisplayText(members:
string[], users: UserSummary[]): string`. It maps each stored member id
to its matching account's email, comma-joined. It falls back to the raw
id itself when no account matches. That mirrors `blockingProcessLabels`'s
own fallback-to-raw-id pattern (task 3.2). It also mirrors
`usersLogic.ts::managerLabel`'s identical fallback for a manager pointer
the account list does not carry.

Saving needs the same tolerance. Otherwise a group holding one dangling
member becomes permanently uneditable through this screen. The plain
refusal rule above would reject the dangling id's own seeded token as an
unresolved email.

Each comma-separated token in the saved text resolves one of two ways.
It can match an email against the loaded directory. Or it can match an
id already in the group's own pre-edit member list. Either match passes
through unchanged into the resolved set. That second path carries a
dangling id forward, rather than dropping it on the next unrelated save.
The screen refuses a token client-side that matches neither, the same
way it refuses an unknown email today.

### The process-filter narrows, and seeds scope on create

The design brief specifies both effects of the filter. It narrows the
visible rows. It pre-fills a new group's scope. Both read off one piece of
local state, the selected `processId`. No request grows a new parameter.

`group-administration`'s own spec requires `GET /admin/groups` to paginate
the same way `GET /admin/users` does. `group-based-assignment`'s task 1.4
confirms keyset pagination. The screen SHALL walk `listGroups`'s cursor to
completion before it filters or renders. `UsersScreen.tsx`'s own `load()`
does the same: it loops on `page.cursor` until the cursor runs out, rather
than assuming one unpaged response. The filter then runs in the browser,
over that fully walked list.

Migrations' own screen already works the same way. It loads `processes` in
full up front and populates its top-level filter from it. That is the
same shape this screen's own process filter follows. Its dependent
`versions` picker is a separate mechanism this design does not need.

### The deletion guard's 409 needs its own `ClientError` variant

`parseErrorBody` (`packages/web/src/api/client.ts`) narrows every error
response before any screen sees it, into a shape drawn from the shared
`ClientError` union (`packages/web/src/api/types.ts`). Three other routes
already needed a distinct discriminant: `self-role-strip`,
`unknown-manager`, and `email-in-use`. Each of those three carries only
`{ type, message }` in `packages/web/src/api/types.ts`, the same shape
the generic passthrough branch already returns. Each still got its own
dedicated variant. The repair differs per type, and a screen needs to
tell one refusal from another. None of the three carried extra payload
data.

`group-referenced` is a different, harder kind of need. It must carry
the resolved blocking-process ids themselves: structured data the
generic shape has no field for. The screen must also compute its message
from that resolved data at request time. It must not pick one fixed
catalog string. The existing precedent covers only the "gets its own
type" half of that need.

This design adds one more variant: `{ type: "group-referenced"; message:
string; blockingProcessIds?: string[] }`. It also adds a matching
`parseErrorBody` branch, tasks 2.8 and 2.9.

`blockingProcessIds` stays optional in the type. `parseErrorBody` never
emits a `group-referenced` value with that field unset, though.

When the body carries structured ids, the branch populates
`blockingProcessIds` and returns `group-referenced`. The body may instead
carry only a count or a free-text message, with no `processIds` array.
When it does, the branch does not fire at all. `parseErrorBody` falls
through to the existing `PASSTHROUGH` handling unchanged. The caller sees
the generic `{ type: "conflict", message }` shape instead.

Task 3.10's delete handler, not `parseErrorBody`, turns the no-ids case
into the fixed fallback message. That handler catches both
`"group-referenced"` and the fallthrough `"conflict"` type. Its catch
block sits on this screen's own `deleteGroup` call alone, so a
`"conflict"` there cannot come from any other route's refusal. It
resolves labels when `blockingProcessIds` carries a value.

It falls back to a fixed, translated catalog string when
`blockingProcessIds` is absent, whichever of the two types carried it.
That fallback never reads `err.error.message`. The server does not
guarantee that string is safe to surface, the rule `describeError`'s own
doc comment already states.

`group-based-assignment` task 6.3 reuses the generic `"conflict"` wire
type for this 409, instead of minting a fresh discriminant. The body now
carries a `processIds` array. The existing generic `"conflict"`
consumers already drop it. `packages/web/src/api/client.ts`'s
`PASSTHROUGH` set is one of them. That reuse is a design smell in the
sibling change's own wire contract. Amending `group-based-assignment`'s
route shape to fix it sits outside this change's authority.

`parseErrorBody`'s `group-referenced` branch instead detects the
group-delete 409 by body shape. It checks `type === "conflict"` together
with a `processIds` array, before consulting `PASSTHROUGH`. That order
makes it work regardless of the token collision. Tasks 1.2, 2.8 and 2.9
carry that fix.

`group-based-assignment` task 6.3 specifies the route body as always
carrying a `processIds` array. So the no-structured-ids branch task 3.10
falls back to has no reachable trigger against the sibling change's
current plan. This screen still keeps that branch. It keeps the fixed
fallback message too, as defensive code against a future drift in that
body shape.

### Where the Studio link lives, and why

The brief asks for the process-level link to sit somewhere Studio already
edits process-level settings, not in the step inspector. Reading
`packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` finds exactly
one such spot. That is the `⋮` menu's "Process, saved with the draft"
group, which already holds the process key and the base-locale control.
That group is process-wide, not step-wide. `studio-canvas` already
documents it as the header bar's own settings disclosure. The link joins
it as a third row.

The group already mixes two visual patterns. `AddLocaleControl` uses its
own button, `.studio-header-bar-menu-add-locale` with `btn btn-secondary`.
The key and base-locale fields use a label-row pattern instead,
`.studio-header-bar-menu-row`. Which one the new row follows is a real
styling decision, not a foregone one. Task 4.3 runs the design skills
over that choice before task 4.4 implements it.

<!-- antislop: allow synonym-rotation -->
<!-- "Edit" below quotes a hypothetical button label the design rejects, not a synonym choice against "change" elsewhere in this file. -->
The link's own label carries no verb like "Edit" beyond what the brief
names, "Manage assignment groups for this process." It navigates. It
writes nothing.

The link renders unconditionally. It sits as a sibling of the
`{structureActive && (...)}` block within the group, never inside it.
That is where `AddLocaleControl` already sits, for the same reason. It
renders on both surfaces, and the component's own comment says why.
The studio-canvas spec delta requires the same of this link. The link
renders regardless of the open surface.

### Threading `go` down to the link

`ProcessHeaderBar` currently receives no navigation handle. Studio's own
`AreaRootProps.go` is a raw `(href, opts) => void`. Every area root
receives the same one from `shell/App.tsx`. It reaches
`packages/web/src/areas/studio/root.tsx` today, and stops there.
`EditScreen` and `EditorArea` beneath it never see it. Nothing before this
change needed cross-area navigation from that deep.

This change threads `go` down from `root.tsx`. It passes through
`EditScreen` and `EditorArea` to reach `ProcessHeaderBar`, as one more
prop. `token`, `navigate`, and `onUnauthorized` already take the same
shape through that chain.

`EditorArea` already has `processId` in scope. `ProcessHeaderBar` does not
yet receive it. Task 4.2 adds it as a new prop, the same way it adds `go`.
The link builds its href from the shell's own
`areaHref` helper (`shell/routing.ts`), not a hand-built path:
`` `${areaHref("admin", "/groups")}?processId=${encodeURIComponent(processId)}` ``.
It calls `go(href)`.

### A query parameter is new in this codebase

No existing `Route` type, in any area's `routing.ts`, carries a query
parameter. Every area's `matchRoute` today matches on `path` alone. This
change adds the first one.

`admin/routing.ts` documents `matchRoute` as pure and DOM-free.
`admin-routing.test.ts` calls it with a plain string. No DOM is in scope for
that call: `packages/web` has no jsdom/happy-dom test environment. Reading
`location.search` from inside `matchRoute` would break both rules.

Instead `matchRoute` parses the query string out of its own existing `path`
argument. A caller passes `/groups?processId=proc_123`, the same string
shape `location.pathname + location.search` already produces. `matchRoute`
splits that string itself. `Route = { name: "groups"; processId?: string }`
carries the parsed value.

`routePath` for `groups` appends `?processId=...` only when the route
carries one. `/groups` alone, the tab's own link, still round-trips clean.
This is a small, self-contained addition to `admin/routing.ts`. It changes
no other route's shape.

This does not solve refresh or back/forward navigation for the filter.
`shell/routing.ts`'s `useLocation` resets `pathname` from the DOM's
`location.pathname` alone on every `popstate`, carrying no query string. A
refresh or a back/forward navigation on `/groups?processId=...` therefore
loses the filter, regardless of what `matchRoute` parses on first load.
This design accepts that gap. The filter still works for the one path this
change's own scenario covers, the Studio link's initial navigation. Only a
later reload or history navigation drops it back to unfiltered.

## Risks / Trade-offs

- [The route-shape assumption above is wrong once `group-based-assignment`
  ships] → Confined to path strings and the thin API module. No screen
  logic, spec scenario structure, or task depends on the exact path, only
  on the six operations existing. A sync pass fixes it.
- [Loading the account directory doubles the full-table walk on screen
  open] → Both walks stay at operator scale. This screen adds no new
  scale risk, only a second request.
- [The query-parameter pattern is new] → Every other route's own shape
  must stay unchanged. This change adds the parameter only to the
  `groups` case; it touches no other `Route` variant. The plan's
  Verification group runs the full suite to catch a regression there.

## Migration Plan

This is an additive UI change. It has no persisted state and no stored
data of its own; it introduces no migration in the engine sense.
Deployment is the existing one. `packages/web` ships as part of the
normal release, gated behind `group-based-assignment` having already
shipped its routes. Rollback is a normal revert. The new screen calls
nothing another screen depends on, and the new link is inert without a
target route.

Sequencing across the two changes matters more than either change's own
release mechanics. This change's tasks must not start until
`group-based-assignment` finishes its own tasks. This change's own
verification, the full `bun test` run, then exercises against routes that
already exist.

## Open Questions

- The exact `/admin/groups*` path strings this design assumes
  (`PATCH /admin/groups/:groupId/members`, `.../scope`, and every sibling)
  match `group-based-assignment`'s task 6.4 route registrations. Those
  registrations use `:groupId`, not `:id`. This design's approach does not
  depend on the exact token name. Neither does the task breakdown. Only the
  six operations existing matters.
- `group-based-assignment` is still in progress. Its task 6.3 specifies
  the group-delete 409's body as `{ error: { type: "conflict", message:
  ..., processIds: [...] } }`. That reuses the generic `"conflict"` wire
  type. `handleAdminDeleteDataList`'s own `"conflict"` 409 carries no such
  `processIds` array. That token choice collides with
  `packages/web/src/api/client.ts`'s `PASSTHROUGH` set. `PASSTHROUGH`
  already maps `"conflict"` unconditionally to `{ type, message }` and
  drops any other field.
- `parseErrorBody`'s `group-referenced` branch (tasks 2.8, 2.9) works
  around the collision by checking body shape first. It checks `type ===
  "conflict"` plus a `processIds` array, before consulting `PASSTHROUGH`.
  That is a workaround, not a fresh discriminant, since the wire carries
  none. Task 1.2 still confirms the actual shipped body once
  `group-based-assignment` reaches implementation, in case it drifts from
  its own plan.
