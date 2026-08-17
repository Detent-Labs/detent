## Why

`PONYTAIL-AUDIT.md`'s 2026-08-16 scan leaves nine findings with no open
change. The nine are 2, 3, 4, 5, 11, 12, 22, 23 and 28. This change closes
four of them.

Finding 23 is the cheapest of the nine that holds. Every UI-string override
write costs three database round trips. The route probes for an existing row.
It counts the whole table against `MAX_OVERRIDES`. Then it upserts.

One statement carries the bound and the write together. The probe stops
existing.

Findings 5, 28 and 22 do not hold. Each names a duplication the tree does not
carry, or a standard-library swap a pinned test forbids. Two of the three name
code whose own comment records the decision to keep it.

The audit already holds a section for that verdict. Its `waitingLabel` entry
is the same shape. A measurement beside each finding stops the next scan
proposing it again.

## What Changes

- Fold the row bound into `setUiStringOverride`'s own `INSERT` in
  `src/engine/ui-strings.ts` (finding 23). The statement writes the row while
  the table sits under the bound. It also writes while the target row already
  exists. It reports back whether it wrote. An overwrite and a clear stay
  possible at the bound, which is today's rule.
- Delete the probe and the count from `handleAdminPutUiString`
  (`src/http/admin-routes.ts:802-807`). The route keeps its
  `RequestShapeError` and its message. It raises that error from the write's
  own answer, not from a preceding read.
- Delete `uiStringOverrideExists` (`src/engine/ui-strings.ts:79`). Only
  `test/ui-strings.test.ts:63` reaches it once the route stops calling it.
  Keep `countUiStringOverrides`. Two test files assert on it, and it is the
  read the admin bound test drives.
- Correct `PONYTAIL-AUDIT.md`. Record finding 23 as resolved. Move findings 5,
  28 and 22 to "Checked, not flagged (deliberate, per CLAUDE.md)". Each one
  carries the measurement that disqualifies it. `design.md` holds the
  evidence.
- Add `countUiStringOverrides` to finding 41's list in the same audit. That
  finding tracks exports no file outside `test/` reads. The route is its last
  reader in `src/`, and this change removes that call.

Three claims in the audit do not hold:

- Finding 5 calls `RuleInput.tsx` a copy of `ConditionInput.tsx`. A
  `git diff --no-index` run reports 51 insertions and 84 deletions. The two
  files hold 267 lines together. `RuleInput.tsx:19-27` states that it "Stays a
  separate component per design.md". Its default operand and its
  field-against-field comparison have no counterpart on a path guard or a view
  override.
- Finding 28 calls `ConditionInput`'s `toggleVariant` prop speculative. Both
  variants have a live caller. `PathsPanel.tsx:134` passes `"disclosure"`.
  `BooleanOrExpressionInput.tsx:62` takes the `"link"` default. The prop's own
  comment binds the split to `studio-condition-builder`'s "path-guard site
  only" scope. Dropping the prop changes what one of the two sites renders.
- Finding 22 asks for `Intl.NumberFormat`'s unit style in place of
  `formatDuration`'s unit table. One test file pins 13 strings across `en` and
  `de`, `"4.5 s"` and `"5,5 Std"` among them
  (`packages/web/test/reporting-reportingLogic.test.ts:90-110`).
  `Intl.NumberFormat` renders `"4.5 sec"` and `"5,5 Std."` instead. The
  audit's own `waitingLabel` entry records this outcome for the same reason.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. One requirement in `openspec/specs/ui-string-overrides/spec.md` governs
the bound. It carries the title "The write path bounds what the public read
returns". It states that the system refuses a write that would carry the table
past a declared row count. That stays true, statement for statement. Every
scenario under it keeps its outcome.

The concurrency window does not move either, so no requirement covers it. Two
writers under `READ COMMITTED` each take their own snapshot. So two concurrent
inserts at the bound can still cross it by one row. Today that window spans
three statements. Afterwards it spans one.

The comment at `admin-routes.ts:788-791` already declares that crossing
acceptable. This change neither rests on that judgment nor overturns it.
Marked `skip_specs: true`.

## Impact

- `src/engine/ui-strings.ts`: `setUiStringOverride` takes the bound and
  answers whether the bound refused the write. `uiStringOverrideExists`
  deleted.
- `src/http/admin-routes.ts`: `handleAdminPutUiString` loses two awaits and
  one import. `MAX_OVERRIDES` stays where it is, and stays exported.
- `test/ui-strings.test.ts`: a new test drives the bound through
  `setUiStringOverride` itself, in place of the `uiStringOverrideExists` test.
  Its nine calls take the bound argument. Two assertions read the new union
  in place of a boolean.
- `test/http-ui-strings.test.ts`: its four `setUiStringOverride` calls take
  the bound argument. Every assertion stays. The file drives the route, and
  the route's answers do not move.
- `PONYTAIL-AUDIT.md`: findings 23, 5, 28 and 22.
- No HTTP contract change: same routes, same statuses, same messages, same
  bodies. No schema or definition-contract touch. No dependency change. No UI
  change, so no browser check.
