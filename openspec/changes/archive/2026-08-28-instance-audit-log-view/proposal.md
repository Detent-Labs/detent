## Why

`instance-audit-log-chain` (archived 2026-08-27) built the append-only
`instance_audit` table, the two triggers, the hash chain and
`verify_instance_chain()`. Its one TypeScript entry point is
`verifyInstanceChain` (`src/engine/admin-queries.ts:259`), and nothing
calls it. This capability's own goal, per `docs/decisions.md`, is one
readable record per change, without ceremony. That record names the
field, the old value in clear text, the actor, the timestamp, and the
write path.

That goal is unmet today. Only someone with direct database access can
prove the log, by running `SELECT * FROM
verify_instance_chain($1)` by hand. That gap already appears in
`docs/current-state.md`, and `docs/decisions.md`'s "Open, deliberately"
section leaves it unassigned to a change. This change is that
assignment.

## What Changes

- The engine gains a read over one instance's audit log, beside the
  existing `verifyInstanceChain`. It returns entries in sequence order:
  field, operation, a value in clear text (absent when redacted), actor,
  source, timestamp. It adds no new visibility rule, keeping the same
  authorization posture as the rest of the admin surface.
- A new admin route exposes that read. A second exposes the existing
  chain verification. Both need `system:admin`, like every other
  `/admin/*` route.
- The admin area's instance screen gains an Audit Log section: a
  keyset-paginated entry list beside the existing transition/event
  record. It also gains a verified/failed indicator, sourced from
  `verifyInstanceChain`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `instance-audit-log`: gains a requirement exposing one instance's audit
  entries in sequence order to an authorized reader.
- `admin-operations-api`: gains the `/admin/*` route(s) exposing the
  audit entries and the chain verification result.
- `admin-app`: the instance screen gains an Audit Log section (entries,
  redaction markers, verified/failed indicator).

## Impact

- `src/engine/admin-queries.ts`: a new read function beside
  `verifyInstanceChain`.
- `src/http/admin-routes.ts`: a new handler (or two).
- `src/http/server.ts`: route-table entries for the two new GET routes.
- `packages/web/src/areas/admin/api/client.ts` and `types.ts`: two new
  client calls and their response types.
- `packages/web/src/areas/admin/screens/InstanceScreen.tsx`: a new
  section, its own keyset-paginated list following the existing
  `recordList` pattern.
- `packages/web/src/areas/admin/catalog.ts`: new EN/DE keys for the
  Audit Log section and the verified/failed indicator.
- `docs/decisions.md` and `docs/current-state.md`: close out the
  "readable admin view over the audit log" gap this change fills.
- `test/`: an admin-queries test for the new read. An HTTP test for the
  new routes, covering the role gate, the entries, and the verification
  result. A browser check, per `docs/browser-checks.md`'s UI-change
  convention.
