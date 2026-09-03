## Why

Three failures sit on the studio publish path. A browser check against the
running build found all three.

<!-- antislop: allow synonym-rotation -->
<!-- "edit screen" is the fixed term for this screen (ui-glossary.md:45). -->
**Publish ignores the publish permission.** The `ROUTE_ROLE` map admits
`system:developer` and `system:author` to the edit screen. It sits in
`packages/web/src/areas/studio/routing.ts`. Neither role implies
`system:publish`. A comment at `api/client.ts:84` already records that.
The `ProcessHeaderBar` menu renders Publish for every actor who reaches
the screen. The `useDraftToolbarActions` hook runs no permission check.

**The refusal is invisible.** Publishing as the seeded `demo-developer`
account produced `PUT /drafts/:id` 200, then `POST /drafts/:id/publish` 403.
The screen looked identical afterwards. One console line was the whole
report. A developer learns nothing, and repeats the click.

**A native `confirm()` guards the least reversible action in the product.**
`DraftToolbar.tsx:118` gates publish. `DraftToolbar.tsx:144` gates discard.
A publish mints a version that can never change. The browser's own dialog
names neither the version nor that rule, and it bypasses the design language.

The three compound. An actor who may not publish gets a confirm prompt, a
silent refusal, and no reason.

## What Changes

- `GET /drafts/:processId` carries one added field, `canPublish`. The engine
  computes it from `can(actor, "publish", processId, db)`. This copies the
  `canPlanMigration` field the same handler already returns.
- The studio reads `canPublish` and disables Publish when it reads false. The
  disabled control states why it is unavailable, in the menu, as text.
- A failed save, discard or publish renders in an announced alert region.
  Today the message renders as one more inline item in a wrapping header row.
- The edit screen's four other bare failure paragraphs take the same banner
  shape. The screen then reports every failure one way.
  - the save conflict, `ProcessHeaderBar.tsx:294`
  - the missing form step, `EditScreen.tsx:457`
  - the absent draft, `EditScreen.tsx:659`
  - the dock's failed diff load, `EditorDock.tsx:153`
- Publish confirms in a modal `<dialog>`, not `confirm()`. The dialog names
  the process, the draft revision, and the version the publish mints. It
  also states that a published version never changes. When the draft carries
  unsaved edits, that one dialog covers the save too, and the second prompt
  goes.
- Discard confirms in the same dialog shape. It states that the published
  versions stay and only the draft goes.
- Both dialogs reuse the `<dialog className="studio-dialog">` pattern
  `ProcessesScreen.tsx` already ships. No new dialog component, and no new
  CSS beyond what `app.css:798-840` already defines.
- The header returns a fragment, so the failure region leaves the flex row as
  a sibling block. That needs no new rule. One existing selector changes: the
  `button[role="menuitem"]:disabled` rule at `app.css:2407` takes the
  `aria-disabled` form beside it. That adds no rule and no declaration.

## Scope boundary

Seven further `confirm()` sites in the studio area stay as they are, in this
change: `root.tsx:66`, `EditScreen.tsx:212`, `ProcessesScreen.tsx:310`,
`TemplatesScreen.tsx:85`, and `FieldCatalogPanel.tsx:64`, `:173`, `:566`.
Two of them hardcode English rather than reading the catalog:
`ProcessesScreen.tsx:310` and `TemplatesScreen.tsx:85`. `packages/web` holds
14 `confirm()` sites in all; the other seven sit in `areas/admin/`.

Reversibility is not the reason. Two of the six discard server state.
`ProcessesScreen.tsx:310` discards a draft, and `TemplatesScreen.tsx:85`
discards a template. The studio carries no undo. The reason is capability
ownership and effort.

`root.tsx:66` is the unsaved-navigation prompt. `studio-app` states the
`confirm()`/`t()` pattern for it as a requirement. Converting it means
rewriting that requirement and every scenario under it. The other six belong
to `studio-form-editor` and `studio-app`. Each carries its own facts, its own
dialog copy and its own catalog keys.

This change fixes the two prompts on the publish path, which is the path
`studio-publish` owns. It leaves a mechanical marker: a source test asserts
`DraftToolbar.tsx` calls no `confirm()`.

**Follow-up: the seven remaining studio prompts.** A later change converts
them to the dialog this one establishes. It also moves the two hardcoded
English strings into the catalog. This proposal does not open it.

**Follow-up: the failure shape everywhere else.** `packages/web/src` renders 27
failure states with no alert role. This change fixes five, all in the edit
screen's own chrome, and narrows the `spa-error-reporting` requirement to match.
The remaining 22 sit in the app, admin and reporting areas. They also sit on the
studio's other screens, and in the panels the edit screen itself mounts. A later
change sweeps them and widens the requirement.

The header also reads "Unsaved changes" after a successful `PUT` that
answered 200. That is a dirty-state failure in `EditorArea`, not a publish
failure. It has its own cause, its own file, and its own investigation. It is
out of scope here, and it needs its own change. Design.md records what the
interaction costs meanwhile.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `process-drafts`: `GET /drafts/:processId` reports `canPublish`. That
  handler's response shape belongs to this capability. The precedent is
  exact: `canPlanMigration` sits there, even though
  `studio-migration-planning` governs the permission behind it.
- `studio-publish`: what the studio offers when the actor may not publish,
  and what the publish dialog states. The permission is this capability's
  subject, so the affordance that reads it belongs here too.
- `studio-app`: the sentence naming `confirm()` as the toolbar's own pattern
  no longer holds for Publish and Discard. The navigation prompt keeps it.
- `spa-error-reporting`: a reported failure must be perceivable and
  announced. The existing requirement asks a screen to report a failed
  mutation. It does not ask that the report be findable. The added
  requirement binds the edit screen alone, because that is the screen this
  change repairs. The follow-up above widens it.

## Impact

- `src/http/studio-routes.ts`: `handleGetDraft` gains one `can` call and one
  response field.
- `packages/web/src/areas/studio/api/types.ts`: `DraftRecord.canPublish`.
- `packages/web/src/areas/studio/panels/DraftToolbar.tsx`: two `confirm()`
  calls go; the hook exposes pending dialog state instead.
- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`: the unavailable
  Publish item, its reason, the two dialogs, and the alert region. The
  component returns a fragment, and the conflict paragraph joins the banner.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: the missing-form-step
  and absent-draft paragraphs take the banner shape.
- `packages/web/src/areas/studio/dock/EditorDock.tsx`: the failed diff load
  takes it too.
- `packages/web/src/areas/studio/screens/draftToolbarState.ts`: two pure
  resolvers, tested there.
- `packages/web/src/i18n/catalogs/studio.ts`: new keys, in `en` alone. That
  catalog carries English only. `i18n-catalog-parity.test.ts` names four
  areas, and the studio is not one of them.
- `packages/web/src/areas/studio/app.css`: the alert region reuses
  `.studio-error-banner`. The dialogs reuse `.studio-dialog`. One selector
  list grows: the dimming rule at `:2407` takes
  `button[role="menuitem"][aria-disabled="true"]` beside its `:disabled`
  form. One selector changes, at `:2407`, and one comment, at
  `app.css:123-127`. No new rule and no new declaration. The comment changes
  because it names `studio-error` as an edit-screen child that no longer
  renders there.
- `docs/browser-checks.md`: the publish path's manual check.
- No change to `src/schema/`, the definition contract, or any engine
  invariant. The server-side publish gate is already correct and stays.
