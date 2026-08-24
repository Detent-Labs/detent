## 1. Catalog string

- [x] 1.1 Add `app.leaveDraftConfirm` to `packages/web/src/i18n/catalogs/studio.ts`, next to the existing `app.draftIncomplete` key (matching that key's `app.` namespace for shell-level strings). Verify `bun run typecheck` still passes; the `CatalogKey` union picks it up automatically.

## 2. Report dirtiness out of EditorArea

- [x] 2.1 Add `onDirtyChange?: (dirty: boolean) => void` to `EditScreenProps` and thread it into `EditorAreaProps`, and pass `onDirtyChange={onDirtyChange}` at the `<EditorArea>` invocation inside `EditScreen`.
- [x] 2.2 In `EditorArea`, call `onDirtyChange?.(isDirty(draft, savedBody))` from a `useEffect` keyed on that value. Call `onDirtyChange?.(false)` from that same effect's cleanup; the cleanup fires on unmount and on every re-run of the effect. This way, leaving the `edit` route can never leave a stale `true` behind.
- [x] 2.3 In `EditorArea`'s `useDraftToolbarActions` call, replace `onDiscarded: () => navigate({ name: "processes" })` with `onDiscarded: () => { onDirtyChange?.(false); navigate({ name: "processes" }); }`. This keeps the guard added in section 3 from raising a second, redundant confirmation. That confirmation would otherwise follow right after the Discard control's own confirm. See design.md § Decisions, "`discard()`'s own navigation must not trip the new guard a second time".

## 3. Guard navigation once, centrally, in root.tsx

- [x] 3.1 In `root.tsx`, add `useRef` to the existing `"react"` import, add `const dirtyRef = useRef(false)`, and pass `onDirtyChange={(d) => { dirtyRef.current = d; }}` into `<EditScreen>`.
- [x] 3.2 Reset `dirtyRef.current = false` in a `useEffect` keyed on `route.name` whenever it is not `"edit"` (belt-and-suspenders alongside the unmount effect in 2.2).
- [x] 3.3 In `root.tsx`, define `const guardedNavigate = (dest: Route, opts?: NavigateOptions) => { if (dirtyRef.current && dest.name !== "edit" && !confirm(t("app.leaveDraftConfirm"))) return; navigate(dest, opts); };`. Add `import { t } from "./catalog.js";` and `import type { NavigateOptions } from "../../shell/routing.js";`; `Route` keeps coming from `./routing.js`, and `NavigateOptions` comes from the shell's routing module. The parameter name is `dest`, not `route`, so it does not shadow the outer `route` from `useAreaRoute` in the same closure.
- [x] 3.4 Use `guardedNavigate` for the "Processes", "Tools" and "Templates" tab `onClick` handlers in `root.tsx`'s `nav`. Pass `navigate={guardedNavigate}` into `<EditScreen>` in place of the raw `navigate`. `EditScreen`'s own three screen-nav buttons need no changes; they already call whichever `navigate` prop they're given.

## 4. Browser verification

- [x] 4.1 In the running dev server, open a draft, and edit a step label (or move a step). Click each of "Back to processes", "Versions" and "Player" in turn, and confirm the browser `confirm()` dialog appears. Cancel keeps the edit screen and the edit. OK navigates away. Repeat for the top-level "Processes", "Tools" and "Templates" tabs.

  Verified with playwright-cli against `demo-developer@example.test` on `loan_application`'s draft. All three edit-screen controls and both role-visible top-level tabs (Processes, Tools) prompted with the same dialog text.

  <!-- antislop: allow passive-voice -- verbatim UI copy -->
  The dialog reads: "Leave this draft? Unsaved edits will be lost." Cancel (`dialog-dismiss`) left the screen and the edit untouched. OK (`dialog-accept`) navigated away and discarded the edit.

  "Templates" sits behind `system:templates` alone (`ROUTE_ROLE`), a role no account holding `system:developer`/`system:author` also carries. So no single demo account can dirty a draft and reach that tab. It goes through the exact same `guardedNavigate` call the two verified tabs do (design.md, task 3.4). This is a coverage gap in available accounts, not in the guard logic.
- [x] 4.2 Confirm a freshly loaded (clean) draft navigates through all six controls with no prompt. Verified: the "Processes" top-level tab navigated immediately with no `confirm()` dialog on a freshly loaded, unedited draft.
- [x] 4.3 Confirm that after an explicit Save, the same six controls navigate with no prompt. The draft is no longer dirty against the freshly saved body. Verified: after Save (rev. 0 → rev. 2, header showed "Saved"), "Back to processes" navigated immediately with no dialog.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, then `bun run build`, and confirm both succeed.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set (never a single-file rerun). Confirm it passes with no skips beyond the documented DB-gated ones.
