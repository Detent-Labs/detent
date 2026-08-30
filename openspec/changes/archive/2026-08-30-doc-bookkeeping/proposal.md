## Why

Eight capability changes landed and archived between 2026-08-27 and
2026-08-30. None of them gained a stage in `ROADMAP.md`. That is exactly
the "Stale roadmap status" defect class `CLAUDE.md` names as having no
gate.

Two of those eight also left `docs/current-state.md` silent about the
subsystems they built. Separately, `docs/decisions.md` still claims two
things about the shipped `instance-query-data-source` design. The tree
already contradicts both claims.

`tmp/offene-items.md` item 21 tracks all four gaps as one item. Fixing
them out of order would let the next reader plan against a still-wrong
roadmap.

## What Changes

- `ROADMAP.md`: append eight `## Done` table rows, numbered 46-53, one
  row per archived change. The table's lowest unused number is 46, since
  40, 43 and 44 stay reserved for open work. The eight rows
  cover `instance-audit-log-chain`, `instance-query-core`,
  `redactable-field-flag`, `instance-audit-log-view`,
  `instance-data-tables`, `instance-query-data-source`,
  `instance-transition-action` and `studio-play-draft-instance`.
- `docs/current-state.md`: add two subsystem sections the file is
  missing, the report builder
  (`instance-data-tables`/`reporting-data-tables`) and draft test
  instances (`draft-test-instances`). Match the style of the file's
  existing per-subsystem sections.
- `docs/decisions.md`: correct two stale claims under the "Aggregated
  data source" entry's "Open, deliberately" list. It says
  `instance.query` has no hand-written config form. One exists at
  `packages/web/src/areas/studio/panels/shared/InstanceQueryForm.tsx`. It
  says a step-filter-excluded source instance still needs `heldValues`
  treatment. The engine ships it at
  `src/engine/instance-query-source.ts:145-153`.
- `tmp/offene-items.md`: advance item 21's status cell through the
  OpenSpec cycle as this change progresses. The file's own convention
  requires this.

No code, no test, and no schema change. Nothing here alters engine,
HTTP, or UI behavior. Only the documents that describe already-shipped
behavior change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `docs/current-state.md`, `docs/decisions.md` and `ROADMAP.md`
describe existing, already-specified behavior. No capability's
requirements change. `CLAUDE.md` names "Stale roadmap status" as a
defect class with a deliberately absent gate. It states: "no reliable
mapping runs from an archived change name to a `ROADMAP.md` stage line."
This change adds no such gate either. This change sets `skip_specs: true`.

## Impact

- `ROADMAP.md`, `docs/current-state.md`, `docs/decisions.md`,
  `tmp/offene-items.md`. Four files, documentation only.
- No `src/`, `packages/`, `test/`, or `openspec/specs/` file changes.
