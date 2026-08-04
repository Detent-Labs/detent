## Why

The studio area's migration-plan screen is one JSON textarea over
`MigrationSpec`. An author writes `stepMap`, `fieldMap`, `transforms`,
`onUnmappable` and `unmappableStep` by hand, as raw ids. Every id is an
opaque UUID with a type prefix. Neither catalog is on screen. The author
reads both versions somewhere else and copies ids across. A typo appears
only when `PUT /migration-plans/...` answers 409.

Stage 11 shipped that textarea on purpose. No field-by-field form existed
to extend, and the server owns validation. Both reasons have expired.
Stage 27a built the first generated form in the studio area. Both
versions' bodies are already fetchable through `getVersionBody`. This is
ROADMAP stage 27c.

## What Changes

- Add a field-mapping form to the migration-plan screen. It reads both
  versions' bodies through the existing `getVersionBody` call. It offers
  each catalog as a picker, labelled by `key` and `label` rather than by
  raw id.
- Cover all five `MigrationSpec` keys: a step map, a field map, a
  transforms list, and the unmappable policy with its step.
- Show what the browser can see, before the server does. Three cases: a
  non-injective `fieldMap`, a `fieldMap` pair whose declared types
  disagree, and a `stepMap` or `unmappableStep` value naming the reserved
  cancel-sink step. The server keeps every check it has today. The form
  adds no rule of its own.
- Keep the JSON textarea as the escape hatch, reached by a Form/JSON
  toggle. Each side fills the other from the plan it currently holds.
- Keep the orphan-key dry run as it is, below both sides of the toggle.
- Change nothing in `src/`. No route, no schema, no engine code. The form
  produces the same `MigrationSpec` object the textarea produces today.

## Capabilities

### New Capabilities
- `studio-migration-plan-form`: the field-mapping form over the two
  versions' catalogs, plus its inline errors. It also covers the Form/JSON
  toggle that keeps the raw-JSON path reachable.

### Modified Capabilities

None. `studio-migration-planning` describes the HTTP routes and their error
mapping. This change touches neither.

## Impact

- `packages/web/src/areas/studio/screens/MigrationPlanScreen.tsx`: fetches
  both version bodies and holds the plan as one state. It hosts the
  Form/JSON toggle.
- `packages/web/src/areas/studio/screens/migrationPlanLogic.ts`: gains the
  catalog reader, the plan-to-rows and rows-to-plan conversion, and the
  client-side checks. The existing `parseSpecText` and `formatSpecText`
  stay unchanged.
- `packages/web/src/areas/studio/panels/MigrationSpecEditor.tsx`: new. The
  form itself, beside the existing `SubprocessSpecEditor.tsx`.
- `packages/web/src/areas/studio/catalog.ts`: UI strings for the form, the
  toggle and the inline errors.
- `packages/web/src/areas/studio/app.css`: styles for the mapping rows.
- `packages/web/test/studio-migrationPlanLogic.test.ts`: covers the
  conversion in both directions, the round trip, and each client-side
  check.
- `docs/current-state.md`: its migration-plan paragraph states the reason
  for a textarea-only screen. That reason no longer holds.
- `ROADMAP.md`: stage 27c moves to DONE.
