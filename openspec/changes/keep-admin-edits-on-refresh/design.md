# Design

## Context

`useRefresh` bumps a `reloadToken` on an explicit `refresh()` and on every
window `focus`. Each admin screen runs its `load()` in an effect keyed on that
token. Two editors fill their inputs inside `load()`. `DataListScreen.tsx`
sets `label`, `description`, `columns` and `rows`. `UiStringsScreen.tsx` calls
`setDrafts({})`. `usePagedList` keeps whichever answer arrives last. See
`proposal.md` for the defects.

The test setup renders static markup only. `packages/web` has no DOM harness
and no hook harness. Behavior that no test can render moves into small pure
modules that `bun:test` can call.

### Design brief (impeccable shape)

No human was available for the discovery interview. The owner ruling of
2026-10-11 and the mockup at
`https://claude.ai/artifact/AujGammkngHmtAH8ZDYGBQ` answer it.

- **Job and audience.** An operator edits `/admin/data-lists/<key>` or
  `/admin/ui-strings` and returns from another window. Mode: Operate. The
  operator must find the input intact. The operator must also learn when a
  colleague changed the same data.
- **Direction.** The established world applies. The callout is the Warning
  Callout of `DESIGN.md`. Refusal text sits beside a 3px rule in the advisory
  role, with 8px of padding before the text. It sits in place above the
  editable content. It never becomes a toast or a modal. Nothing animates.
- **Interaction.** The callout holds one action, the secondary button
  "Discard my edits and load the server copy". Save stays the screen's one
  primary action. The button asks no second confirmation, because its label
  names the loss. The callout lives in a live region that stays mounted. A
  screen reader announces the callout without interrupting.
- **States.** Four cases matter. With no unsaved input, the form follows the
  server and no callout shows. With unsaved input and an unchanged server
  copy, no callout shows. With unsaved input and a changed server copy, the
  callout shows. When a refetch fails, the error banner shows where the data
  would sit, and the input stays.
- **Anti-goals.** No diff view, no merge, no per-field marker, no toast and
  no polling. German text runs up to 40% longer. The button wraps under the
  sentence and takes no fixed width.

## Goals / Non-Goals

**Goals:**

- A refetch leaves the typed input as it is.
- The operator learns of a changed server copy only when one exists.
- A list shows only the answer to its newest request.
- The pure decisions (reseed or keep, changed or same, refetch due or
  skipped) have `bun:test` coverage.

**Non-Goals:**

- The Studio's draft guard (audit change #5) and the participant form drafts
  stay as they are.
- No `AbortController`. `request` in `api/client.ts` stays as it is.
- No debounce on the filter inputs (ruling of 2026-10-11).
- `InstanceScreen`, `TimersScreen` and `DataListsScreen` stay as they are.
- Adapters outside the Instances and Outbox screens keep their unguarded
  `fail(err)`. Only those two screens filter by user input.

## Decisions

### D1. Two server copies and a dirty flag, with no overwrite

Each editor holds `baseline` (the server copy that filled the inputs) and
`latest` (the newest server copy). A load always stores `latest`. It refills
the inputs and sets `baseline = latest` in two cases only. The operator holds
no unsaved input, or the caller asks for a reseed. The callout shows when the
operator holds unsaved input and `latest` differs from `baseline`.

The pure function `absorbServerCopy(prev, next, keepEdits)` lives in
`areas/admin/screens/serverCopy.ts`. It returns the new pair and a `reseed`
flag. `serverCopyChanged(copies, same)` answers the callout question.

`load()` reads the dirty flag from a ref when the answer arrives, never when
the request starts. A keystroke that lands while the request runs then still
wins. The ref also keeps the identity of `load` stable. A state read inside
`load` would give it a new identity on every keystroke. The effect keyed on
`load` would then refetch on every keystroke.

On the UI-strings screen the rows read `latest`. A key without a draft
follows the server. A key with a draft keeps its draft. `baseline` serves
only the callout test. A reseed on that screen clears `drafts`.

The data-list editor sets the flag on every input change. It clears the flag
on a successful save and on discard. The UI-strings editor derives the flag
from `pendingWrites(rows, drafts).length > 0`, the count that already
disables Save.

Alternatives:

- Skip the refetch while the operator holds unsaved input. The ruling rejects this. The
  save sends the whole value set, so the save would deactivate a colleague's
  new value unseen.
- Refetch into a `useReducer`. A reducer adds one action type per input. The
  pair and the flag need only the two pure functions.

### D2. A save reseeds through its own load

`save()` calls `refresh()` today. Between `setSaved(true)` and the answer, a
"reseed when clean" rule would refill the inputs from the pre-save copy.
Instead `save()` clears the flag and awaits `load(true)`. The `true` forces
the reseed, so the inputs switch once, to the saved copy. On the UI-strings
screen the same step also clears `drafts`.

A locale change also forces the reseed on the data-list editor. Each value's
label reads in the chosen locale. Kept rows would save text typed under the
old locale as the label of the new one.

### D3. What counts as a changed server copy

The data-list editor compares `label`, `description`, `columns` and `values`
(value, label, attributes, active). It ignores `usedBy`, because a publish
elsewhere causes no conflict. The UI-strings editor compares the stored
overrides of the displayed area and locale only. Both compare a stable
projection, so the key order from the server cannot raise a false callout.

