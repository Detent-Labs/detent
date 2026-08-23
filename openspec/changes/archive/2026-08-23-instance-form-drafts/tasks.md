## 1. Engine storage

- [x] 1.1 Add the `instance_drafts` table (`instance_id` primary key, `step_id`, `data` jsonb, `updated_by`, `updated_at`) to `initSchema` in `src/engine/store.ts`, beside the existing `drafts` table.
- [x] 1.2 Create `src/engine/instance-drafts.ts` exporting `getInstanceDraft`, `saveInstanceDraft` (an upsert on `instance_id`), and `deleteInstanceDraft`, with an envelope check that requires `data` to be a plain JSON object within `MAX_DRAFT_ENVELOPE_BYTES`.
- [x] 1.3 Delete the instance's draft inside `commitTransition`'s transaction in `src/engine/transition.ts`, after `applyStepEntry` succeeds. This one hook covers manual submit, the automatic cascade, a transition timer, and cancel.
- [x] 1.4 Delete the migrated instance's draft inside `migrateOne`'s transaction in `src/engine/migration.ts`, after `applyStepEntry` succeeds. Every version migration clears the draft, relocation or not.
- [x] 1.5 Delete the instance's draft inside `redactInstance`'s transaction in `src/engine/retention.ts`, beside the comment and attachment deletes. Update that file's module-level doc comment (lines 1-7) in the same commit, adding `instance_drafts` to the list of relations `redactInstance` clears alongside `instances.body.data`, `instance_comments`, and `instance_attachments`.

## 2. Runtime API

- [x] 2.1 Extract the submit authorization predicate from `submitAndTransition` into one shared helper. It covers claimant-only on an assignment-bearing step, starter or `ADMIN_ROLE` otherwise, and `InstanceNotRunningError` when not running.
- [x] 2.2 Add `saveInstanceDraft(instanceId, data, actor, db?)` to `src/runtime/api.ts`. It reads the instance and runs the shared predicate. It derives `step_id` from the current step and stores via the engine module. Export the new error type as needed.
- [x] 2.3 Add `draft?: { stepId, data, updatedBy, updatedAt }` to `InstanceView` and populate it in `getInstanceView` only when a stored draft's `step_id` equals the current step.

## 3. HTTP route

- [x] 3.1 Register `PUT /instances/:instanceId/draft` in the route table in `src/http/server.ts`.
- [x] 3.2 Add the handler in `src/http/routes.ts`. It resolves the actor, parses the `{ data }` body, and calls `saveInstanceDraft`. It returns `200` with `{ updatedBy, updatedAt }`, mapping errors like the submit route does.

## 4. App UI

- [x] 4.1 Invoke `/frontend-design:frontend-design` before touching `TaskScreen.tsx`'s Save control, saved-confirmation, and form-draft-restored notice.
- [x] 4.2 Add a `saveInstanceDraft` client function and the `draft` field on the app area's `InstanceView` type.
- [x] 4.3 In `TaskScreen.tsx`, add a Save control gated by `maySubmit(claimControls) && view.status === "running"`. A non-running instance offers no Save, the same way it offers no path-submit. The control sends `filterToEditable(formValues, view.fields)`. It shows a saved confirmation on success.
- [x] 4.4 In `TaskScreen.tsx`, seed `formValues` from `view.draft.data` over `field.value` and show a "form draft restored" notice when a form draft exists.
- [x] 4.5 Add the new strings (Save, saved confirmation, form-draft-restored notice) to `packages/web/src/i18n/catalogs/app.ts`, in both `en` and `de`.

## 5. Tests

- [x] 5.1 Engine tests: draft upsert, lenient storage, non-object refusal, `step_id` recording, and delete.
- [x] 5.2 Runtime tests: `saveInstanceDraft` authorization parity and non-running rejection, and `getInstanceView` returning the draft only on a step match.
- [x] 5.3 Transition tests: submit clears the draft, cancel clears the draft, and a timer/automatic transition leaves no offered draft.
- [x] 5.4 Migration test: applying a migration plan to a running instance that holds a draft deletes the draft. This holds whether the migration relocates the step or is an identity/fieldMap-only migration. A later transition back to the recorded step does not re-offer it.
- [x] 5.5 HTTP tests: `PUT /instances/:instanceId/draft` success and 400 on a non-object body. Also cover 401/403/409/500 mapping, including `NotFoundError` mapping to 500, not 404, matching the submit route's own table.
- [x] 5.6 Add a browser check for save, navigate away, and restore to `docs/browser-checks.md`. Keep it manual, not a `bun:test` assertion. `development-toolchain`'s split rule reserves the assertion path for a repeat error this repo already recorded. This is new work with no such record.
- [x] 5.7 Retention tests: `redactInstance` on a completed instance deletes its draft. A running instance refuses redaction, and its draft survives. A second `redactInstance` call on an already-redacted instance is idempotent. It raises no error and leaves no duplicate against the already-deleted draft row. Add `instance_drafts` to `test/retention.test.ts`'s `beforeEach` TRUNCATE list and `test/schema-bootstrap.test.ts`'s DROP list. (This DROP-list update is best-effort, matching existing gaps without asserting `instance_drafts` bootstrap; fixing it fully is out of scope.)

## 6. Verification

- [x] 6.1 Run `bun run typecheck`.
- [x] 6.2 Run `bun run build`.
- [x] 6.3 Run the full `bun test` with `DATABASE_URL` set, and confirm no database-backed suite skipped.
- [x] 6.4 Run `sh scripts/gates/prose.sh < /dev/null` and `sh scripts/gates/whitespace.sh < /dev/null`.
- [x] 6.5 Run the UI browser check from 5.6.
