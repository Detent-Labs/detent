## Context

See proposal.md for motivation.

Four facts in the tree shape this.

- `Instance.startedBy` exists. `InstanceListFilter.startedBy` already reaches
  it, and `listInstances` compares `body->>'startedBy'` in SQL today.
- `loadInstanceForActor` (`src/runtime/api.ts`) admits four actors: an admin,
  the claimant, an eligible candidate, the starter. Three reads share it.
  They are `getInstanceView`, `postComment` and `listComments`.
- `parseScope` in `src/http/routes.ts` accepts `"mine"` and `"all"`. An
  omitted scope means `"all"`. That branch then calls
  `requireRole(actor, ADMIN_ROLE)`.
- The app area's routing is a 20-line pure matcher over three paths. A fourth
  screen needs nothing `AreaRootProps` does not already hand the root.

## Goals / Non-Goals

**Goals:**

- A participant finds a case they started, without holding its id.
- The listing carries every status, since a finished case is the common
  answer.
- The route needs no role.

**Non-Goals:**

- No change to who may read, comment on, cancel or write. Stage 35 called the
  access half done, and it is.
- No new engine read. The filter and its SQL predicate ship today.
- No inbox change. `scope=mine` keeps the assignment predicate it has.
- No admin-area change. `scope=all` already lists these instances.

## Decisions

### A third scope value, not a filter of its own

`scope=started` joins `mine` and `all`.

The alternative is to let a participant pass `startedBy=<own id>` with no
scope. That fails on the role check: an omitted scope means `all`, which
demands `system:admin`.

Relaxing that check for a self-referential `startedBy` would put an
authorization rule inside a filter parameter. The next reader would not look
for it there.

A third scope keeps the rule where the other two already sit: `parseScope`
and the `requireRole` beside it. It also reuses the guard `scope=mine` set.
The wrapper derives the id from the credential, and refuses the explicit
parameter beside it.

### The starter's access stays exactly as it is

The ledger asks whether the starter's access is read-only. It is not today,
and this change does not make it so.

The comment and the attachment routes share `loadInstanceForActor`, so a
starter already writes both. `cancelInstance` admits the starter too. The app
area's "Discard case" control rests on that.

This change adds a way to find an instance. It changes no rule about what a
finder may then do. Saying so is the point. A reader who meets
`scope=started` should infer no new permission tier from it.

### The list carries every status

The task inbox carries running work, because an assignment is what puts a row
there. A started case is different. "What became of the expense report I
raised" is the question. A completed or cancelled answer is the common one.

So `scope=started` applies no status predicate. The existing `status`
parameter still narrows it, and the screen sends none.

### No degraded item under the new scope

`scope=all` sets `includeDegraded`, because it already demands `system:admin`.
`scope=mine` does not. `scope=started` follows `mine`.

A degraded item under this scope would leak nothing: every row is the
caller's own instance. The reason is cost, not privacy.

The screen would need a second rendering path for a row with no
`processLabel` and no `stepLabel`. The case needs a published version to have
gone missing. Nothing deletes a version while an instance references it.

If that changes, widen the scope and the screen together.

### The screen is a register, not a second inbox

`TasksScreen` carries a filter, a sort, a grouping control and a load-more
caveat. The started list gets none of those on its first pass. It is a list of
rows in `createdAt` order with a status stamp. That is the register row idiom
`.claude/rules/design-language.md` already names.

The screen reuses `GET /instances`'s own cursor for load-more, the way the
inbox does. It adds no client-side sorting, so it needs no caveat line about
what the sort covers.

### Each row opens the task screen that exists

A started case is an instance. `/app/tasks/:instanceId` already renders one,
including for an actor who is not its claimant. No new detail screen.

The row's identifying content is the control, and the row carries no click
handler. That is the register row rule.

## Risks / Trade-offs

- **A participant opens a case they started but cannot act on.** → The task
  screen already handles that. It shows the claim state and refuses a
  submission with typed text. The screen predates this change.
- **A long-running participant accumulates many started cases.** → The route
  is keyset-paginated already, and the screen carries the cursor's load-more.
  No new bound.
- **`scope=started` is a third branch in `parseScope`, and a fourth caller
  might want a fourth.** → Accepted. Three named scopes with one rule each
  read better than one scope plus a matrix of parameter combinations.
- **The `end-user-app` spec names its route count in a requirement header.** →
  This change renames that header from four routes to five. That is why the
  delta carries a RENAMED block beside its MODIFIED one.

## Migration Plan

No data migration. No stored state changes shape. Every instance already
carries `startedBy`. A case started before this change therefore lists the
same as one started after it.

An older caller sends no `scope=started`, so nothing about it changes. Both
`scope=mine` and `scope=all` keep their exact meaning. No existing request
narrows or widens.

Rollback is a revert. A bookmarked `/app/started` then falls to the inbox,
which is what the app matcher does with any unrecognized path.

## Open Questions

- Does an operator want the same list keyed to another actor? `scope=all` with
  `startedBy=<id>` answers that today, for an admin. The answer changes no
  spec, no approach and no task here; it would be its own admin-area screen.
