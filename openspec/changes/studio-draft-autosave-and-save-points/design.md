<!-- antislop: allow-file synonym-rotation sentence-length run-ons negation-habit passive-voice -->
<!-- Why: Discard, Remove, Cancel and Reload name controls here, and the linter merges sentences around code spans and table rows. -->

# Design

## Context

See `proposal.md` for the motivation. Five facts shape the approach.

- `useDraftToolbarActions` (`panels/DraftToolbar.tsx`) owns saving, publishing
  and discarding. `EditScreen.tsx` calls it once. `ProcessHeaderBar.tsx` renders
  the controls.
- `isDraftDirty` compares the body and the layout with the last save.
  `applySaveResult` keeps a layout change made during a request. `doSave` records
  the body it sent, so a body change made during a request stays dirty.
- `root.tsx` guards every exit through `askLeave`. It reads a dirty ref that
  `EditScreen` reports upward.
- The stash (`draft/draftStash.ts`) keeps a dirty draft through a 401. A
  successful save deletes it today.
- The test-instance route and the publish route both read the stored draft. So the
  Player and Publish each need one thing: the save landed first.

## Goals / Non-Goals

**Goals:**

- An author never presses Save and never loses work silently.
- Opening a draft and reading it writes nothing.
- A save point is one named act, and an author can reverse a restore.

**Non-Goals:**

- Undo, or a per-keystroke history.
- Merging two authors' work. A 409 stays a conflict.
- A preview or a diff of a save point before a restore.
- Retiring the Arrange, removal, kind-change or template dialogs. Each guards
  saved work, and autosave makes none of them reversible.

## Shape brief (`/impeccable shape`)

The owner pre-approved this change and answers no interview, so each assumption
stands marked. The visual world is the established register, so no world workshop
ran.

- **Job and audience:** a process author in the middle of building a process, in
  Operate mode. Saving should stop being their job.
- **Outcome and proof:** the header bar stops asking for attention. Success reads
  "Saved just now" beside the version, with no control beside it.
- **Selected direction:** the state line is the whole autosave interface, and it
  stays quiet. A real failure is the only loud moment. It takes the existing
  banner and one control.
- **Save points:** a Settings view, one subject on its own page. A sentence label,
  one input and one button stand over a register of named points. It has no side
  panel and no chips.
- **Assumption:** an author makes a save point seldom. A home on Settings plus one
  `⋮` entry therefore outranks a permanent header control.
- **States and ranges:**
  - Zero points: a sentence.
  - One to fifty points: rows.
  - A name of up to 120 characters: it wraps.
  - Fifty points: a sentence takes the form's place.
  - A failed fetch: a banner where the rows would stand.
- **Interaction and layout:** no motion, per `DESIGN.md`. From the first change on,
  the state's words take the width of "Saved just now" in the body face. "Saving…" and
  it then trade places without moving what follows them. A draft at rest takes no
  minimum, so "Saved" leaves no hole.
- **Anti-goals:** a toast, a spinner, a Save button "just in case", a machine value
  on the Save points view.

Web Interface Guidelines applied:

- An ellipsis on a loading label ("Saving…").
- A polite live region for a status that matters.
- An inline refusal at the field.
- `autocomplete="off"` on the name.
- A confirmation before a destructive act.

Composition: the Save points view is a plain panel over named actions from the
hook, with no mode props. `StudioDialog`'s explicit parts stay. `PrimaryConfirm`
gains one explicit `waiting` prop. That state is the confirm's own, and the busy
context means something else (D5).

## Decisions

### D1. The timer lives in `useDraftToolbarActions`, as one effect

One effect runs after each commit that moves the draft, the layout or the save
state. It answers one question: may a save run, and after how long?

```ts
const wait = autosaveWait({ dirty, saving, conflict, held, flushAsked, failure, changedSinceFailure, dirtyFor });
if (wait === undefined) return;
const timer = setTimeout(doSave, wait);
return () => clearTimeout(timer);
```

The effect's closure holds the current draft and revision, so `doSave` reads no ref
for them. A re-render during typing clears the timer, and that is the debounce.
`setSaving(true)` runs before the request, and `saving` blocks a second one.

`autosaveWait` is pure and lives in `screens/draftAutosaveLogic.ts`, so `bun:test`
can pin it. Its inputs mean:

