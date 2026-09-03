## 1. Confirm the diagnosis

- [x] 1.1 Seed `demo-developer`, open a draft, publish. Capture the 403
- [x] 1.2 Confirm the message reaches the DOM at `ProcessHeaderBar.tsx:292`
- [x] 1.3 Append any correction to design.md's own Diagnosis section

## 2. The engine reports the permission

- [x] 2.1 In `handleGetDraft`, compute `canPublish` from `can(actor, "publish", ...)`
- [x] 2.2 Fold it into the response beside `canPlanMigration`
- [x] 2.3 Add `canPublish` to `DraftRecord` in the studio's `api/types.ts`
- [x] 2.4 Extend the `DraftRecord` doc comment; it names the added fields

## 3. Catalog

`t()` takes a `CatalogKey`, so sections 4 to 8 need these keys first. The
consumers name them: the reason key (§4), the two dialogs' copy (§5), and the
unavailable-Publish reason line (§7).

- [x] 3.1 Add the new keys to the `en` studio catalog
- [x] 3.2 The studio catalog stays English-only: no `de` map, no locale argument

## 4. Pure resolvers and their tests

- [x] 4.1 Add `publishAvailability(record)` to `screens/draftToolbarState.ts`
- [x] 4.2 Add `nextVersionLabel(base)` to the same file. A null base returns `v1`
- [x] 4.3 Extend the existing `packages/web/test/studio-draftToolbarState.test.ts`
- [x] 4.4 Leave its `isDirty` block and its header comment where they are
- [x] 4.5 The false case and the null case are the violating inputs

## 5. The dialogs

- [x] 5.1 Add `PublishConfirmDialog` beside `ProcessHeaderBar`, on the `studio-dialog` pattern
- [x] 5.2 It shows process, revision, next version, and the immutability note
- [x] 5.3 The unsaved-changes sentence renders only when the draft is dirty
- [x] 5.4 Add `DiscardConfirmDialog` in the same shape
- [x] 5.5 A refused request renders inside the open dialog

## 6. The toolbar hook

- [x] 6.1 Drop both `confirm()` calls from `DraftToolbar.tsx`
- [x] 6.2 The hook exposes pending dialog state and a resolver instead
- [x] 6.3 Confirming a dirty publish saves, then publishes, with one prompt
- [x] 6.4 `reload()` reports the re-read `canPublish` upward, outside `DraftSaveState`
- [x] 6.5 Rewrite the `publish` and `discard` doc comments
- [x] 6.6 Rewrite the file header comment at `DraftToolbar.tsx:51`, which names `confirm()`
- [x] 6.7 Correct the stale anchor comment at `EditScreen.tsx:209`
- [x] 6.8 Correct the stale anchor comment at `draft/field-usage.ts:135-137`
- [x] 6.9 Remove `draftToolbar.publishConfirmSave` and `draftToolbar.discardConfirm`
- [x] 6.10 Both lost their only caller at 6.1. No test catches an unused key

## 7. The unavailable Publish affordance

- [x] 7.1 Thread `canPublish` from the loaded record into `ProcessHeaderBar`
- [x] 7.2 Mark the Publish item `aria-disabled="true"` when it reads false
- [x] 7.3 Its click handler returns early whenever that flag reads true
- [x] 7.4 Extend the `app.css:2407` selector to the `aria-disabled` form
- [x] 7.5 Render the reason beneath it, in the menu label style
- [x] 7.6 Wrap the item and its reason in a `role="group"`
- [x] 7.7 Point `aria-describedby` from the item at that reason

## 8. The failure region

- [x] 8.1 `ProcessHeaderBar` returns a fragment: the header, then the failures
- [x] 8.2 Render the mutation failure as `studio-error-banner` with `role="alert"`
- [x] 8.3 The conflict paragraph joins that banner and keeps its Reload button
- [x] 8.4 Suppress the banner while a dialog is open; the dialog reports instead
- [x] 8.5 `EditScreen.tsx:457` takes the banner shape
- [x] 8.6 `EditScreen.tsx:659` takes the banner shape
- [x] 8.7 `EditorDock.tsx:153` takes the banner shape
- [x] 8.8 Restructure the `app.css:123-127` comment, not a name swap
- [x] 8.9 It names the banner's authored top margin, not a browser default

