## Context

See proposal.md - Why. `instance_audit` (`src/engine/store.ts:717`)
already works correctly. The two triggers write it, and
`verify_instance_chain()` verifies it. Only a caller onto them is
missing. `verifyInstanceChain` (`src/engine/admin-queries.ts:259`) is
the one existing TypeScript entry point, and it only verifies. Nothing
lists the entries themselves.

`getInstanceRecord` (`src/runtime/api.ts:1564`) sets the precedent for a
paginated, per-instance admin read. It paginates with keyset cursors
shaped `(seq, at, id)`, via `decodeCursor`/`keysetPage`.
`InstanceScreen.tsx`'s existing `recordList` state and "load more"
button consume it
(`packages/web/src/areas/admin/screens/InstanceScreen.tsx:59-256`).

## Goals / Non-Goals

**Goals:**
- Make the audit log and its chain verification reachable through the
  product. Change nothing about what the log records or how redaction
  works.
- Reuse the existing keyset-pagination and admin-route conventions
  exactly. Do not invent a second pattern.

**Non-Goals:**
- No change to `instance_audit`'s schema, its triggers, its hash chain,
  or redaction (`instance-audit-log-chain`, `redactable-field-flag`).
  This change only reads.
- No cross-instance audit search or export. `docs/decisions.md`'s open
  question about an NDJSON audit/history export stays separate and
  unbuilt.
- No non-admin visibility. The audit log carries clear-text field values
  that a participant-facing screen would withhold from that same actor.
  This view stays `system:admin`-only. It gets no starter/authoring
  fallback, unlike `getInstanceRecord`.
- No process-scoped `read` permission. This deliberately stays
  `ADMIN_ROLE`-only rather than the newer process-scoped `read`
  permission (`process-read-permission`, archived 2026-08-27). That
  mirrors the same deferral `process-read-permission`'s own proposal
  used for the reporting routes. The audit log's clear-text sensitivity
  also argues for keeping the narrower gate here, not widening it.

## Decisions

**Where the read lives: `src/engine/admin-queries.ts`, not
`src/runtime/api.ts`**. This module already hosts `verifyInstanceChain`,
a single-instance admin-only read with no participant-facing fallback.
By contrast, `getInstanceRecord` lives in `runtime/api.ts` because it
carries a non-admin fallback path, a starter reading their own instance.
The new audit-entry read carries no such fallback. It is
`system:admin`-only by design (see Non-Goals), so it belongs beside
`verifyInstanceChain`.

**Two routes, not one.** `GET /admin/instances/:id/audit` (entries) and
`GET /admin/instances/:id/audit/verify` (chain check) stay separate.
Combining them would re-run `verify_instance_chain`, a scan of the
instance's full chain, on every page turn through the entries. Splitting
them lets the UI call `verify` once per screen load and `audit` once per
page. Each call then matches its own actual cost. It also matches the
spec's own scenario: paging never re-triggers verification.

**Cursor shape mirrors `getInstanceRecord`'s.** `(seq, at, id)` there
becomes `(seq)` here. `instance_audit`'s primary key is
`(instance_id, seq)`, so `seq` alone gives a total order within one
instance. It needs no tiebreaker column. `admin-queries.ts` already
imports `decodeCursor`/`encodeCursor` from `../pagination.js`.
`listOutbox` and `listPendingTimers` both use them. The new read reuses
them the same way. It inlines its keyset-paging logic directly, the
same way `listOutbox` and `listPendingTimers` already do. No shared
local helper exists in this file.

**Redacted-value representation.** A `redact` entry, and a `set` entry a
redaction later nulled, both carry `value IS NULL` in the row. The read
omits `value` from the response for those rows: `undefined`, never
`null`. The client can then tell a redacted value apart from a JSON
null value. That is the same distinction the `instance-audit-log`
spec's own "A key ... is a change" requirement already draws for
writers. The client renders the omitted case as a "redacted" marker.

**No new i18n or design pattern.** The Audit Log section reuses
`InstanceScreen.tsx`'s existing `admin-timeline`/`admin-load-more` CSS
classes and its `t(locale, ...)` convention. It adds new string keys
only, not a new list/pagination component.

## Risks / Trade-offs

- [Audit log length: full verification scans every entry] → Already
  bounded by `verify_instance_chain`'s own cost. This route adds no new
  cost, just a new caller. If verification latency ever becomes a
  problem, that is a change to `verify_instance_chain` itself, not to
  this read-only surface.
- [Clear-text historical values widen what a compromised
  `system:admin` credential can read] → Already true of
  `redactInstance` and the admin view. This change makes an existing
  database-level exposure reachable through the product. It creates no
  new one. `docs/decisions.md`'s "Explicitly not the goal" section
  already accepted clear-text-in-log as a traded-away decision.

## Migration Plan

None. The routes and the UI section are both additive. No existing
behavior changes, and no data migrates.

## Open Questions

This design resolves both questions it could have left open above:
route shape and cursor shape. Neither changes the specs or the task
breakdown if answered later.

One question stays open. The verified-state indicator runs a full
chain scan on every screen load, not on demand. Automatic per-load
verification better matches this change's own goal, readable "without
ceremony." Revisit with an on-demand "Verify chain" button only if a
long-lived instance's screen-load latency becomes a measured problem.
