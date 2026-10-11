# Design

## Context

A draft lives in the React state of `DraftProvider`. The screen,
`ProcessSurface`, holds the save state: revision, layout and conflict. It also
holds `savedBody`, the body of the last save. It reports `isDirty(draft,
savedBody)` up into `dirtyRef` in `root.tsx`. Only `guardedNavigate` reads that
ref.

Three paths skip the ref. The `go` that `root.tsx` hands to `EditScreen` serves
the groups link of the `⋮` menu. The account menu calls three handlers of
`Chrome`. `onUnauthorized` is the shell's logout. Layout writes go to the save
state and never touch `savedBody`, so the dirty state ignores them.

Two constraints shape the 401 path. The `studio-app` spec requires that a 401
clear the session and return to the login screen. The `unified-shell` spec
forbids tracking token expiry on the client. A fix cannot hold the actor on the screen. It cannot warn
before expiry. It can only keep the work.

## Goals / Non-Goals

**Goals:**

- No ordinary exit from an open draft loses unsaved work without a prompt or a
  restore offer.
- One definition of unsaved: the body or the layout differs from the last save.
  The header bar, the leave prompts and the Publish dialog read it.

**Non-Goals:**

- Re-login in place. A new token prop re-runs the draft load. That load drops
  the changes the fix protects. It needs a token ref and a login path inside the
  studio, so it is its own change.
- A Back or Forward step between entries of the page. Such a step raises
  `popstate`, and the area has no veto.
- The login's return to the pre-logout address. That belongs to
  `harden-shell-session-and-routing`.
- Any engine, API or definition contract change.

## Decisions

**One leave check, three callers.** `root.tsx` defines `confirmLeave()`. It
returns true when `dirtyRef` is clear. Otherwise it returns the answer to the
native prompt with the existing sentence. `guardedNavigate` keeps its
`dest.name !== "edit"` condition and calls it. A new `guardedGo` wraps `go`. It
goes to `EditScreen`, to `onGoToArea` and to `onGoToProfile`. A new
`guardedLogout` wraps `onLogout`. `onUnauthorized` stays unwrapped, because a
dead session asks nothing.

`Chrome` hides its menu before it calls a handler, so a declined prompt leaves
the menu closed. The alternative was a guard inside `Chrome`. The shell cannot
know that an area holds unsaved work, and the exits differ per area. We rejected
it.

**`beforeunload` reads the same ref.** `StudioArea` adds one listener on mount.
The listener calls `preventDefault()` while `dirtyRef.current` is true. The
browser words the prompt.

The event also fires when the address bar leaves for another document. It never
fires for a step between entries of the page. The base spec excluded all
browser-level navigation. This change narrows the exclusion to that one step.

**Dirty is body or layout, defined once.** `ProcessSurface` keeps `savedLayout`
beside `savedBody`. `draftToolbarState.ts` gains `isLayoutDirty` and
`isDraftDirty`. The layout compare uses `canonicalize`, which `changeSet.ts`
already imports. A stored layout comes back in the key order of the database.
`JSON.stringify` would call two equal layouts different.

`useDraftToolbarActions` takes the same two layout props. Then `runPublish`
saves first for a layout-only difference, as the Publish dialog already says.
That save bumps the stored revision. The write is real, because the layout
differs. The rationale of the conflict requirement still holds.

The alternative was to leave Publish on the body alone. We rejected it. The
dialog says "Publishing saves them first" whenever the header bar reads dirty.
Two definitions would let the two disagree.

No canvas code writes the layout on its own at load. Every writer runs from a
gesture: a step move, a group change, a waypoint, the edge style or Arrange. A
draft therefore reads clean on open.

**A save applies its answer through an updater.** `onSaveState` takes the
`setState` signature of React. `applySaveResult(current, result, sentLayout)`
returns the answer's layout only when `current.layout === sentLayout`. That
holds exactly when no layout change ran during the request, because every layout
change builds a new object. Otherwise the function keeps the current layout.

A 409 returns the current state with the conflict flag set. The base spec
already requires that a conflict leave the local state intact. The old code
broke that for the layout. After a success, `savedLayout` takes the layout of
the answer. A layout change during the request then leaves the draft unsaved,
which is true. A reload sets `savedLayout` to the reloaded layout, so a
reloaded draft reads clean.

**The stash lives in `sessionStorage`, keyed by actor and process.**
`draft/draftStash.ts` exports `stashDraft`, `readRestorable` and `clearStash`.
Each takes a storage argument, so a test passes a fake. A stash holds the body,
the layout and the revision. A stash has no timestamp. `readRestorable` compares
the stash with the loaded record under `canonicalize`. It clears an equal stash
and returns nothing. It also returns nothing for a malformed value.