## 9. Rendering and regression guards

- [x] 9.1 New `packages/web/test/studio-processHeaderBar-publishGate.test.tsx`
- [x] 9.2 It takes the `findingFallback` test's `DraftContext.Provider` idiom
- [x] 9.3 It asserts `aria-disabled`, the reason text and `aria-describedby`
- [x] 9.4 It asserts the failure region's `role="alert"` and banner class
- [x] 9.5 New `packages/web/test/studio-no-confirm.test.ts`, in the boundaries idiom
- [x] 9.6 It names `DraftToolbar.tsx` and `ProcessHeaderBar.tsx` alone
- [x] 9.7 It matches the call `confirm(`, not the word, and strips comments first
- [x] 9.8 Extract `PublishMenuItem`; the closed menu hides the first three from a header render

## 10. Engine tests

- [x] 10.1 In `test/http-studio.test.ts`, add the five `canPublish` scenarios
- [x] 10.2 Confirm the publish route's own refusal tests still cover every caller

## 11. Documentation

- [x] 11.1 `docs/browser-checks.md`: the publish path, both roles
- [x] 11.2 `docs/current-state.md`: the draft response and the header bar
- [x] 11.3 `ROADMAP.md`: one row for this change and its four capabilities
- [x] 11.4 Open a follow-up for the seven remaining studio prompts
- [x] 11.5 Open a follow-up for the 22 failure renders in the other areas
- [x] 11.6 Open a follow-up for the stale dirty badge after a 200 `PUT`

## 12. Verification

- [x] 12.1 `bun run typecheck`, then `bun run build`
- [x] 12.2 Full `bun test` with `DATABASE_URL`, piped through `silent-green.sh`
- [x] 12.3 Prose and whitespace gates over the pushed range
- [x] 12.4 Browser check: the dialog's focus trap, its Escape key, its backdrop
- [x] 12.5 `/impeccable critique` and `/impeccable audit` on `EditScreen.tsx`
- [x] 12.6 Critique 15 to 21 of 40. Audit 11 of 20. Snapshot written this time

## 13. Two defects the impeccable critique found

<!-- antislop: allow synonym-rotation -->
<!-- "edit screen" is the fixed term for this screen (ui-glossary.md:45). -->
The critique scored the edit screen 21 of 40, up from 15. Two P1 findings sit
on what sections 5 to 8 built. Both belong here.

- [x] 13.1 Thread `canPublish` into `ChecksRail` as a required prop
- [x] 13.2 Split `checksRail.allClear` into a validation key and two publish keys
- [x] 13.3 The all-clear box names the permission when the report reads false
- [x] 13.4 Pass the report at both `EditScreen` mounts of the rail
- [x] 13.5 Pass it through `StepsPanel`, for the rail docked in the inspector
- [x] 13.6 Pass it through `PanelsScreen`; `EditorArea` mounts that screen too
- [x] 13.7 New `packages/web/test/studio-checksRail-publishVerdict.test.tsx`
- [x] 13.8 Its violating input is the old sentence rendering for a refused actor
- [x] 13.9 Add the rail requirement to the `studio-publish` delta
- [x] 13.10 Extract `useConfirmDialog`, shared by both dialogs
- [x] 13.11 Cancel takes `autoFocus` in both dialogs
- [x] 13.12 The hook re-focuses Cancel after `showModal()` reruns the focusing steps
- [x] 13.13 Its cleanup returns focus to `.studio-header-bar-menu-trigger`
- [x] 13.14 Hold that trigger in a ref, and pass the ref to both dialogs
- [x] 13.15 Extend `studio-processHeaderBar-publishGate.test.tsx` with four cases
- [x] 13.16 The violating input is `autofocus` on the destructive button
- [x] 13.17 Add the focus rules to the `studio-publish` dialog requirement
- [x] 13.18 Add the destructive-focus scenario to the `studio-app` delta
- [x] 13.19 `docs/browser-checks.md`: focus restoration, which needs a browser
- [x] 13.20 Record both fixes and the reasoning in design.md
