## Why

Comments and attachments (`instance_comments`/`instance_attachments`) are unconditional today: `end-user-app` requires the Task screen to show the comment thread and attachment list. That must hold "independent of claim state," on every step of every process. No process can turn either off, and no step can differ from another. An author may want a lean approval step with no attachment upload, or a process where comments are noise. The definition contract gives them no way to express that today.

## What Changes

- New optional `collaboration` config on both `ProcessBody` and `Step` in the definition contract: `{ comments?: boolean; attachments?: boolean }`. A step resolves each key independently against the process-wide default, falling back to `true` (today's unconditional behavior) when neither sets it.
- `postComment` and `uploadAttachment` (Runtime API Layer) reject with a new error when the instance's *current* step resolves the corresponding flag to `false`. Listing (`listComments`/`listAttachments`) still works as before. History stays visible read-only even after the instance moves to a step that disables further additions.
- `getInstanceView` exposes the resolved `{ comments, attachments }` booleans. The Task screen uses them to hide only the add-affordance (post box / upload control), never the existing history.
- Studio authoring gets two changes. The process header bar gets two checkboxes for the process-wide default. The Steps tab's step page gets a new "Collaboration" section. Each field there gets a three-state control: inherit the process default, on, or off.

No existing example or published instance changes shape or behavior. Every new key is optional and defaults to the current unconditional behavior. A body that doesn't set it keeps its `definitionHash`.

## Capabilities

### New Capabilities

None. This extends the existing, already-shipped comments/attachments behavior; it introduces no new capability domain.

### Modified Capabilities

- `definition-contract`: new optional `collaboration` object on `ProcessBody` and on `Step`.
- `runtime-api`: `postComment`/`uploadAttachment` reject when the current step's resolved config disables the field; `getInstanceView` gains a resolved `collaboration` field.
- `http-wrapper`: new error response for a rejected comment/attachment POST.
- `end-user-app`: the Task screen's comment-thread and attachment-list requirements become conditional on the resolved per-step config, for the add-affordance only. The existing list/thread visibility stays the same.
- `studio-process-tabs`: the process header bar carries the two process-wide default controls.
- `studio-step-page`: the step page carries a new "Collaboration" section with the per-step override controls.

## Impact

- **Code**: `src/schema/definition.ts` (schema), `src/runtime/api.ts` (`postComment`, `uploadAttachment`, `getInstanceView`), `src/http/errors.ts` (new error mapping), and `packages/web/src/areas/app/api/types.ts` (client-side `InstanceView` mirror) carry the runtime and schema changes. Meanwhile, `packages/web/src/areas/app/screens/TaskScreen.tsx`, `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`, `packages/web/src/areas/studio/panels/StepPage.tsx`, and `packages/web/src/areas/studio/panels/sectionsFor.ts` (the section-visibility gate `StepPage.tsx` reads) carry the UI changes. They're joined by `docs/authoring-guide.md` and the i18n catalog entries for the new controls' copy.
- **API**: `POST /instances/:id/comments` and `POST /instances/:id/attachments` gain one new response. Both can now answer with a 409 error type, `collaboration-disabled`, alongside their existing responses. `GET` routes for both keep their current behavior. `InstanceView`'s JSON shape gains one field.
- **Dependencies**: none new.
- **Out of scope**: `InstanceComment`/`InstanceAttachment` gain no `stepId`, since the engine never filters history by originating step. The admin area gets no change, since it does not show comments/attachments today. No generic collaboration-feature registry exists beyond the two fixed boolean fields. The Studio Player gets no change either: it has no comment/attachment UI today. Its `api/client.ts` exposes only `getInstanceView`/`createTestInstance`/`claimStep` (verified), so nothing there needs conditioning. Building that UI from scratch is a separate change.
