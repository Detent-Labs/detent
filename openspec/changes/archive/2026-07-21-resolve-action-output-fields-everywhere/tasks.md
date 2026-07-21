## 1. Extend the schema invariant

- [x] 1.1 In `src/schema/definition.ts`, extend the existing `Action.output` target-resolution `forEach` (currently `[...(s.onEntry ?? []), ...(s.onExit ?? []), ...(s.onCancel ?? [])]`) to also check `onPath` actions (across every path in `s.paths ?? []`) and timer `onFire` actions (across every timer in `s.timers ?? []`), mirroring the iteration shape of the neighboring `allActionIds` collector. Keep the same `fieldIds.has(fid as FieldId)` check, the same error message (`action output targets unknown field: ${fid}`), and the same location granularity (`["workflow", "steps", i]`).
- [x] 1.2 Confirm no other invariant in the same `superRefine` needs the same extension (re-read the full function once after the edit to check for other three-of-five-position asymmetries).

## 2. Tests

- [x] 2.1 In `test/validate.test.ts`, add a rejecting test for each of the five action positions (`onEntry`, `onExit`, `onCancel`, `onPath`, timer `onFire`) where the action's `output` targets a field id absent from the catalog.
- [x] 2.2 Add an accepting test confirming an `Action.output` target resolving to a field nested inside a `group` is still accepted, for at least one of the newly-covered positions (`onPath` or `onFire`) — mirroring the existing nested-group coverage for `view.fields[].ref`.
- [x] 2.3 Confirm the existing example definitions (`examples/*.json`) still parse cleanly (they should — none currently has a bogus output target, but this proves the tightening doesn't false-positive on real definitions).

## 3. Docs

- [x] 3.1 Checked: `CLAUDE.md`'s authoring-time invariants list already states this generically ("All `id` references resolve within the process") with no position enumeration — no edit needed.

## 4. Verification

- [x] 4.1 `bun run typecheck` clean.
- [x] 4.2 Full `bun test` with `DATABASE_URL` set; confirm pass/fail/skip counts (skip count unchanged from before this change). Result: 424 pass, 0 fail, 0 skip (up from 413 pre-change, +11 matching the new tests), 1354 expect() calls across 18 files.
