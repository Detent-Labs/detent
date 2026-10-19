# Proposal

## Why

The 2026-10-10 audit found three low-severity defects on studio screens
outside the process surface (E1-8, E1-9, E1-10). Each one shows the author
or curator a state that is not true, or loses work with no warning.

- **E1-8.** In the Player and on the Tools screen, a late answer overwrites
  a newer choice. An author opens instance A, then instance B. A's record
  arrives last, so the record pane shows A's history beside B's form.
- **E1-9.** The migration-plan form loses a row with no warning. Two
  `fieldMap` rows with source `fld_amount` save as one key, and the second
  row wins.
- **E1-10.** "Create" on the templates screen replaces an existing template
  with the same key and does not ask first. Templates have no versions, so
  the old body is gone.

## What Changes

- The Player drops a record page whose instance is no longer the open one.
  "Load more" drops a page when the record reloaded after the request.
- The Tools screen drops a late version list or field catalog. Only the
  answer to the current choice writes.
- The migration-plan form shows an error at two rows with one source, in
  `fieldMap` and in `stepMap`. It shows an error at two `transforms` rows
  with one target.
- The templates screen asks for a confirmation before a create replaces an
  existing template. A cancel sends nothing.

No route, no schema and no server rule changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-player`: the record shows only the open instance's history.
- `studio-tools`: the scratchpad checks only against the current choice.
- `studio-migration-plan-form`: the browser check reports two rows that the
  plan cannot both hold.
- `studio-app`: creating a template over an existing key asks first.

## Impact

- `packages/web/src/areas/studio/screens/PlayerScreen.tsx`
- `packages/web/src/areas/studio/screens/ToolsScreen.tsx`
- `packages/web/src/areas/studio/screens/migrationPlanLogic.ts`
- `packages/web/src/areas/studio/panels/MigrationSpecEditor.tsx`
- `packages/web/src/areas/studio/screens/TemplatesScreen.tsx`
- `packages/web/test/studio-migrationPlanLogic.test.ts`
- `docs/browser-checks.md`
- The change reuses the shared `shell/latestGate.ts` helper as it stands.