- `dirtyFor` counts from the first change after the last request left. `dirtySince`
  clears when `doSave` sends and when the draft is clean. The effect sets it on the
  first commit whose draft or layout is not identical to the last sent pair. A pure
  `nextDirtySince` holds that step. Measured any other way, a pause or the saving
  commit itself would drop the debounce.
- `held` is true in four cases: the restore notice stands, the discard dialog is
  open, the leave dialog stands (`holdSaves` from `root.tsx`), or a save point
  request runs.

| Constant | Value | Reason |
|---|---|---|
| `AUTOSAVE_DEBOUNCE_MS` | 1200 | a typing pause, short enough for the next press |
| `AUTOSAVE_MAX_WAIT_MS` | 10000 | a long typing run still lands |
| `AUTOSAVE_RETRY_MS` | 5000, 15000, 30000, then 60000 | backoff after an answer that may heal |
| `SAVE_TIMEOUT_MS` | 30000 | a hung request reads as a network failure. `api/client.ts` exports this one, since the API layer imports nothing from `screens/` |

`autosaveWait` answers in this order:

1. Not dirty, saving or a conflict: `undefined`.
2. A failure with no later change: `undefined` when held or refused, else the backoff.
3. `flushAsked`: 0.
4. Held: `undefined`.
5. Otherwise, the debounce capped by the maximum.

A failure outranks `flushAsked`. A flush clears the failure first, so any failure it
sees answers its own try.

Two alternatives lost. A debounce library adds a dependency for four lines. A
`useRef` timer in each writer misses the layout writers.

The discard dialog's `busy` reads `discarding || saving`. `held` stops new saves
while it stands, so its confirm cannot reach a running save. A `PUT` at revision 0
landing after a delete would otherwise create the draft again.

