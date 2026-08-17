## Why

`PONYTAIL-AUDIT.md`'s 2026-08-16 scan leaves 20 findings with no open change.
Three of them sit inside `packages/form-ui`, a package of seven TypeScript
files beside one stylesheet. They are the cheapest group left: one type
declaration nobody needs, one one-liner written twice, and one dead guard.
None of the three changes what a participant or an author sees.

The audit files them as ride-alongs, under "small enough to ride along with
whatever touches their files next". Nothing is touching those files. Of the
four open `ponytail-*` changes, one reaches `packages/form-ui`:
`ponytail-cut-unreachable-code` edits `form-ui.css`, `types.ts` and
`index.ts`. It reaches neither `issue-messages.ts` nor `FieldForm.tsx`'s
bodies. So these findings wait for a carrier that is not coming.

A grep sweep re-measured all three before this proposal. One holds as written.
One is half right. One costs more than it saves. This change lands the first
and the measured half of the second. It declines the third and writes both
corrections back into the audit.

## What Changes

- Replace `issue-messages.ts`'s `MessageFn`/`Catalog` function type with
  `Record<locale, Record<kind, string>>` (finding 25). Ten of the fourteen
  catalog entries are constant thunks, `() => "..."`. Two kinds interpolate,
  `constraint` and `type-mismatch`. Both keep their existing function and
  dispatch inline. `issueMessage` keeps its `locale` to `baseLocale` to `en`
  fallback and its raw-`kind` last resort.
- Delete the `parts.length === 0` branch in `optionText` (finding 39).
  `[label].join(sep)` already returns `label`, so no input reaches that
  branch.
- Decline the `isGroup`/`isGroupField` merge finding 39 also asks for. The two
  bodies do match. The merge needs a module both files import at runtime, and
  `types.ts` is the only candidate. Today it emits no JavaScript, and both
  call sites read it through `import type`. Three duplicated lines do not pay
  for that. design.md carries the measurement.
- Correct `PONYTAIL-AUDIT.md`'s finding 39 twice. It calls both of
  `optionText`'s guards dead: `if (!attributes) return label` is live, because
  `attributes` is `Record<...> | undefined` and `Object.values(undefined)`
  throws a `TypeError`. And it counts the predicate merge as a saving without
  its cost. Both corrections move to the audit's "Checked, not flagged"
  section, so the next scan does not re-propose them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Both cuts are internal refactors: same rendered output, same messages,
same fallback order, no prop or export signature change. The `form-ui` spec
states behavior, and it names neither symbol. Marked `skip_specs: true`, the
same reasoning `ponytail-cleanup-fetch-hooks-and-imports` recorded for its own
`packages/web` findings.

## Impact

- `packages/form-ui/src/issue-messages.ts`: the two local types and ten arrow
  wrappers go. The signature of `issueMessage` stays. So its one call site
  stays, at `FieldForm.tsx:238`. Line 5 of `index.ts` exports `issueMessage`
  today, and `ponytail-cut-unreachable-code` removes that line. This change
  leaves `index.ts` alone either way.
- `packages/form-ui/src/FieldForm.tsx`: `optionText` loses one branch.
  Nothing else in the file moves.
- `packages/form-ui/test/issue-messages.test.ts`: no change. Its eight cases
  cover every kind in both locales, both interpolating kinds, the unknown
  kind, and both locale-fallback paths.
- `packages/form-ui/test/field-form.test.tsx`: no change. Line 418 already
  asserts `optionText("Widget", {}, "en") === "Widget"`, which is the deleted
  branch's input. That assertion is what proves the branch dead, and it must
  stay green after the cut.
- `packages/form-ui/src/types.ts`, `submit.ts`, `index.ts`: untouched.
- `PONYTAIL-AUDIT.md`: finding 25 marked resolved, finding 39 split into its
  landed half and its two corrections.
- No schema, HTTP API, CEL or dependency change. No engine file touched. No
  visual change, so no design-skill pass applies.
