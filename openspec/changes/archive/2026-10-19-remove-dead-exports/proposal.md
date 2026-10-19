# Proposal

## Why

The audit of 2026-10-10 found exports that nothing imports. It also found
functions, a prop and a parameter that only a test uses. Each one is code a
reader must check and keep current, and it buys nothing. The refactors that
could have used them have now merged, so this change deletes them.

## What Changes

- Drop `export` from symbols that have no importer and a reader in their own
  file. In the engine: `groupMembersStrategyDef`, `actorFromFieldStrategyDef`,
  `staticAssignmentStrategyDef` and `dataListColumn`. In tenancy:
  `controlPlaneUrl`, `TenantConnections` and `ProvisionOptions`. In auth:
  `referencingPublishedProcesses`.
- Delete `InstanceTransitionConfig`, a type nothing reads.
- `src/engine/instance-drafts.ts` imports `MAX_DRAFT_ENVELOPE_BYTES` from
  `drafts.ts` and stops declaring a second constant of that name.
- Delete `stepIssueCount` and `issueCountForEntityType` from the studio's
  `panel-rail.ts`, with their tests. Correct three comments that describe them
  wrongly.
- Drop `export` from `flattenFields` in `useTargetProcessCatalog.ts`.
- Delete `deleteReport`, `executeReport` and `fieldLabel` from the reporting
  area. Nothing calls them.
- Delete the `style` prop from `PathButtons`, and the `baseLocale` parameter
  from `issueMessage` and `issueCountText` in `form-ui`.
- Drop `export` from these types and constants: `OPTION_ATTRIBUTE_SEPARATOR`,
  `WireField`, `InstanceKind`, `DataListValue`, `InboxGroup`,
  `ShellLocation`, `LocaleSyncDeps`, `OutboxListParams`, `MigrationBucket`
  and `AccountName`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `form-ui`: `PathButtons` no longer takes a style prop for its wrapper. The
  wrapper keeps its own layout, and the button keeps its literal control
  class.

## Impact

- Code: `src/engine`, `src/tenancy`, `src/auth`, `src/handlers`,
  `packages/form-ui` and four areas of `packages/web`.
- Tests: the tests of the deleted code go with it. The pass floor in
  `scripts/gates/pass-floor.txt` drops if the suite falls below it.
- Docs: the archive commit deletes this change's entry from the audit index
  in `docs/decisions.md`.
- No HTTP route, schema or definition contract changes. The engine's exports
  map names none of these symbols except `staticAssignmentStrategyDef`, which
  sits in `./engine/registry`, and nothing imports it from there.