### D4. One callout component for both screens

`areas/admin/ServerCopyNote.tsx` takes `message`, `discardLabel` and
`onDiscard`. Two consumers justify it. It stays inside the admin area, so no
area reads another area's styles. It renders a `<div role="status">` that
stays mounted. The callout inside it appears once `message` has text.

Catalog keys: `dataList.serverChanged`, `dataList.discardAndReload`,
`uiStrings.serverChanged` and `uiStrings.discardAndReload`, in EN and DE.
The data-list sentence is the ruling's sentence. The UI-strings sentence
keeps the first two sentences. It ends "Saving overwrites the stored wording
of the keys you edited". A UI-strings save writes only the edited keys, so
the ruling's third sentence would be false there.

### D5. A newest-answer gate, passed to the screens

`shell/latestGate.ts` exports `createLatestGate()`. `next()` starts a
generation and returns its `isCurrent()`. `current()` returns the
`isCurrent()` of the running generation and starts none.

`usePagedList.load` calls `next()`. `loadMore` calls `current()`. A later
replace therefore drops an earlier append. An append never drops a replace.
`reset` calls `next()` and sets `loading` to false, because it ends any
request in flight and starts none. Only the newest request writes `items`,
`cursor` and `error`. Only it clears `loading`. Every "Load more" button disables itself while `loading`,
so two appends never overlap.

`fetchPage` takes `isCurrent` as a second argument that the hook always
passes. A caller may declare fewer parameters. The Outbox
screen guards `setCounts` with it. The Instances and Outbox screens call
`fail(err)` only while it holds. The hook cannot guard those effects itself,
because they run inside the screen's adapter.

The gate lives in `useState(createLatestGate)[0]`, so `load`, `loadMore` and
`reset` keep their identities. `InstanceScreen` lists `reset` in the
dependencies of its own `load`. An unstable `reset` would refetch in a loop.

The data-list and UI-strings `load()` use a gate of their own for the same
reason. A focus load that started before a save must never overwrite the
copy the save produced.

Alternatives:

- `AbortController`. `request` takes no signal today. An abort would still
  leave the effects above unguarded.
- TanStack Query. `docs/decisions.md`, entry 51, defers it.

### D6. The throttle lives in `useRefresh`, behind an option

`useRefresh({ minFocusIntervalMs })` keeps the time of the screen's last
request in a ref. Opening the screen, `refresh()` and a focus refetch each
stamp it. The focus listener calls the pure `focusRefetchDue(last, now,
minMs)` from `areas/admin/refreshLogic.ts`. `refresh()` never consults it.

`UsersScreen` and `GroupsScreen` pass `DIRECTORY_FOCUS_INTERVAL_MS`, 30000.
No other screen passes the option. Its default of 0 leaves every other screen
as it is. The Users and Groups scenarios named "A reload leaves an open
editor alone" stay valid. They describe the editor when a refetch happens, and
a skipped refetch leaves the editor alone too.

### D7. Migrations: split the reset from the fetch

One effect resets the picks and fetches today. A reload token in that effect
would clear `fromVersion` and `toVersion` on every focus. The reset moves to
an effect keyed on `processId`. The process fetch and the version fetch both
key on `reloadToken`, and both carry a `cancelled` flag, as in
`CycleTimeScreen.tsx`. The reset effect also clears the version list. A slow
answer for process A then never fills the selects of process B. The screen
gains the Refresh button.

### D8. Where the checks live

The reseed, changed and due decisions get `bun:test` files. The UI-strings
half of F-1 gets an `e2e/` flow. Only a real page observes a focus event. The
flow does not need a visual judgment. `AUDIT.md:173` in the audit record
(`openspec/changes/archive/2026-10-10-audit-record/`) records F-1. The suite
holds "at least" four flows, so a fifth flow does not need a spec delta.

A second test in that file covers F-18. A focus event within 30 seconds of
the load sends no directory request, and the Refresh button sends one. The
newest-answer wiring (F-7) needs data and a delayed answer. The browser walk
covers it, and the gate has its own `bun:test` file.

The data-list walk stays in `docs/browser-checks.md`. It needs a seeded list.
It also asks for a judgment of the callout's look in both locales.

## Risks / Trade-offs

- An operator types, then types the original text back. The flag stays set,
  so a changed server copy still raises the callout. Mitigation: the discard
  button resolves it in one click.
- A refocus within 30 seconds of the last load shows the old directory on
  Users and Groups. Mitigation: the Refresh button always refetches, and
  every write on those screens refreshes.
- `fetchPage` gains a second argument that the other `usePagedList` callers
  ignore. Mitigation: a caller may declare fewer parameters. The app-area
  callers keep their adapters and still gain the hook's newest-answer rule.
- The decision logic lives outside the components. A wiring mistake in a
  screen is invisible to `bun:test`. Mitigation: the e2e flow and the browser
  check walk the wiring on the production build.

## Migration Plan

This change touches no stored state, route or definition. It ships with the
web build. Rollback is a revert of the change's commits.

## Open Questions

None. The rulings of 2026-10-11 settle the three questions of the brief.
Keep the input and warn on a changed copy. Use a 30 second minimum interval
on the two directory screens. Add no debounce.