An unmount that bypasses `askLeave` (the browser's Back or Forward) would drop a
waiting change with the timer. So one unmount effect acts from refs, unless a `dropped`
ref is set. A layout effect writes those refs, so they hold the last commit and never a
render that crashed. `root.tsx` keys `EditScreen` by the process id, so a history jump
between two drafts unmounts the old one with its own commit:

- Dirty with nothing standing: one last `saveDraft`, its rejection caught.
- A request running: it chains on a `running` promise ref. It sends only if the latest
  draft differs from what that request sent, at the answer's revision.
- A failure or a conflict standing, or that last save failing: it writes the stash
  when none stands, through a `keepCopy` callback.
- The notice standing: the store's one slot holds the copy, and D7's accepted loss
  applies.

A discard, a 401 (through `stashOnUnauthorized`) and a confirmed leave dialog set
`dropped`. `onFlushChange` therefore reports `{ flush, drop }`, and the dialog's
`onConfirm` calls `drop()` before it runs the exit.

### D2. What a failure does

`doSave` sorts a failure into three outcomes, inside its own `catch` and ahead of its
`finally`. No commit then reads "dirty, not saving, no failure".

- **401:** `fail` ends the session and the stash keeps the work, as today.
- **409:** `applySaveResult` raises `conflict`. `autosaveWait` answers `undefined`
  until Reload clears it.
- **Anything else:** the hook holds `failure = { sentDraft, sentLayout, retryable,
  tries }`. A network failure (`status === undefined`) or a 5xx is retryable, and
  the backoff runs. Any other 4xx waits.

A later change takes the ordinary debounce again. The hook sees it by comparing
identity with `sentDraft` and `sentLayout`.

`retry` keeps `failure` and sends at once. `saving` paints the control, and the
answer replaces or clears `failure`. So Try again stays mounted during its run. Try
again leaves when `failure` leaves, on a dirty draft too.

A clean draft clears the failure, by the render-time adjustment `justPublishedAfter`
uses. An author may take a change back by hand, and `reload` clears it too.

The banner prints one catalog sentence. The caught text stands in the closed
Developer view `RefusalDetail` already gives. A retryable failure's sentence says
Detent keeps trying.

A successful save clears only the failure's own banner. A plain `clearError()` there
would wipe an Arrange banner the author is still reading.

A network failure can hide a save that committed, and so can a gateway's 502, 503 or
504. The next send then carries a passed revision and answers 409, with this tab as the
only other writer. So a ref `unconfirmed` lists each pair a send sent and lost that way.
A success or a real conflict empties it, and a flush leaves it alone.

A 409 while `unconfirmed` holds an entry reads the stored draft first. Where its body and
layout equal an entry under `canonicalize`, that entry landed at the stored revision.
`savedBody` takes the entry's draft and not the record's body, since `isDirty` compares
with `JSON.stringify` and `jsonb` reorders keys. A change made since then stays dirty and
saves next. A 409 that matches no entry clears `failure` and raises the conflict. At most
one send at a revision can commit, so a match is unambiguous.

`saveDraft` passes `signal: AbortSignal.timeout(SAVE_TIMEOUT_MS)`. `request` maps a
thrown fetch to the `network` error, so a hung request takes the retry path.

### D3. `flush()` is the one way to hurry a save

```ts
flush(): Promise<{ saved: true; revision: number } | { saved: false }>
```

A flush pushes a waiter and bumps a state counter. The D1 effect then answers a wait
of 0 and ignores `held`. A second effect settles the waiters after a commit, reading
"not dirty" first:

- not dirty and not saving: `{ saved: true, revision }`;
- a failure or a conflict and not saving: `{ saved: false }`.

Settling after a commit means the revision it reads is the answer's own, with no ref.
A change made while a flush waits keeps the draft dirty. The effect then saves again
before the waiter settles.

A flush under a standing conflict settles false and sends nothing, since a repeat
would answer 409 again. A flush clears a standing failure first, so it makes one
fresh try, and that try settles it. `retry` differs here, by D2.

`flush` stays stable (`useCallback` over refs and setters), so `root.tsx` can hold it
in a ref.

### D4. Leaving

`root.tsx` keeps `askLeave`, so the wrappers and `studio-leave-guard.test.ts` keep
their shape. Its body moves:

```ts
if (!dirtyRef.current && !unappliedRef.current) return proceed();
leaveTrigger.current = activeControl();
setLeaveForJson(unappliedRef.current);
if (unappliedRef.current) return setLeaving(() => proceed); // no flush
pendingLeave.current = proceed;          // one slot: the last exit asked wins
void flushRef.current?.().then((r) => {
  const exit = pendingLeave.current;
  pendingLeave.current = undefined;
  if (exit === undefined) return;
  if (r.saved) exit(); else setLeaving(() => exit);
});
```

Both refs stay first, because `onDiscarded` lowers them before it navigates. A flush
there would write to a draft the author just deleted. `EditScreen` reports `dirtyNow ||
actions.saving` into it, so an exit during a request waits for the answer even after the
author took the text back by hand. The one slot stops two presses
from running two exits. `EditScreen` reports `{ flush, drop }` upward through a new
`onFlushChange` prop, and it takes a new `holdSaves` prop, true while `leaving`
stands. A healed retry cannot then land what the dialog says it will drop. A
`localPath` change clears `pendingLeave`, as it clears `leaving`.

`LeaveDraftDialog` stays, and its body now says the save failed. The `beforeunload`
prompt stays while the draft is dirty. A fetch `keepalive` body caps at 64 KiB and a
draft can reach 8 MiB, so a page close cannot promise the save.

Text on the JSON surface that no Apply has taken stands in no draft, so no save can
carry it, and a save that lands says nothing about it. `JsonView` compares its text with
its seed, which a successful Apply moves, and reports the answer upward. While that holds:

- `askLeave` asks through the dialog at once, and it sends no flush. Its body reads "The
  JSON you have not applied goes with it. The saved draft stays." Its heading and confirm
  stay. Its confirm calls no `drop()`, since the text alone goes. An applied change still
  saves on the unmount.
- `beforeunload` prompts.
- A tab press and the two menu entries that leave the surface (its own and Save points)
  ask the same dialog through `leaveJsonSurface`. Cancel keeps the surface and the text.
- The Publish dialog adds "The JSON you have not applied is not part of this publish."

An apply on a typing pause would fit autosave more closely. The owner ruled for this
report instead: half-typed JSON should not reach the draft. A browser Back and a 401
cannot ask, so the text goes. `AUTOSAVE-6` records that.

The other former `confirm()` sites all stay. None guards only unsaved work.

- Arrange overwrites positions.
- Restoring a copy replaces work.
- A list discard and a template discard or replace destroy stored data.
- The two field catalog prompts drop settings.

### D5. Publish

`publish()` opens the dialog and, when dirty, calls `flush()`. A false result closes
the publish dialog alone, through `setPendingDialog((open) => (open === "publish" ?
null : open))`, and the banner reports it. `runPublish` loses the chained `doSave`.
`publishDialogUnsaved` leaves the catalog.

While the draft is dirty the confirm carries `waiting`. It reads "Saving…" and
`aria-disabled="true"`, and a press does nothing. Cancel stays live, since declining
harms nothing. So the dialog's `busy` drops `actions.saving` and keeps meaning a
request the dialog started. A native `disabled` would drop the focus for a short wait.

Publish pressed under a standing conflict opens no dialog. The focus moves to the
banner's Reload control, the one thing that resolves it. Otherwise the author would
publish a stored draft that differs from the one on screen.

### D6. The state line

`headerStateLine` returns one of five states. Only `unsaved` prints in the refusal
tone, and the other four print muted.

| Condition | State | Words |
|---|---|---|
| failure, a conflict over a dirty draft, a dirty draft under the restore notice, or unapplied JSON | `unsaved` | Unsaved changes |
| dirty otherwise | `saving` | Saving… |
| saved in this session, under a minute ago | `savedJustNow` | Saved just now |
| saved in this session, a minute ago or more | `savedAt` | Saved at 12:02 PM |
| nothing saved in this session | `saved` | Saved |

A one-shot timeout re-renders the line one millisecond past the one-minute mark, since a
timer can fire early. A save point restore moves the time, as a save does. The refusal tone moves
off an ordinary change, so a keystroke no longer flashes red.

Announcing every "Saving…" would talk over a screen reader user's typing. So the
visible line is no live region. A visually hidden `role="status"` beside it announces
three moments, and otherwise stays empty:

- "Unsaved changes" on entering `unsaved`.
- "Saved" on leaving it.
- The published version sentence after a publish.

A save point act can raise a 409 on a clean draft. That draft keeps the banner and reads
the saved state, since nothing unsaved stands, and an exit leaves with no question.

The line keeps `tabIndex={-1}`. `saveFocusTarget` takes `{ heldControl, controlGone,
focusOnBody }`. `heldControl` reads a ref that Try again's `onFocus` sets and its `onBlur`
clears. A timed retry can heal under a resting keyboard user, and a press never ran there.
`controlGone` means `failure === undefined`, because a retry answered 409 or a retry with
a newer change removes the control on a dirty draft. The effect's dependencies add
`failure`. `focusOnBody` still guards focus the author moved.

### D7. The stash

A standing notice means the author has not chosen between the kept copy and the
stored draft. Four rules follow.

- While the stash stands, the timer does not arm. A change stays local, and the state
  line reads "Unsaved changes".
- `onSaved` stops deleting the stash. The copy goes when the author answers the notice
  or discards the draft.
- A flush may still save over the stored draft (an exit, Publish, naming or restoring a
  save point).
  Each such save, and each save point restore, rewrites the copy's revision to the
  answer's, in state and in storage. A 409 on a restored copy then means somebody else
  moved the draft. `askRestore` also asks first when this tab saved since the notice
  appeared, since the restore replaces that saved change.
- While a copy stands, a 401 keeps that copy. `stashOnUnauthorized` checks `stash ===
  undefined`, because the store has one slot. The change made under the notice goes, and
so does one a browser Back drops there.

The last rule is an accepted loss. A second slot would need a second notice for a rare
case, and the kept copy is the larger piece of work.

### D8. Save points on the engine

```sql
CREATE TABLE IF NOT EXISTS draft_save_points (
  save_point_id text PRIMARY KEY,
  process_id    text NOT NULL,
  name          text NOT NULL,
  body          jsonb NOT NULL,
  layout        jsonb NOT NULL,
  revision      integer NOT NULL,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draft_save_points_process_idx
  ON draft_save_points (process_id, created_at DESC);
```

The table has no foreign key. Thirteen test files `TRUNCATE drafts` with no `CASCADE`,
and a reference would fail each of them. `process_access_roles` has none either.
`deleteDraft` removes the rows in one transaction with the draft. An id reads `spt_`
plus `crypto.randomUUID()`.

`process-drafts` states that no engine path but `drafts.ts` reads `drafts.body`. So
`drafts.ts` gains two functions, and the new module touches the draft only through
them:

- `lockDraft(processId, tx)`: the `FOR UPDATE` read through the private `toDraft`.
- `writeRestoredDraft(processId, { body, layout, updatedBy }, tx)`: the write, with
  `revision + 1`.

`src/engine/draft-save-points.ts` exports:

- `listSavePoints(processId, db)`: newest first, no body.
- `createSavePoint(processId, { name, revision, createdBy }, db)`.
- `restoreSavePoint(processId, id, { revision, keepName, restoredBy }, db)`.
- `deleteSavePoint(processId, id, db)`: reports whether a row went.
- `MAX_SAVE_POINTS = 50` and `MAX_SAVE_POINT_NAME_LENGTH = 200`.

The engine trims each name and refuses an empty one. The input caps at 120.

Create and restore run in one transaction, with `lockDraft` first.

- No draft or no point returns `undefined`, and the handler calls `notFound()`.
  `NotFoundError` maps to 500.
- A stored revision that differs raises `DraftConflictError`.
- The count check runs under that lock, so two creates cannot both pass at 49.
- A restore at the bound raises `RequestShapeError` and changes nothing.

A restore inserts the kept point from the locked draft. It then writes the point's
body and layout through `writeRestoredDraft`, and answers the saved draft.
`base_version` stays.

The kept point's name comes from the client's catalog, because `src/` holds no UI
string. A hand-rolled API caller names it too.

Fifty points at 8 MiB bound a draft at 400 MiB. A real draft runs a few kilobytes.

A publish leaves the points alone. Restoring one onto the draft makes a new draft
state and mints no version.

### D9. Save point routes

| Route | Answer |
|---|---|
| `GET /drafts/:processId/save-points` | `{ items, limit }`, each item with `createdByDisplayName` |
| `POST /drafts/:processId/save-points` `{ name, revision }` | 201 and the summary |
| `POST /drafts/:processId/save-points/:savePointId/restore` `{ revision, keepName }` | 200 and the draft |
| `DELETE /drafts/:processId/save-points/:savePointId` | 204 |

The gate is the existing draft gate: `ADMIN_ROLE` alone, or an authoring role plus the
process's Developer list. `createdByDisplayName` resolves the way the draft list's
`updatedByDisplayName` does.

Answers follow the draft routes. A malformed request or the bound answers 400. No
draft or no point answers 404. A stale revision answers 409. A point under another
process id reads as 404.

`limit` lets the view state the bound with no shared constant across the HTTP
boundary, so no new error type appears.

### D10. The Save points view

It is the fourth Settings view, at the address `/edit/settings/points`.
`SavePointsPanel` fetches each time it turns visible and after each act. Every Settings
view stays mounted, an unopened view should cost nothing, and a return visit should not
show old rows and ages. A refetch keeps the old rows until its answer, so Restore keeps
its focus. While a request runs, each row's Restore and Remove stand `aria-disabled`.

The form renders from the first commit, and a waiting line stands only where the rows
will. When an answer reaches the bound while the input holds the focus, the focus moves to
the bound's sentence.

The `⋮` Draft group gains "Save points". A new `openSavePoints` in `EditScreen` calls
`setJsonOpen(false)`, `setJsonNote(undefined)` and the plain `navigate` to this view.
It then sets a pending focus on the name input. `openSettings` is no model here: it
keeps the JSON surface open, and from the form editor it lands on the first view.

Copy (catalog, English only):

- Label: "Name this save point". Button: "Save this point".
- Help: "A save point keeps the draft as it stands now, so you can come back to it."
- Empty: "No save points yet."
- Row: the name, then "Saved by Roman, 3 minutes ago" through the process list's
  `relativeAgo`, with Restore and Remove. With no display name it reads "Saved 3 minutes
  ago", as `processList.savedAnonymous` does.
- At the bound: "This draft holds {limit} save points. Remove one to name another or
  to restore one."
- An empty name: "Give this save point a name." at the input, with no request.
- After a create: "Saved “{name}”."
- After a restore: "Restored “{name}”. Your work before it stands as “{kept}”."

The last two print in a `role="status"` line.

The kept name comes from a pure `keptPointName(name)`, in the catalog's words: "Before
restoring “{name}”". It clips the embedded name to 120 characters with "…". A kept name
therefore never exceeds 139, however many rounds nest, and the engine's bound of 200
holds.

Naming and restoring call `flush()` first, so a copy holds what the author sees. Remove
sends its request at once, since it copies nothing and carries no revision. The hook owns
the acts (`createSavePoint`, `restoreSavePoint`, `removeSavePoint`), so the panel keeps no
command logic. All three write calls pass the `AbortSignal.timeout`, since `held` waits on
them. Each outcome has one home:

| Outcome | Where it lands |
|---|---|
| False flush | the Restore dialog closes, and the banner reports it |
| 409 | any open dialog closes, and the conflict banner stands |
| 404 on restore or remove | the dialog closes, and the list refetches |
| Lost answer on a restore | reads the stored draft under the same timeout. A revision past the flushed one lands as done, and otherwise the next row applies. The list refetches either way |
| Other refused restore or remove | inside the open dialog, through `StudioDialog`'s `refusal` |
| Refused create | at the input, with the name still typed. A lost answer also refetches the list |

`reload`'s body splits. A new `adoptDraft(record)` holds the replace and the saved-state
calls, and it leaves the draft clean and starts no save. `reload` adds its own
`onCanPublishChange`. The restore answer carries no `canPublish`, so reusing `reload`
whole would wipe a re-read permission. A restore adds `setJustPublished(false)` through
a new callback, since the draft changed. That callback also filters `selectedStepIds` to
the answer's steps and clears `selectedPathId`, or the canvas bar would count a step that
went.

Restore asks "Restore “{name}”?" and names who saved the point and when. Its note reads
"Your work as it stands now becomes a save point, so you can come back to it." Its
confirm reads "Restore". Its row stays, so its control takes the focus back. An
unavailable Restore uses `aria-disabled`, as Publish does, so a restore that reaches
the bound keeps that focus.

Remove asks "Remove “{name}”?" with "The studio has no undo." Its row leaves, on a 404
too, so the focus lands on the name input, through a pending focus consumed after the
rows commit.
At the bound the input returns in that same commit.

The fiftieth create takes the input away, so the bound's sentence takes `tabIndex={-1}`
and the focus.

The discard dialog adds one note: "Its save points go with it." The header bar's
discard and the process list's discard share that dialog.

### D11. The Player's buttons

Filled "Test this draft" calls `POST /drafts/:processId/instances`. Outlined "Start a
case from the published version" calls the published route. The filled button is what
Test came for, so the fill moves to it.

Test still needs that one press. A test instance is a real instance, and its actions
run. Creating one per press on Test would mint instances nobody asked for.

### D12. Spec encoding

A MODIFIED block must keep every base scenario by name. Three requirements of
`studio-app` and two of `studio-process-tabs` reverse a scenario, so each takes REMOVED
plus ADDED under a new name. The scenario "Publishing with unsaved changes prompts a
save first" keeps its name inside a 129-line requirement. Its rule still holds in the
part that matters: no publish leaves before the save.

## Risks / Trade-offs

- [A mount-time write would save on open, moving the revision and "Saved by"] → The
  browser check and e2e assert no `PUT` after opening a draft. Task 4.1 traces any such
  write and fixes its cause.
- [A write that re-dirties after each save would loop] → The debounce bounds it to one
  `PUT` per 1.2 seconds. e2e asserts the request count settles after a label, a drag, an
  Arrange and a JSON apply. The decisions entry "The header reads Unsaved changes after a
  `PUT` that answered 200" names this reading, so it closes only on that result.
- [Two tabs on one draft now conflict sooner] → The second tab sends nothing until it
  changes something. A conflict stays reported and never merges.
- [Each answer replaces the layout object] → `applySaveResult` keeps that rule, so the
  waypoint and group memos recompute once per save. The browser check drags a step across
  an answer.
- [A save point holds old keys] → A restored body can carry a field key a later publish
  fixed. The published-field lookup and the checks report it, as they do for any JSON
  edit.
- [Writing the e2e flows' shared draft] → Autosave now persists what `dialog.e2e.ts` only
  typed. A second seeded draft takes the flows that write, and `publish.e2e.ts` keeps its
  own.

## Migration Plan

Nothing deployed needs moving. `initSchema` creates the table on the next boot, and
existing drafts start with no save points. A rollback drops the table and reverts the
client. A draft's own row stays as it stands either way.

## Open Questions

None.
