# Ponytail Debt Ledger

Every deliberate `ponytail:` shortcut in the codebase, naming its ceiling and
upgrade path. Regenerate with `/ponytail-debt` — this file is a snapshot, not
a live view; re-run the scan before trusting it after further changes land.

Last scanned: 2026-07-24.

## Markers

**src/schema/hash.ts:17** — `canonicalize` skips full RFC-8785 number
canonicalization (exponent/precision), relying on JSON's own number form.
ceiling: only correct while every number in a `ProcessBody` round-trips
through JSON as-is. upgrade: add full canonicalization if a non-integer
number ever enters a `ProcessBody`.

**packages/editor/src/draft/file-system-access.d.ts:1** — hand-declares only
the two File System Access API entry points `file-io.ts` actually calls, not
the full spec. ceiling: partial type coverage, silently wrong if a new part
of the API is used later. upgrade: **no-trigger** — no condition named for
extending the declarations.

**src/engine/outbox.ts:22** — fixed exponential backoff (1s, 2s, 4s, …), not
per-action configurable. ceiling: one backoff curve for every action type.
upgrade: make configurable only if delivery SLAs ever diverge.

**src/engine/outbox.ts:26** — `CLAIM_LEASE_MS` fixed at 30s before an
abandoned outbox row is reclaimed. ceiling: one lease duration for every
handler. upgrade: raise only if a real handler legitimately runs longer.

**src/engine/definitions.ts:159** — publish version assigned via
`MAX(version)+1` check-then-insert, relying on the `(process_id, version)`
PK as race backstop. ceiling: assumes v1 publish is never concurrent.
upgrade: move to a per-process sequence only if that changes.

**src/engine/definitions.ts:252** — `resolveLatestByContract` hashes each
candidate's contract on read instead of a persisted contract-hash column.
ceiling: rescans candidates every call. upgrade: add a persisted column if
this ever scans hot.

**src/cel/check.ts:22** — `instance`/`actor` CEL context shapes are minimal.
ceiling: narrower than full runtime state. upgrade: widen when a real guard
needs more.

**src/cel/check.ts:32** — file/plugin field types and data sources type as
CEL `dyn`. ceiling: untyped, skips strict checking. upgrade: add real types
when the registry lands.

**src/cel/check.ts:38** — every JSON number types as CEL `double`. ceiling:
int literals don't `==`/`%` a double, a documented papercut. upgrade: needs
an int/float split in the field catalog — named but not scheduled.

**src/engine/duration.ts:5** — timer durations support only fixed units (no
calendar Y/M). ceiling: no calendar math. upgrade: add only if a real Y/M
timer appears.

**src/engine/store.ts:208** — `instanceId` minted as UUIDv4 instead of the
contract's originally-intended UUIDv7. ceiling: not time-sortable across
instances. upgrade: move to v7 only when cross-instance time ordering is
needed.

**src/engine/transition.ts:658** — `markFaulted` is a bare status flip, no
HistoryEntry/dedicated audit event. ceiling: no persisted audit trail for a
fault park. upgrade: **no-trigger** — the comment defers a dedicated fault
event but names no condition for adding one.

## Summary

12 markers, 2 with no trigger.

Changes since the last snapshot (2026-07-24, pre-reconcile-migration-writebacks):
`store.ts` and `transition.ts` line numbers shifted (208, was 197; 658, was
677) from that session's edits, content unchanged. `src/schema/hash.ts:17` is
newly listed — present in the codebase but missed by the prior scan.
`transition.ts:658` (`markFaulted`) is reclassified **no-trigger**: the prior
snapshot credited it with a specific trigger condition ("once a faulted
instance needs to be diagnosed after the fact...") that is not actually
present in the source comment — this scan pulls strictly from the comment
text, per the skill's own rule, and the comment names no trigger.
