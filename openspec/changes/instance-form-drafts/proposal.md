## Why

A participant working a running instance can spend a long time filling a
step's form. Today the only way to keep that input is to submit. Submitting
validates the whole form and advances the step. Otherwise the input lives only
in browser state. It vanishes on navigation, refresh, logout, or a device
switch. A long or multi-session form has no "save and come back."

## What Changes

- Add an *instance form draft*: a per-instance, per-visit field-to-value map.
  The engine saves it leniently and keeps it separate from `instance.data`. It
  offers the draft again when the participant returns to the same step. It
  clears the draft on transition, migration, cancel, or redaction.
- Add an `instance_drafts` table and an engine module with get/save/delete.
- Add a Runtime API operation `saveInstanceDraft` under the same authorization
  as submit. It authorizes the claimant, or the starter or an admin, on a
  running instance only. Extend `getInstanceView` to return the matching
  draft.
- Add the HTTP route `PUT /instances/:instanceId/draft`.
- Add a Save control, a "saved" confirmation, and a "draft restored" notice to
  the participant Task screen.

## Capabilities

### New Capabilities

- `instance-form-drafts`: the per-instance form draft. It covers storage,
  leniency, step-scoped gating, and lifecycle. The lifecycle clears the draft
  on transition, migration, cancel, and redaction.

### Modified Capabilities

- `runtime-api`: new `saveInstanceDraft` operation, `getInstanceView` returns
  the draft, and a shared submit-authorization predicate.
- `http-wrapper`: the `PUT /instances/:instanceId/draft` route.
- `end-user-app`: the Task screen save and restore UX.
- `data-retention`: `redactInstance` deletes the draft beside comments and
  attachments, so a redacted instance keeps no unfinished input.

The clear-on-transition, clear-on-migration, clear-on-cancel, and
clear-on-redaction lifecycle lives in the new `instance-form-drafts`
capability. It does not live in the `transition-execution`,
`instance-migration`, or `cancellation` specs. This change modifies the
`data-retention` capability's erasure contract to name the draft relation.

## Impact

- `src/engine/store.ts` (schema init) and a new
  `src/engine/instance-drafts.ts`. Also `src/engine/transition.ts`,
  `src/engine/migration.ts`, and `src/engine/retention.ts`. These clear the
  draft on transition, migration, and redaction.
- `src/runtime/api.ts` (new operation, view field, shared predicate).
- `src/http/server.ts` and `src/http/routes.ts` (new route).
- `packages/web/src/areas/app/**` (Task screen, API client and types, i18n
  catalog) and `docs/browser-checks.md`.
- This change does not touch `packages/form-ui`.
- `test/retention.test.ts` gains draft-deletion/idempotency assertions and a
  TRUNCATE-list entry for `instance_drafts`; `test/schema-bootstrap.test.ts`
  gains a DROP-list entry.
- New engine and runtime coverage in `test/instance-drafts.test.ts` (tasks 5.1,
  5.2), plus additions to `test/transition.test.ts` (task 5.3),
  `test/migration.test.ts` (task 5.4), and `test/http.test.ts`
  (task 5.5).
- No definition-contract change, no change to `instance.data` semantics, and no
  change to what the engine executes.
