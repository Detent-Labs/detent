## Why

`PONYTAIL-AUDIT.md`'s finding 12 has carried across two scans unchanged. It
names the largest literal duplication left in `src/engine`. Two handlers
create a seeded instance, and each writes the same five steps.

`src/handlers/process-start.ts:44-148` and `src/engine/subprocess.ts:54-164`
declare `parseInstance` and `loadInstance` byte for byte. Then each one
evaluates an input mapping. Each builds one `mapping.entry-dropped` event
per dropped entry. Each resolves the initial step's assignment before the
transaction opens. Each calls `createInstance` inside `withTransaction`, and
appends the drop events in that same transaction.

A re-measurement against the tree confirms the finding and corrects one
claim. The audit names three differences. There are five. This change records
the two it missed in `PONYTAIL-AUDIT.md`, so the next scan does not
re-propose the wrong seam.

## What Changes

- Move `parseInstance` and `loadInstance` from `src/handlers/process-start.ts`
  and `src/engine/subprocess.ts` into `src/engine/store.ts`. Export
  `loadInstance` there. Both files import it and drop their copies.
- Add `createSeededInstance` in a new file, `src/engine/seeded-create.ts`. It
  takes the created instance's identity (`instanceId`, `processId`,
  `version`, `body`), the seeding source (`instance`, `body`, `mapping`), the
  link (`parent` or `chainedFrom`), the assignment registry and `db`. It runs
  the five shared steps and returns the created `Instance`. It sits outside
  `store.ts` on purpose. It evaluates CEL and resolves an assignment. That
  module's persistence-only remit excludes both, and design.md quotes the
  three sites stating the remit.
- Call it from `makeSpawnHandler` and from `processStartHandler`. Each keeps
  its own target resolution, its own guard and its own error messages.
- Keep the two callers' behavior exactly as it stands. The spawn handler
  keeps its parent-status guard and its cancel-race backstop. The
  `process.start` handler keeps its throw on an unresolved acting instance.
  Neither adopts the other's rule.
- Correct `PONYTAIL-AUDIT.md`. Record finding 12 as resolved and name the two
  differences it missed: the source-instance guard and the injection style.
- Drop the second `createDefaultAssignmentRegistry()` call in
  `processStartHandler`. It builds one registry at line 104 and a second at
  line 155, in one delivery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change moves code and adds no rule. Every observable fact stays
as it is: the same rows, the same events, the same errors, the same order.
The `process-chaining` requirements and the subprocess ones describe that
behavior. Both stay untouched. The change sets `skip_specs: true`.

## Impact

- `src/engine/store.ts`: gains an exported `loadInstance` and a private
  `parseInstance`. Nothing else. Both are persistence.
- `src/engine/seeded-create.ts`: new file, one exported function.
- `src/engine/registry.ts:209-212`: the comment listing
  `resolveStepAssignment`'s callers. It names the subprocess spawn handler
  and misses `process.start` today. Both callers become the new function.
- `src/engine/subprocess.ts`: loses `parseInstance`, `loadInstance` and the
  seed-and-create block inside `makeSpawnHandler`. Its three other
  `loadInstance` calls (lines 86, 179, 181) take the imported one.
- `src/handlers/process-start.ts`: loses `parseInstance`, `loadInstance` and
  the same block. One duplicate registry construction goes with it.
- `test/subprocess.test.ts`, `test/process-chaining.test.ts`: the two suites
  that drive these paths. Neither changes. Both must stay green, which is the
  evidence that behavior held.
- `PONYTAIL-AUDIT.md`: finding 12 recorded as resolved, with two corrections.
- `docs/current-state.md`: the subprocess and process-chaining sections name
  the handlers. Check both against the new seam.
- No schema change, no HTTP change, no CEL change, no dependency change.
