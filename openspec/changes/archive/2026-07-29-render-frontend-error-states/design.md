## Context

The four SPAs were built in sequence (`editor`, then `app`, `admin`,
`studio`), and each copied the session-handling shape of the one before: a
client class that throws a typed error, a screen that catches it, checks for
401, calls `onUnauthorized()`, and rethrows anything else. The 401 half is
correct and consistently applied. The rethrow half was never finished — it
assumed something upstream would catch, and nothing does.

`packages/app`'s Task screen is the exception, because it had to be: a task
submission has five distinct failure modes a participant must be able to act
on (claim lost, moved on, not a candidate, validation, unauthorized), so its
author built `withErrorHandling` and `describeError`. That work is the
template; the rest of the repo simply never needed it badly enough to notice
that it was missing.

The `DraftToolbar` defect is the same class one level down: state that is
correct at mount and after a save, but not after the third path that changes
it.

## Goals / Non-Goals

**Goals:**

- A failed load renders as a failure, in every screen of every browser
  package.
- "No results" is only ever shown for a request that succeeded.
- A render-time throw does not leave a blank page with no explanation.
- Publishing a reloaded, unmodified draft does not prompt to save it.

**Non-Goals:**

- Retry-with-backoff, offline queues, or optimistic reconciliation. The rule
  here is *report honestly*; automatic recovery is a product decision per
  screen.
- A shared UI component library across the four packages. They are
  deliberately separate apps, and the duplication of a small error banner is
  cheaper than the coupling a shared package would introduce.
- Reworking the client classes' error shapes. `AdminClientError`,
  `AppClientError` and `StudioClientError` already carry a typed `error` plus
  an optional `status`; that is enough.
- Accessibility of the new error states beyond the basics named below. The
  broader accessibility pass is its own change (`CQ-1`/`CQ-2`), and this one
  must not silently absorb it.
- Changing `packages/editor`. It is scheduled for deletion; if it is still
  present when this lands, it gets the same treatment mechanically, but it is
  not where the value is.

## Decisions

**Per-screen error state first, `ErrorBoundary` as a backstop.** A boundary
alone would catch nothing here — the throws are inside async callbacks, which
React boundaries do not see. Even if they did, a boundary replaces the whole
screen, which is the wrong granularity for "the list failed to refresh while
the rest of the screen is fine". So the per-screen state is the fix and the
boundary is insurance against render-time throws, which is the class it
actually covers.

**Gate the empty state on `!error`, not only on `!loading`.** This is the part
that turns a silent bug into a visible one, and it is easy to under-apply: a
screen that renders an error banner *above* a list still says "No instances
match these filters." below it, which is a contradiction on one screen. Every
empty state moves behind the same three-part condition.

**Reuse each app's existing error vocabulary rather than inventing one.**
`packages/app` has `describeError` returning `{kind, message}` where `kind`
drives behavior (refresh-and-remove, prompt-claim, ...). Admin and Studio need
far less — they are not driving a claim state machine — so they get a
narrower mapping from `error.type` to a localized string, in the same file
position and with the same name, so the three read alike. Inventing a shared
abstraction across three apps with different needs is what would make this
change expensive.

**`EditScreen` gets an error sentinel, not a thrown boundary.** Its `record`
state is already a discriminated value with a `"loading"` sentinel; adding an
error variant is a two-line change that keeps the screen's own retry affordance
possible. Letting the boundary take the whole screen would lose the process id
and the navigation the user needs to get out.

**`setSavedBody` inside `reload()`, not a `useEffect` on `draft`.** An effect
watching `draft` would also fire for ordinary edits — which is exactly what
`savedBody` must *not* track. Reload is by definition the point where current
and saved coincide, which is the same invariant the mount seed and the
post-save advance already encode; setting it there keeps all three writes to
`savedBody` expressing one rule.

**`structuredClone` the reloaded body**, matching the two existing writes. The
draft object is mutated in place by the panels, so storing the same reference
would make `savedBody` follow every subsequent edit and `isDirty` always
return false — the opposite defect, and a worse one, since it would let a genuinely
dirty draft publish stale content without a prompt.

**One component test for `DraftToolbar`, not a component-test framework
rollout.** `publishGateLogic.ts` is already pure and unit-tested — and it is
*correct*; the bug is in the wiring around it, which is precisely what a unit
test of a pure function cannot see. So this change adds the first test that
renders the component through conflict → reload → publish. If that requires a
DOM environment the repo does not have yet, the fallback is to extract the
`savedBody` transition into a pure reducer alongside `publishGateLogic` and
test that — but the wiring is the defect, so the rendered test is the one
worth having.

## Risks / Trade-offs

- **25 mechanical edits invite a copy-paste slip**, and a wrong one silently
  restores the current behavior → Mitigated by the empty-state gate: a screen
  whose error state is not wired will show its empty state during an induced
  failure, which is what the verification step exercises.
- **Error text may leak server internals to a participant** → After
  `correct-api-error-responses`, a 500 body carries no message at all, so the
  displayed text comes from each app's own catalog keyed on `error.type`. That
  change is not a prerequisite, but the mapping must be written to prefer the
  catalog over `error.message` regardless of it.
- **More screen states to keep translated** → Each app already has a
  translation catalog; the additions are a handful of keys per app.
- **`packages/editor` may be deleted between proposal and implementation** →
  Handled: if it is gone, its share of the work disappears with it, and
  nothing else in this change depends on it.
- **The `DraftToolbar` fix makes publish stop prompting** in a case where a
  user has learned to expect a prompt → The prompt was wrong; the draft is
  identical to the server's. The conflict banner still tells them what
  happened.

## Migration Plan

Purely client-side; no data, no API, no schema.

1. Land per-app: `admin`, then `studio`, then `app` (which needs the least).
   Each is independently shippable and independently reviewable.
2. Verify each app by inducing a failure the way a user would experience it —
   stop the engine, or point the app at a dead origin — and confirm every
   screen says so rather than showing an empty list.
3. Rollback is reverting; nothing persists.

## Open Questions

- Should a failed *refresh* (a list that already has data) render differently
  from a failed *initial load* (a list that has none)? The first can keep
  showing stale rows with a banner; the second cannot. Left to the design
  skills' pass over the states, since it is a presentation decision rather
  than a contract one — the requirement only says the failure must be
  reported.
- Should the three per-app error catalogs eventually converge into
  `packages/form-ui`, the one place a shared frontend module already lives?
  Only if a third consumer appears; today it would be an abstraction over two
  and a half cases.
