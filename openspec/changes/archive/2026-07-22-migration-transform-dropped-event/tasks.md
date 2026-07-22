## 1. Schema

- [x] 1.1 In `src/schema/definition.ts`, add `export const migrationTransformDroppedReason = z.enum(["expression-raised", "value-out-of-range"])` and `export type MigrationTransformDroppedReason = z.infer<typeof migrationTransformDroppedReason>`, placed near `timerUnarmedReason`.
- [x] 1.2 Add a new member to the `instanceEvent` discriminated union: `{ ...instanceEventEnvelope, kind: z.literal("migration.transform-dropped"), payload: z.object({ fieldId, reason: migrationTransformDroppedReason }).strict() }`, placed alongside the other no-outcome kinds (after `subprocess.outcome-unmatched`).
- [x] 1.3 Run `tsc --noEmit` to confirm the additive schema change compiles clean.

## 2. evalTransforms returns drops

- [x] 2.1 In `src/cel/eval.ts`, export `TransformDrop = { fieldId: FieldId; reason: MigrationTransformDroppedReason }` and change `evalTransforms`'s return type to `{ patch: Record<string, unknown>; drops: TransformDrop[] }`.
- [x] 2.2 Split the current single try/catch into two: the `evaluate()` call catches into `{ fieldId: fid, reason: "expression-raised" }`; the `coerceJson()` call (on evaluation success) catches into `{ fieldId: fid, reason: "value-out-of-range" }`.
- [x] 2.3 Updated `test/cel.test.ts`'s one direct `evalTransforms` call to destructure `{ patch, drops }` from the new return shape.

## 3. migration.ts wiring

- [x] 3.1 Changed `remapData`'s return type from `Instance["data"]` to `{ data: Instance["data"]; drops: TransformDrop[] }`; merges `evalTransforms`'s `patch` into `out` as before, passes `drops` through unchanged.
- [x] 3.2 In `migrateOne`, destructured `{ data, drops: transformDrops }` from `remapData(...)`.
- [x] 3.3 Built `transformDropEvents: InstanceEvent[]` from `transformDrops` after `at`/`nextSeq`, mirroring the `dropEvents` (timer.unarmed) construction, with `kind: "migration.transform-dropped"`, `payload: { fieldId: d.fieldId, reason: d.reason }`, `version: toVersion`.
- [x] 3.4 Passed `events: [...dropEvents, ...transformDropEvents]` to `planStepEntry`.

## 4. Tests

- [x] 4.1 Extended "6.7 a raising transform leaves its field unwritten" to assert a `migration.transform-dropped` event with reason `"expression-raised"` and payload `{ fieldId: "field_y", ... }`.
- [x] 4.2 New test "6.7 a transform yielding an out-of-range value leaves its field unwritten" — uses a plugin-typed (`dyn`) target field and the `9223372036854775807` literal; asserts field absent and a `"value-out-of-range"` event.
- [x] 4.3 Extended "6.7 data remapping..." to assert zero `migration.transform-dropped` events when every transform succeeds.
- [x] 4.4 New pure unit tests in `test/cel.test.ts`: `evalTransforms` reports `expression-raised` and `value-out-of-range` drops correctly (the existing "an integer-valued transform survives a round-trip" test already covers the empty-`drops`-on-success case).
- [x] 4.5 Ran the full suite inside the devcontainer: 447 pass, 0 fail (444 + 3 new tests), and `tsc --noEmit` clean.

## 5. Docs

- [x] 5.1 Updated CLAUDE.md's runtime-record paragraph ("Six kinds exist — `timer.fired` ... `migration.transform-dropped`...") describing the sixth kind, its no-outcome shape, and its target-version placement.
- [x] 5.2 Removed the "A `migration.transform-dropped` event kind" bullet from CLAUDE.md's "Decided, not yet built" section.