`ProcessSurface` wraps `onUnauthorized`. When the draft is dirty, the wrapper
writes the stash and then calls the callback of the shell. Two consumers on that
screen get the wrapped callback: the toolbar actions and the Access panel. A 401
from a request of either keeps the work. Other requests on the screen never
reach `onUnauthorized` and stay as before. Both read the callback through
`useFail`, which holds it in a ref. A new wrapper identity on every pass
re-runs no effect.

A write that the browser refuses (quota, blocked storage) gets no handling beyond a catch. The
logout proceeds as it does today.

`sessionStorage` beats `localStorage` here. The stash dies with the tab and
never reaches another tab. The actor id in the key keeps a second actor on the
same tab from seeing it. An explicit logout writes no stash, because the actor
confirmed the loss.

The alternative was a copy dialog before the logout. It keeps the studio
mounted after a 401, which `studio-app` forbids. It also requires a manual
paste. We rejected it.

**Restore keeps the stored revision.** On mount, `ProcessSurface` calls
`readRestorable` for its actor and process. A result starts `RestoreNotice`
with two buttons.

"Restore unsaved changes" replaces the draft with the stash body. It sets the
save state to the stash revision and layout. It leaves `savedBody` and
`savedLayout` at the loaded values, so the draft reads dirty. When the draft is
already dirty, restore asks with the native prompt first. Restore replaces newer
changes. `onArrange` already does the same for a local overwrite. A
restored draft saved against a moved server revision answers 409. The existing
conflict banner then appears. Nothing gets overwritten silently.

Both buttons stay disabled while a save or publish runs, so the save's answer cannot overwrite the stored revision.

<!-- antislop: allow synonym-rotation -->
<!-- Discard them and Discard draft are two studio controls with different effects. -->
Four events clear the stash: a restore, "Discard them", a successful save and
the Discard draft action. The last one matters. A discarded draft restarts its revision
count at 0. A stale stash with a high revision could otherwise restore over a
newer draft that reached the same revision number.

<!-- antislop: allow synonym-rotation -->
<!-- Discard them and Discard draft are two studio controls with different effects. -->
`RestoreNotice` follows the warning callout of `DESIGN.md`: refusal text beside
a 3px advisory rule, with 8px before the text. It has `role="status"` and renders
three catalog strings: the message and the two buttons. `ProcessSurface` holds
the fourth, the replace prompt. The studio
`t(key)` takes no values, so the message names no time. The button reads "Discard them", the wording of the owner ruling of 2026-10-11.

The notice sits between the header bar and the tab row, as a sibling of the
error banner. The message and both buttons share a line on wide screens and
stack below 40rem. "Restore unsaved changes" is a secondary button. "Discard them" is the destructive
outline. Publish keeps the one filled action. After
either button the notice unmounts, and focus moves to the open tab.

**The shell stays as it is.** `Chrome` already calls three handlers that its
area passes. The `unified-shell` spec gets one requirement that lets an area
hold those handlers behind its own confirmation. It also gets a patched account
menu requirement. The three exit scenarios then allow the confirmation.

## Risks / Trade-offs

- **A closed tab loses the stash.** → The browser prompt on tab close covers the
  author who closes by habit. That is why `beforeunload` ships with the stash.
- **Draft bodies in `sessionStorage` on a shared machine.** → The stash lives
  until the tab closes. Its key holds the actor id. A second actor on the same
  tab never gets the offer. The body is a process definition with no
  credential in it. The session token already sits in `localStorage`.
- **A large draft exceeds the quota.** → The write fails and the logout
  proceeds as today. The 401 path is no worse than before.
- **`confirm()` blocks browser automation.** → Browser checks accept the dialog
  on purpose. The `beforeunload` prompt works the same way.
- **A layout write with no visible effect reads as unsaved.** → Switching the
  edge style and back leaves an extra key. Deleting the only waypoint does the
  same. `canonicalize` compares keys. The header bar
  reads "Unsaved changes" until the next save. The cost is one extra prompt.
  A normalizer would need a new default entry for each new layout key.
- **Two controls start with Discard.** → "Discard them" clears the stored copy. The other control
  acts on the draft on the server. The message of the notice names its object,
  and the ruling fixed the wording. The browser check looks at both together.
- **A stash outlives a draft that someone else deleted.** → Only a deletion from
  another session reaches it. The tab keeps the stash until it closes. A restore
  still answers 409 when the revision differs.
- **A later in-place re-login retires the stash.** → The stash is private to one
  tab and one version. Removing it later strands no stored data.

## Migration Plan

No API, schema or server data changes. The stash key is new. No earlier value
exists. `readRestorable` ignores a value it cannot parse, which covers a shape
that a later version writes. Rollback is a revert. A stash that an old tab holds
then goes unread and dies with the tab.

## Open Questions

None.
