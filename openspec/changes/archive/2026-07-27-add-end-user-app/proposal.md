## Why

Only `packages/editor`'s Player can drive a running instance today, and it is a
single-instance preview tool for authors (no task list, no login flow beyond
dev headers). Nobody who actually performs the work a process describes has an
application to do it in. This proposal adds that application.

## What Changes

- **`packages/form-ui`** (new, source-only workspace package): extracts step-form
  rendering out of the editor's `FieldInput.tsx` into a shared package — field
  rendering per `BaseFieldType`, groups/order/required/readonly, per-field
  validation errors from `SubmissionValidationError.issues`, the path-submit
  buttons, and their CSS. Takes `locale` as a prop.
- **`packages/editor`** (changed): the Player imports `form-ui` instead of
  owning `FieldInput.tsx`. No change to the editor's own chrome, structural
  panels, or graph view; it keeps passing `en`.
- **`packages/app`** (new): the end-user application — four screens (Login, My
  tasks, Task, Start a process), a small hand-written History-API routing hook,
  JWT session in `localStorage` with 401-redirect-to-login, a single active
  locale (`de`/`en`) resolved with fallback to the process's `baseLocale`, and
  no polling (refetch on focus, on manual refresh, and after submission).
- **`InstanceSummary` carries labels and step-entry time**: `processLabel`,
  `stepLabel` (`LocalizedText`), and `currentStepEnteredAt`, so a personal
  inbox can render without shipping whole process bodies to end-user browsers.
- **`scope=mine` on `GET /instances`**: server-derives "mine" from the
  authenticated actor rather than trusting a client-supplied `assignedTo=<id>`,
  keeping a later group-based assignment extension entirely server-side.
- **Starters may cancel their own case**: `POST /instances/:id/cancel` accepts
  `startedBy === actor.id` in addition to the existing `system:cancel-any` role,
  so an abandoned start doesn't strand an unassigned running instance.

Out of scope for v1 (unchanged from the approved design): case history view,
notifications, attachments, comments, delegation, role/group-based assignment,
and the admin/developer area.

## Capabilities

### New Capabilities
- `form-ui`: shared step-form rendering (fields, groups, validation errors,
  path-submit buttons, CSS) consumed by both the editor's Player and the new
  end-user app, so what an author previews is what a participant gets.
- `end-user-app`: the participant-facing web app — login, a cross-instance task
  inbox with client-side filter/sort/group, the task screen (claim, edit,
  submit, release), the start-a-process screen, routing/session handling, and
  the typed-error-to-UI mapping table.

### Modified Capabilities
- `instance-query`: `InstanceSummary` gains `processLabel`, `stepLabel`, and
  `currentStepEnteredAt`; `GET /instances` gains a server-derived `scope=mine`
  filter.
- `http-wrapper`: `POST /instances/:instanceId/cancel` additionally authorizes
  a case's own starter (`startedBy === actor.id`), not only `system:cancel-any`.
  (The `cancellation` capability's engine-level cancel semantics and the
  `authorization` capability's `system:cancel-any` role gate are both
  unchanged — this is purely the HTTP route's authorization decision gaining
  a second, non-role path.)

## Impact

- Affected code: `packages/editor/src/player/FieldInput.tsx` (extracted, file
  deleted from the editor and its consolidation spec
  `field-input-rendering-consolidation` retired in favor of an equivalent
  structural requirement under `form-ui`), `src/runtime/api.ts`
  (`InstanceSummary`, `GET /instances`), `src/http/routes.ts` (cancel route's
  authorization check), new packages `packages/form-ui` and `packages/app`
  added to the Bun workspace.
- No schema/contract (`src/schema/definition.ts`) changes; no new external
  dependencies (routing is hand-written, not a router package).
- Depends on the existing `jwt-authentication`/`local-user-accounts` login flow
  and `data-source-resolution`'s option resolution; introduces no new engine
  concepts.
