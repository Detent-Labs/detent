## 1. The definition contract

- [x] 1.1 Add `viewTab`, `view.tabs`, and `tab` on `viewField` and `viewNote`
- [x] 1.2 Add the `view` superRefine holding rules 1 to 5; see design.md
- [x] 1.3 Call the base-locale check on each tab `label` in `processBody`
- [x] 1.4 Add one test per rule, each rejecting a violating body
- [x] 1.5 Add a test that an untabbed body parses with an unchanged `definitionHash`
- [x] 1.6 Verify group 1: `bun run typecheck` and the full `bun test`, both green

## 2. Runtime resolution

- [ ] 2.1 Add `tab` to `ResolvedViewField` and `ResolvedViewNote` in `src/runtime/api.ts`
- [ ] 2.2 Add `tabs` to `InstanceView`, empty for an untabbed view
- [ ] 2.3 Fill both from `resolveFields` and its caller, leaving each label unresolved
- [ ] 2.4 Leave `validateSubmissionData` alone; a tab reaches no submission check
- [ ] 2.5 Add tests for the six scenarios the `runtime-api` delta spec states
- [ ] 2.6 Verify group 2 with the full `bun test`, naming those six tests green

## 3. The form-ui renderer

- [ ] 3.1 Add `tab` and a `ResolvedViewTab` shape to `packages/form-ui/src/types.ts`
- [ ] 3.2 Add `drawnTabs` and `firstTabWithIssue` as pure functions, exported
- [ ] 3.3 Add `resolveTabsLocale`, the sibling of `resolveFieldsLocale`, exported
- [ ] 3.4 Add the `tabs`, `activeTab` and `onTabChange` props to `FieldForm`
- [ ] 3.5 Draw the tablist with the process row's own grammar; see design.md
- [ ] 3.6 Draw one panel, holding the open tab's root entries at the form's `columns`
- [ ] 3.7 Derive the open tab from `activeTab` and `drawnTabs`, storing nothing
- [ ] 3.8 Wire the keyboard pattern: arrows, `Home`, `End`, `Enter`, `Space`
- [ ] 3.9 Mark each tab holding an issue with a `stamp-refusal` count
- [ ] 3.10 Add tests for every scenario the `form-ui` delta spec states
- [ ] 3.11 Verify group 3 with the full `bun test` and `bun run typecheck`

## 4. The two participant-facing consumers

- [ ] 4.1 Hold the open tab in `TaskScreen.tsx`; switch it via `firstTabWithIssue`
- [ ] 4.2 Hold the open tab in `PlayerScreen.tsx`, the same way
- [ ] 4.3 Call `resolveTabsLocale` at both, beside `resolveFieldsLocale`
- [ ] 4.4 Verify group 4 with `bun run typecheck` and `bun run build`

## 5. The studio form editor

- [ ] 5.1 Add `tabs` and `tab` to the draft view types and `view-layout.ts`
- [ ] 5.2 Carry `tab` and the draft's tabs through `previewViewEntries`
- [ ] 5.3 Add pure helpers for adding, removing and reordering a tab
- [ ] 5.4 Cover those helpers with `bun:test`: the sweep, the merge, and key stability
- [ ] 5.5 Add the tab strip above the canvas: add, rename, reorder, remove
- [ ] 5.6 Never rewrite a tab's key after minting; renaming writes the label alone
- [ ] 5.7 Filter the canvas to the selected tab, keeping every existing behavior
- [ ] 5.8 Add the tab picker to the field strip and the note strip
- [ ] 5.9 Keep group and tab consistent when an entry moves in or out of a group
- [ ] 5.10 Hold the preview's open tab in `FormPreview.tsx`; drive it both ways
- [ ] 5.11 Call `resolveTabsLocale` in `FormPreview.tsx` too
- [ ] 5.12 Add the new studio catalog strings for every locale the catalog carries
- [ ] 5.13 Verify group 5 with the full `bun test` and `bun run build`

## 6. Documentation and examples

- [ ] 6.1 Add `tabs` and `tab` to `docs/openapi.yaml`, `tabs` in `required`
- [ ] 6.2 Teach the tab rules in `docs/authoring-guide.md`
- [ ] 6.3 Record the rule delta in the two files under `.claude/rules/`
- [ ] 6.4 Strike the tab panel from the parked display elements in `docs/decisions.md`
- [ ] 6.5 Record the tabbed-form browser check in `docs/browser-checks.md`
- [ ] 6.6 Add one tabbed form to an existing definition under `examples/`
- [ ] 6.7 Verify group 6: the prose gate reports no rise on the changed Markdown

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`, then `bun run build`, and report both
- [ ] 7.2 Run the full `bun test` with `DATABASE_URL` set; report passes and skips
- [ ] 7.3 Run the prose and whitespace gates over the pushed range
- [ ] 7.4 Run the Impeccable detector over every changed file under `packages/`
- [ ] 7.5 Check the tabbed form in a real browser: participant, Player, editor
- [ ] 7.6 Run `/impeccable critique` and `/impeccable audit` on the form editor route
