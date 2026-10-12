# Design

## Context

See `proposal.md` for the three findings. Today `InstanceScreen.tsx` fetches
the view first. Then it runs one `Promise.all`. That call reads the version
list, the record, 200 timer rows, the process list, the audit page and the
chain check. The screen derives `transitionSeq` and the claimant from the loaded record. It takes
the base locale from the process list and the timer from the 200 rows.

`InstanceView` already carries `assignment` and `baseLocale`
(`src/runtime/instances.ts`). The admin area's own `InstanceView` type omits
both and has no `transitionSeq`. A transition writes the new, unclaimed
assignment and no `assignment.released` event. The record therefore cannot say
that a claim ended. `view.assignment` holds the persisted state, so it needs
no event.

## Goals / Non-Goals

**Goals:**

- Every value in the instance header comes from a read that returns the
  current state. The view supplies `transitionSeq`, claim and base locale. The
  filtered timers read supplies the timer.
- Discard asks before it acts. The text says that no retry follows.

**Non-Goals:**

- No `assignment.released` event on a transition. The record stays as it is.
  The header stops reading it.
- No admin dialog component. Seven admin prompts already use
  `window.confirm`, Retry among them. Discard joins them.
- No `/admin/timers` entry in `docs/openapi.yaml`. The `http-api-documentation`
  spec excludes `admin/*`, and `test/openapi-exclusions.test.ts` guards it.
- No rewrite of the app area's or the studio's `InstanceView` types. An extra
  JSON member does not touch them.
- No layout change on either screen.

## Decisions

**1. The header reads the view. The record feeds the timeline only.**
The screen drops `deriveFromRecord`. The claim line prints
`view.assignment?.claimedBy` and reads "Unclaimed" when the member is absent or
null. A step with no `assignment` omits the member, so absent means unclaimed.
The `listProcesses` call and its `baseLocale` state go away. The step label
resolves against `view.baseLocale`. The alternative adds an
`assignment.released` event on every transition. That widens the runtime
record for a fact the instance already holds.

**2. `transitionSeq` is a required member of `InstanceView`.** The value is
`instance.transitionSeq`, which `getInstanceView` already holds. The view needs
no extra read and no authorization work. The delta lands in `runtime-api`,
where the spec states every other `InstanceView` member. The owner's ruling
named `instance-query`, which describes list and record reads only. The
decision stays the same and the file differs. The alternative trusts the
record only when fully loaded. It prints a dash on any long record, which
fails the header requirement in `admin-app`.

**3. `listPendingTimers` takes an optional `instanceId`.** The SQL gains one
predicate beside the cursor predicate, in the same style:
`(${instanceId ?? null}::text IS NULL OR instance_id = ${instanceId ?? null})`.
The filter applies before `LIMIT`, so `limit=1` finds the row wherever it
would sort. The cursor encoding does not change. The route reads `instanceId`
from the query string with `?? undefined`, as the outbox route does at
`admin-routes.ts:92`. The screen calls
`listPendingTimers(token, { instanceId, limit: 1 })` and takes `items[0]`.
`TIMERS_SCAN_LIMIT` and its `ponytail:` comment go away. The alternative puts
timer data inside `InstanceView`. That adds a member to a payload every
participant reads.

**4. Discard confirms through `window.confirm`.** `doDiscard` in
`OutboxScreen.tsx` gets the same first line as `doRetry`. It reads the new
catalog key `outbox.discardConfirm` from the EN and DE admin catalogs. Draft
text, EN: "Discarding is final. This action's side effect never goes out, and
you cannot retry it afterwards. Continue?" The German text follows the shape
of `outbox.retryConfirm`. Each text is one whole sentence group per key.

**5. Visual shape.** Every element stays. The header keeps its `dl` rows in
the same order. The only new user-visible text is the confirm string. The
browser draws it, so no mockup is due. `/impeccable critique` and
`/impeccable audit` run on both routes at the browser check.

## Risks / Trade-offs

- [A new required `InstanceView` member breaks a fixture that builds the type
  by hand] → `bun run typecheck` and the full suite name each one. The app and
  studio web types are separate declarations and stay as they are.
- [`transitionSeq` becomes visible to participants through
  `GET /instances/:id`] → The counter moves with the participant's own
  submits. The view authorizes the same callers as before.
- [A native confirm blocks `playwright-cli` readers] → The browser check
  accepts the dialog with `dialog-accept`.
- [The delta specs copy existing requirement text, and a new delta file has
  antislop base 0] → Targeted `antislop: allow` directives with a reason.
  Never `allow-file`.

## Migration Plan

None. The change stores nothing new. A client that sends no `instanceId` gets
the old timers listing. Rollback is a revert of the merge.

## Open Questions

None.
