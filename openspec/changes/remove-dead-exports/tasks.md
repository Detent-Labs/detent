# Tasks

Each task proves its deletion two ways. `bun run typecheck` passes, and
`git grep -w <symbol> -- src packages test scripts e2e` shows no reader
outside the symbol's own file.

## 1. Engine, tenancy, auth and handlers

- [ ] 1.1 Drop `export` from `groupMembersStrategyDef` and `actorFromFieldStrategyDef` (`src/engine/assignment-strategies.ts`) and from `staticAssignmentStrategyDef` (`src/engine/registry.ts`); verify with the typecheck and the grep.
- [ ] 1.2 Drop `export` from `dataListColumn` (`src/engine/host.ts`); verify with the typecheck and the grep.
- [ ] 1.3 In `src/engine/instance-drafts.ts`, delete the local `MAX_DRAFT_ENVELOPE_BYTES` and import the one from `drafts.ts`; verify that the grep finds one declaration.
- [ ] 1.4 Drop `export` from `controlPlaneUrl`, `TenantConnections` and `ProvisionOptions` in `src/tenancy`; verify with the typecheck and the grep.
- [ ] 1.5 Delete `InstanceTransitionConfig` (`src/handlers/instance-transition.ts`) and drop `export` from `referencingPublishedProcesses` (`src/auth/groups.ts`); verify with the typecheck and the grep.

## 2. Studio area

- [ ] 2.1 Delete `issueCountForEntityType` and `stepIssueCount` from `draft/panel-rail.ts`, with their `describe` blocks in `studio-edit-panel-rail.test.ts`; verify with the web typecheck.
- [ ] 2.2 Correct the comments on `issueCountForSource` and `issueCountForEntityId` in `panel-rail.ts`, as `design.md` states; verify that the grep finds neither deleted name in `packages/web/src`.
- [ ] 2.3 In `studio-sectionIssues.test.ts`, correct the file header. The masthead-total test then asserts the section map alone. Verify that the grep finds `stepIssueCount` nowhere.
- [ ] 2.4 Drop `export` from `flattenFields` (`panels/shared/useTargetProcessCatalog.ts`) and from its mention in the `fieldsToRefs` comment if needed; verify with the web typecheck.

## 3. Reporting, admin, app and shell areas

- [ ] 3.1 Delete `deleteReport` and `executeReport` from `reporting/api/client.ts` and `fieldLabel` from `reporting/screens/reportsLogic.ts`; verify with the web typecheck.
- [ ] 3.2 Drop `export` from `InstanceKind`, `DataListValue`, `OutboxListParams`, `MigrationBucket`, `InboxGroup`, `ShellLocation`, `LocaleSyncDeps` and `AccountName`; verify with the web typecheck and the grep.

## 4. form-ui

- [ ] 4.1 Delete the `style` prop from `PathButtons` and its test case in `path-buttons.test.tsx`; verify with the form-ui typecheck.
- [ ] 4.2 Delete the `baseLocale` parameter from `issueMessage` and `issueCountText`, with the test cases that passed one. Correct their doc comments. Verify with the form-ui typecheck.
- [ ] 4.3 Drop `export` from `OPTION_ATTRIBUTE_SEPARATOR` (`FieldForm.tsx`) and `WireField` (`types.ts`); run `bun install` in the container, then verify with the web and form-ui typecheck.

## 5. Verification

- [ ] 5.1 Run `bun run lint`, `bun run typecheck` and `bun run build` in the devcontainer; verify that each exits 0.
- [ ] 5.2 Run the full suite through `sh scripts/test-gated.sh bun test` with `DATABASE_URL` set; verify that the gate accepts the run and no test fails.
- [ ] 5.3 Lower `scripts/gates/pass-floor.txt` by the number of deleted tests if the count drops below it; verify that the gate accepts the run.
- [ ] 5.4 Run the prose and whitespace gates over the pushed range on the host; verify that both exit 0.
- [ ] 5.5 On the production build, open a Task screen with manual paths. Open the studio step page of a step with an issue. Verify that the path buttons and the masthead issues render as before.

## Workflow follow-up

- Delete this change's entry from the 2026-10-10 audit index in `docs/decisions.md` in the archive commit.
- Verify, sync the form-ui delta, archive, push, open the PR and merge on green CI.
