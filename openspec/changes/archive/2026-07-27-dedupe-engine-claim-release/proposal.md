## Why

`PONYTAIL-AUDIT.md` finding 4 (2026-07-27 scan): `src/engine/transition.ts`'s
`claimStep` and `releaseClaim` (`:856-917`) are the same 25-line body —
row-lock, running-instance no-op, validate, `jsonb_set('{assignment}')`,
append an `InstanceEvent`, return `{...inst, assignment: next}` — differing
only in the validation guard, the computed `next` assignment value, and the
event `kind`. This is engine core touching load-bearing assignment/claim
semantics (`assignment-claim-enforcement` capability), so it carries the
highest scrutiny of this audit batch: it must be verified against the
assignment test suites, not just `tsc`.

## What Changes

- Extract a shared `updateAssignment(instanceId, actor, db, guard,
  computeNext, eventKind)` helper that does the row-lock, running-instance
  no-op, guard call, `jsonb_set` write, single shared timestamp, and event
  append — once. `claimStep` and `releaseClaim` each become a thin call
  passing their own guard closure, `computeNext` closure, and event kind.
- Preserve the detail that today's `claimedAt`/`releasedAt` on the new
  `assignment` value and the appended event's `at` are the exact same
  `new Date().toISOString()` call — the helper computes the timestamp
  once and hands it to `computeNext`, rather than each function computing
  its own (which would silently let the two timestamps drift apart by a
  few milliseconds, a real behavior change from today's single-timestamp
  guarantee).

## Capabilities

### New Capabilities
- `assignment-claim-release-consolidation`: one structural requirement —
  the claim/release row-lock-guard-write-event sequence is implemented
  once and reused by both operations, differing only in their guard,
  computed next state, and event kind. External behavior (exclusivity,
  no-op on non-running, no `HistoryEntry`/`transitionSeq` advance, event
  shape, the shared claimedAt/releasedAt-equals-event-at timestamp) is
  unchanged; mirrors the repo's established pattern for audit-driven
  mechanism-level dedup (`http-route-handling-consolidation`,
  `runtime-field-type-check-consolidation`).

### Modified Capabilities
None. `openspec/specs/assignment-claim-enforcement/spec.md` already fully
specifies `claimStep`/`releaseClaim`'s behavior ("Claiming a step is
exclusive", "Only the claimant may release a claim", "Claim and release
append audit events without advancing the transition sequence") — no
requirement text there changes; this is purely an implementation-mechanism
change underneath an already-correct behavioral spec, same relationship
`dedupe-http-route-handling` had to `http-wrapper`.

## Impact

- Affected file: `src/engine/transition.ts` (`claimStep`, `releaseClaim`,
  and the new shared `updateAssignment` helper — module-internal, no
  exported signature changes).
- No change to `src/schema/definition.ts`, the JSON process definition
  contract, or any other engine module. Every observable outcome —
  which claims/releases succeed or fail with which error, the resulting
  `assignment` shape, the appended `InstanceEvent`, and the exact shared
  timestamp between them — is byte-for-byte unchanged.
- No dependency changes.
