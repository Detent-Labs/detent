# Ponytail Debt Ledger

Every deliberate `ponytail:` shortcut in the codebase, naming its ceiling and
upgrade path. Regenerate with `/ponytail-debt` — this file is a snapshot, not
a live view; re-run the scan before trusting it after further changes land.

Last scanned: 2026-07-29.

## Markers

**src/schema/hash.ts:17** — `canonicalize` skips full RFC-8785 number
canonicalization (exponent/precision), relying on JSON's own number form.
ceiling: only correct while every number in a `ProcessBody` round-trips
through JSON as-is. upgrade: add full canonicalization if a non-integer
number ever enters a `ProcessBody`.

**src/cel/check.ts:22** — `instance`/`actor` CEL context shapes are minimal.
ceiling: narrower than full runtime state. upgrade: widen when a real guard
needs more.

**src/cel/check.ts:32** — file/plugin field types and data sources type as
CEL `dyn`. ceiling: untyped, skips strict checking. upgrade: add real types
when the plugin output schemas are formalized.

**src/cel/check.ts:38** — every JSON number types as CEL `double`. ceiling:
int literals don't `==`/`%` a double, a documented papercut. upgrade: needs
an int/float split in the field catalog — named but not scheduled.

**src/engine/definitions.ts:182** — publish version assigned via
`MAX(version)+1` check-then-insert, relying on the `(process_id, version)`
PK as race backstop. ceiling: assumes v1 publish is never concurrent.
upgrade: move to a per-process sequence only if that changes.

**src/engine/definitions.ts:347** — `resolveLatestByContract` hashes each
candidate's contract on read instead of a persisted contract-hash column.
ceiling: rescans candidates every call. upgrade: add a persisted column if
this ever scans hot.

**src/engine/duration.ts:5** — timer durations support only fixed units (no
calendar Y/M). ceiling: no calendar math. upgrade: add only if a real Y/M
timer appears.

**src/engine/outbox.ts:45** — `CLAIM_LEASE_MS` fixed at 30s before an
abandoned outbox row is reclaimed. ceiling: one lease duration for every
handler. upgrade: raise only if a real handler legitimately runs longer.

**src/engine/store.ts:252** — `instanceId` minted as UUIDv4 instead of the
contract's originally-intended UUIDv7. ceiling: not time-sortable across
instances. upgrade: move to v7 only when cross-instance time ordering is
needed.

**src/auth/login.ts:32** — login rate limiting tracked in a per-process
in-memory `Map`. ceiling: resets on restart, no coordination across server
instances. upgrade: move to a shared store (a Postgres row or Redis) keyed
the same way, if this ever runs as more than one process.

**packages/form-ui/src/form-ui.css:1** — structural layout only, no visual
design. ceiling: unstyled forms. upgrade: real styling lands with the
`packages/app` screens and flows back here so the editor's Player picks it
up too.

**packages/admin/src/screens/InstanceScreen.tsx:16** — the instance detail
screen scans a single generous timer page (`TIMERS_SCAN_LIMIT = 200`)
because no per-instance timer read exists over HTTP. ceiling: `GET
/admin/timers` has no `instanceId` filter, so a backlog past 200 pending
timers hides an instance's own. upgrade: add an `instanceId` filter if that
stops holding.

**packages/editor/src/draft/file-system-access.d.ts:1** — hand-declares only
the two File System Access API entry points `file-io.ts` actually calls, not
the full spec. ceiling: partial type coverage, silently wrong if a new part
of the API is used later. upgrade: extend when `file-io.ts` starts calling
another part of the API.

## Summary

13 markers, 0 with no trigger.

Changes since the last snapshot (2026-07-24): three markers are new —
`src/auth/login.ts:32` (`add-login-rate-limit`),
`packages/form-ui/src/form-ui.css:1` (`add-end-user-app`) and
`packages/admin/src/screens/InstanceScreen.tsx:16` (`admin-shell-and-ops`);
the last two shipped with frontend packages the 2026-07-24 scan predates.
One marker is **resolved and removed**: `src/engine/outbox.ts`'s fixed
exponential backoff, closed by `wire-outbox-retry-policy` — `backoffMsFor`
now honours each action's own `retry.backoff`/`retry.baseDelay`, with the
engine schedule as the default rather than the only curve. Line numbers
shifted on four surviving markers (`definitions.ts` 182/347, was 180/278;
`outbox.ts` 45, was 26; `store.ts` 252, was 208), content unchanged.
`packages/studio` and `packages/app` carry no markers of their own.
