<!-- antislop: allow-file passive-voice -->

## 1. Seed the new-process draft body

- [x] 1.1 In `packages/web/src/areas/studio/screens/processListLogic.ts`,
  change `seededDraftInput`'s no-seed branch to return
  `body: { baseLocale: "en" }` in place of `{}`.
- [x] 1.2 Change that function's doc comment to match. The no-seed body is no
  longer empty. The reason is that publish requires `baseLocale`.
- [x] 1.3 Change the existing test at
  `packages/web/test/studio-processListLogic.test.ts:109`. It asserts
  `{ body: {}, layout: {}, revision: 0 }` and its name says "empty draft".
  Both must name the new body. Run it against the unchanged source first and
  confirm it fails, so the assertion proves the change.
- [x] 1.4 Add a test that the no-seed body parses through
  `authoredProcessBody.safeParse` with no reported error naming `baseLocale`.
- [x] 1.5 Confirm the seeded-from-published test still passes untouched. That
  branch returns the stripped published body with its own `baseLocale` and its
  `baseVersion`.

## 2. Add the base-locale control to the process header

- [x] 2.1 Invoke `/frontend-design:frontend-design` before touching
  `EditScreen.tsx`. CLAUDE.md routes UI work in `packages/web` through the
  design skills first. The control sits in an existing `fieldset` beside the
  `key` input. The direction to confirm is placement and labelling, not a new
  visual language.
- [x] 2.2 In `ProcessHeader`
  (`packages/web/src/areas/studio/screens/EditScreen.tsx`), add a labelled
  text input bound to `draft.baseLocale ?? ""`. It writes through
  `mutate((d) => { d.baseLocale = e.target.value; })`.
- [x] 2.3 Place the control beside `key` and above `label`, so the
  declaration precedes the first localized value it governs.
- [x] 2.4 Add no client-side validation. Live validation already reports a
  malformed code. `resolveLoc` returns `{process, process}` for a
  `["baseLocale"]` path, so the `IssueList` already in that fieldset renders
  it.
- [x] 2.5 If the neighbouring `key` and `label` inputs draw their visible
  labels from `packages/web/src/areas/studio/catalog.ts`, add this control's
  label there too. Match what those two do rather than starting a second
  convention. Result: they carry literal text, not a catalog key, so this
  control does too. No catalog entry added.

## 3. Move the edited content locale with the declared base locale

- [x] 3.1 In the same `onChange`, call `resolveAddLocaleAttempt` (already
  exported from `packages/web/src/areas/studio/draft/localized-text.ts`) on
  the typed value. On `ok`, call `setContentLocale` with it. On not-`ok`,
  leave the content locale alone. Superseded by 4.1: this branch moved out of
  the component and into `resolveBaseLocaleChange`.
- [x] 3.2 Read `setContentLocale` from `useDraft()`, which `ProcessHeader`
  already calls for `draft` and `mutate`.
- [x] 3.3 Create `packages/web/test/studio-localizedText.test.ts` and test the
  gate there: `resolveAddLocaleAttempt("de")` returns `ok` with `de`, and
  `resolveAddLocaleAttempt("d")` does not. No test covers that function today,
  even though its doc comment says the repo extracted it to be testable. Test
  only the gate. Do not widen the change into covering the rest of
  `localized-text.ts`.

## 4. Extract the decision from the component

Added after `/openspec-verify-change` reported the gap. The composition sat
inline in `ProcessHeader`, so a wiring regression passed the whole suite.
`draftToolbarState.ts` exists for exactly that error.

- [x] 4.1 Create `packages/web/src/areas/studio/screens/processHeaderLogic.ts`
  with `resolveBaseLocaleChange(typed, currentContentLocale)`. Return both
  `baseLocale` and `contentLocale`, so the caller applies two unconditional
  writes and owns no branch.
- [x] 4.2 Rewrite `ProcessHeader`'s handler to call it and apply both writes.
  Read `contentLocale` from `useDraft()` alongside `setContentLocale`.
- [x] 4.3 Create `packages/web/test/studio-processHeaderLogic.test.ts` driving
  the resolver through the sequence the header produces. End each test at the
  entry a later keystroke writes (`seedLocalizedText`,
  `mergeLocalizedTextEntry`), not at the resolver's return value.
- [x] 4.4 Confirm the test discriminates. Run its assertions against a
  deliberately broken resolver that leaves the content locale behind. Do this
  on a copy outside the working tree (CLAUDE.md), never by mutating the tree.

## 5. Verify

- [x] 5.1 Run `bun run typecheck` inside the devcontainer. See the
  `devcontainer-exec` skill.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set, inside the
  devcontainer. Read the verdict off named failures and the skip count, never
  off a pass count alone (CLAUDE.md).
- [x] 5.3 Drive the real studio. Create a new process, give it a `key`, a
  `label` and one step, save, then publish. Publish must succeed without the
  JSON surface.
- [x] 5.4 In a fresh process, change the base locale to `de` before typing
  anything else. Add a step. Its label must seed under `de`, and live
  validation must report no missing base-locale entry for it.
- [x] 5.5 On a process whose labels carry only `en` entries, change the base
  locale to `de`. Live validation must then report the missing `de` entries.
- [x] 5.6 Run `openspec validate studio-base-locale-control --strict`.
