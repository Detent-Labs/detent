## 1. Definition contract

- [ ] 1.1 Add the optional `collaboration: { comments?: boolean; attachments?: boolean }` object to both `processBody` and `step` in `src/schema/definition.ts`, per the `definition-contract` delta spec. Verify `bun run typecheck` passes and every file under `examples/` still parses unchanged (no `collaboration` key, so `definitionHash` stays the same).
- [ ] 1.2 Add a schema test covering three cases. A body with no `collaboration` anywhere parses with the field reading `undefined`. A step overriding one key inherits the other from the process default. A step can enable what the process default disables. Verify the new test passes.
- [ ] 1.3 Add a `collaboration` section to `docs/authoring-guide.md` documenting the new key and its per-key resolution rule for process authors.

## 2. Runtime API Layer enforcement

- [ ] 2.1 Add a `CollaborationDisabledError` class, naming the instance id and the disabled field (`"comments"` or `"attachments"`), alongside the other runtime error classes `postComment`/`uploadAttachment` already throw.
- [ ] 2.2 Add the per-key resolution helper (`step.collaboration?.X ?? body.collaboration?.X ?? true`). Both the enforcement in 2.3/2.4 and the `getInstanceView` field in 2.5 use it, so the fallback chain exists in exactly one place.
- [ ] 2.3 Change `postComment` (`src/runtime/api.ts`) to keep the `body` already returned by `loadInstanceForActor`, and resolve the current step via the existing `findStep` helper. Throw `CollaborationDisabledError` when `comments` resolves to `false`, before the `INSERT`.
- [ ] 2.4 Change `uploadAttachment` the same way, gating on `attachments`.
- [ ] 2.5 Add a resolved `collaboration: { comments: boolean; attachments: boolean }` field to the `InstanceView` returned by `getInstanceView`. Include it in the completed/cancelled/faulted case too: instance status does not gate it, unlike `availablePaths`.
- [ ] 2.6 Add runtime-api tests covering:
  - `postComment`/`uploadAttachment` reject with `CollaborationDisabledError` when disabled, both on a process-default-only case and a step-override case, and accept when enabled.
  - `listComments`/`listAttachments` still return an entry recorded on an earlier step after the current step disables further additions.
  - An actor with no instance visibility still gets `AuthorizationError` rather than `CollaborationDisabledError`, even when the current step disables the field. This confirms the visibility check runs first.
  - Verify via one full `bun test` run with `DATABASE_URL` set, rather than a single-file rerun. Read the verdict off the named test results.

## 3. HTTP wrapper

- [ ] 3.1 Map `CollaborationDisabledError` to `409` with `error.type: "collaboration-disabled"` in `src/http/errors.ts`'s `MESSAGE_ERRORS` table.
- [ ] 3.2 Add an http-wrapper test for each of `POST /instances/:id/comments` and `POST /instances/:id/attachments` asserting the `409`/`collaboration-disabled` response when the current step disables the field. Verify via the full `bun test` run.

## 4. End-user app UI

- [ ] 4.1 Mirror the new field in `packages/web/src/areas/app/api/types.ts`'s `InstanceView` as `collaboration?:`. Keep it optional on this frontend mirror specifically, matching the existing `columns?`/`tabs?` precedent there. It is never `undefined` on the engine-side type, though.
- [ ] 4.2 Change `TaskScreen.tsx` so the comment textbox+submit renders only when `collaboration.comments` is `true`. The upload control should render only when `collaboration.attachments` is `true`. The comment thread and attachment list always render regardless of either flag.
- [ ] 4.3 Add `CollaborationDisabledError` to the Task screen's typed-error handling. On a `409`/`collaboration-disabled` response from posting a comment or uploading an attachment, reload the instance view. Report that the step no longer accepts new entries of that kind, per the updated `end-user-app` "Typed engine errors" requirement.
- [ ] 4.4 Run `/impeccable critique` and `/impeccable audit` against the Task screen route. Then run the mechanical design detector (`node .claude/skills/impeccable/scripts/detect.mjs --json <changed TaskScreen files>`) after making that change. Then run a manual browser check with `playwright-cli` covering:
  - both fields enabled, matching today's unchanged behavior;
  - one field disabled on the current step;
  - history staying visible after a later step disables further additions; and
  - the reload-and-report behavior from 4.3, simulated by disabling the field mid-session and retrying the stale control.

  This screen already carries an unrelated, tracked bug (claim-row sideways scroll at 400px). Do not attribute it to this change.

## 5. Studio authoring UI

- [ ] 5.1 Add two checkboxes to `ProcessHeaderBar.tsx`, bound to the draft's `collaboration.comments`/`collaboration.attachments`. Style them per `DESIGN.md`'s checkbox rule: native checkbox, `accent-color`, no custom border. Place them in the header bar's inline-editable cluster after `baseLocale`, distinct from the header bar's three right-aligned Save/Discard/Publish controls. Style via compiled StyleX (`tokens.stylex`), matching this file's own existing declarations: no hand-written CSS or inline styles.
- [ ] 5.2 Add `"collaboration"` to `SectionName`, `TRAILING`, `PARTICIPANT` and `TERMINAL` in `packages/web/src/areas/studio/panels/sectionsFor.ts` (not `SUBPROCESS`). Then add the "Collaboration" section itself to `StepPage.tsx`'s trailing column, after "Step form fields", per the `studio-step-page` delta:
  - Give each field (Comment, Attachments) a Segmented Control offering Default/On/Off.
  - Add a small caption under the control naming the currently-resolved default value while Default stays pressed (e.g. "Currently: on").
  - Style via compiled StyleX, matching this file's existing declarations and the Segmented Control's, with no hand-written CSS or inline styles.
- [ ] 5.3 Add the i18n catalog entries for two checkbox labels ("Comment", "Attachments") and three Segmented Control labels ("Default", "On", "Off"). Also add the "Currently: {value}" caption entry.
- [ ] 5.4 Run `/impeccable critique` and `/impeccable audit` against the Steps tab. Then run the mechanical design detector (`node .claude/skills/impeccable/scripts/detect.mjs --json <changed ProcessHeaderBar/StepPage/sectionsFor files>`). Then run a browser check with `playwright-cli`. Cover setting the process-wide default and overriding a step. Also cover clearing a step's override back to Default and seeing it track a later default change. Finally, confirm a subprocess step shows no Collaboration section.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, then `bun run build`, then the full `bun test` with `DATABASE_URL` set. Report what each command printed, including the skip count, rather than only a pass/fail summary.
- [ ] 6.2 Run the antislop prose gate over the pushed range (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`). Resolve any rise in finding count across the Markdown this change touches: `proposal.md`, `design.md`, `tasks.md`, the six spec deltas, and `docs/authoring-guide.md`.
- [ ] 6.3 Run the whitespace/CRLF gate over the pushed range (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`) and fix any violation.
- [ ] 6.4 Confirm you performed and recorded the browser checks from tasks 4.4 and 5.4. This project's verification gate treats a UI change's browser check as mandatory, not optional, alongside the automated suites.
