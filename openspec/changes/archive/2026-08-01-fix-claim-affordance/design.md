## Context

See `proposal.md` for motivation.

`InstanceView` (`src/runtime/api.ts:89`) carries `instanceId`, `processId`,
`version`, `status`, `step`, `fields`, `availablePaths` and `redactedAt`. It
carries no assignment. `getInstanceView` builds exactly those fields
(`api.ts:687`). Three screens consume it: the app area's `TaskScreen`, the
admin area's `InstanceScreen`, and the studio area's `PlayerScreen`.

`TaskScreen.tsx` holds claim presentation in one boolean, `claimedByMe`.
`applyView` resets it to `false` on every loaded view (`TaskScreen.tsx:60`).
A comment there states the intent: a fresh view opens read-only, and claiming
stays explicit. The same boolean also gates the path-submit buttons
(`TaskScreen.tsx:282`).

`TaskScreenProps` carries `instanceId`, `token`, `locale`, `navigate` and
`onUnauthorized`. It carries no actor id. `TasksScreen` already receives one
from the area root, so the value exists one level up.

## Goals / Non-Goals

**Goals:**

- One derivation of the claim controls from the loaded view and the actor id.
- A disabled Claim that assistive technology reaches and announces with its
  reason.
- A task on an assignment-less step that a participant can finish.
- Copy in the register the app area already uses.

**Non-Goals:**

- Any engine change. `claimStep` and `submitAndTransition` stay as they are.
- The same fix in the studio area's `PlayerScreen`. See the open point below.
- Claim-derived field editability. `form-ui` keeps sole control of
  `readonly` and `required`, as the existing requirement states.

## Decisions

### Put the assignment on the view, rather than a computed claim state

`getInstanceView` returns `assignment` in the shape `InstanceSummary` already
uses. Clients derive presentation from it.

Alternative considered: a server-computed enum, such as `claim: "none" |
"claimable" | "blocked" | "mine"`. Rejected on three counts.

The enum would carry the shape of one screen. `getInstanceView` has three
consumers with three needs. An operator inspecting an instance wants
different granularity from a participant claiming a task.

The enum ages worse. `AssignmentState` is the resolved state, so a future
assignment strategy would not change its shape. An enum would need new
members, and a consumer switching on it would break.

Its apparent privacy benefit is not real. `InstanceSummary.assignment`
already ships `claimedBy` to the same audience. The app area's inbox already
reads it (`inboxLogic.ts:71`).

Alternative considered: a second request for the instance summary. Rejected,
because it does not work. `scope=mine` matches a claimed row or an unclaimed
row naming the actor among `assignment.candidates` (`src/runtime/api.ts:891`).
An assignment-less instance matches neither, so a participant cannot fetch
the summary of their own task.

### The field reports the instance, including when it is not running

`availablePaths` empties for a non-running instance. `assignment` does not.
An operator reading a completed instance can still see who held the final
claim. Each screen decides what to display, from `status`.

### `aria-disabled` and a click guard, not the `disabled` attribute

A button with the `disabled` attribute leaves the tab order, and assistive
technology skips it. The reason would then reach only sighted pointer users.
The screen instead sets `aria-disabled="true"`, omits the click handler, and
links the button to its reason with `aria-describedby`. The control stays
focusable, and a screen reader announces the state together with the reason.

Alternative considered: `disabled` plus a `title` tooltip. Rejected on three
counts. A disabled button suppresses the pointer events a tooltip needs.
Touch devices have no hover. Assistive technology skips the control.

### The web package repeats the candidate test, on purpose

The engine's `isEligibleCandidate` (`src/engine/transition.ts:76`) tests the
actor id and each role against the candidate list. The engine package's
`exports` map does not expose `src/engine/transition.ts`, so the web package
cannot import it. The screen reimplements the same two-line test.

Alternative considered: widening the `exports` map to publish the predicate.
Rejected for this change. It would enlarge what the engine package publishes,
for a presentation hint. `package.json` is not in scope here.

The repetition is safe because the test governs presentation only. Drift
would produce a wrong hint, never a wrong authorization. `claimStep` decides,
and it reads the same list from the instance.

### The reason never names the claimant

`AssignmentState.claimedBy` holds an actor id such as
`user_3413dc62-6c1c-4507-b941-232c188bede0`. Neither view carries a display
name for it. Printing the id would put an opaque string in front of a reader.
It would also hand one participant another participant's account id. The
reason therefore reports that another actor holds the task, and stops there.
`error.alreadyClaimed` already words it that way.

Alternative considered: resolving the id to a display name. Rejected. It
needs a second request or a new server field, and it serves no reader.

### `actorId` becomes a prop

`TaskScreenProps` gains `actorId: string` and `actorRoles: string[]`, passed
from the app area root the same way `TasksScreen` already receives the id.
The test needs the roles too, because a candidate list holds either an actor
id or a role name.

Alternative considered: reading the actor from a context or from the session
module inside the screen. Rejected. The area already passes the value down
explicitly, and one screen departing from that pattern costs more than the
prop.

## Open point: the studio Player has the same defect

`PlayerScreen.tsx` imports `claimStep` and `releaseClaim` and loads its state
through `getInstanceView`. It therefore guesses the claim state exactly as
`TaskScreen` does today, and it will keep guessing after this change.

The view field this change adds is what the Player needs. The remaining work
there is a screen-level fix in the studio area. It belongs to
`studio-player`, not to `end-user-app`, so it stays out of this change and
needs its own. This paragraph is the record that it is outstanding.

## Known boundary: an assignment-less instance reaches no inbox

`scope=mine` sets `assignedTo` and `assignedToRoles` only, never `startedBy`
(`src/http/routes.ts:317`). The inbox predicate matches two kinds of row
(`src/runtime/api.ts:891`). One is a row the actor claimed. The other is an
unclaimed row naming the actor or one of their roles among
`assignment.candidates`. An absent `assignment` satisfies neither, so the row
never appears in My-tasks. Not even for the actor who started it.

A participant therefore reaches such a task through the redirect that follows
starting the process, or through a remembered URL. Nothing else leads there.
This change makes the task finishable once reached. It does not make it
findable. The fix for that belongs to the inbox predicate, so it stays out of
this change.

## Risks / Trade-offs

- A new field on `InstanceView` reaches every consumer of
  `GET /instances/:instanceId` → The field is additive. No consumer breaks.
  `redactedAt` set the precedent for growing this type.
- The screen's candidate test drifts from `isEligibleCandidate` → The test
  governs presentation only. The engine still refuses a claim the actor may
  not make. A test covers the candidate and non-candidate states.
- A stale view names a claimant who released the task → The actor sees a
  disabled Claim until the next load. The engine accepts the claim once the
  screen reloads. The screen already handles every other server state this
  way.
- Removing the `claimedByMe` reset changes behaviour the comment at
  `TaskScreen.tsx:60` called deliberate → The existing requirement already
  separates field editability from claim state. Nothing opens for editing
  that did not open before. The claim controls and the submit buttons change.
- Submit buttons appear without a claim on an assignment-less step → The
  engine already takes that submission. It accepts the starter or an admin,
  and refuses everyone else. The screen stops hiding a permitted action.
- A terminal step declares an `assignment`. No invariant forbids it → The
  instance completes while it still carries a claim. `resolveClaimControls`
  returns `none` for any status other than `running`. The screen therefore
  offers no control that `InstanceNotRunningError` would refuse.
