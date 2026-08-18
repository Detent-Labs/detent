## Context

See proposal.md for the three findings and why they share one change.
This document records the verification behind each finding's scope. The
source audit's framing needed correction on two of the three.

`packages/form-ui` is source-only. It has two consumers: `TaskScreen.tsx`
in the app area, and `PlayerScreen.tsx` in the studio area's Player. Both
reach `FieldForm` the same way. The studio catalog
(`packages/web/src/i18n/catalogs/studio.ts`) is English-only. Its `t(key)`
takes no locale argument, unlike every other area's catalog.

## Goals / Non-Goals

**Goals:**
- Delete three pieces of dead or duplicated code. No rendered string,
  saved value, or API response changes.
- Correct the audit's own count on finding 69 before any code change
  touches it.
- Move the one test that exercises real behavior finding 68 would
  otherwise leave untested.

**Non-Goals:**
- Merging `RuleBuilder`/`RuleInput` with `ConditionBuilder`/`ConditionInput`.
  A prior audit finding, finding 5, already raised this and declined it.
  The rule builder's default "this answer" operand has no counterpart at a
  guard site. Neither does its field-against-field value comparison.
  Nothing here revisits that decision.
- Adding a base-locale fallback to any production screen. In
  `PlayerScreen.tsx`, the Player passes one fixed locale, `"en"`, as
  both `locale` and today's `baseLocale`. That is a deliberate choice,
  and it needs no distinct value.

  In `TaskScreen.tsx`, the Task screen cannot pass a distinct value
  today. It has no such value to pass. Its `InstanceView` type, the
  type `getInstanceView` returns, carries no process-`baseLocale` value
  at all. That gap is pre-existing, and this change adds no fix for
  it. See "TaskScreen.tsx's own gap" below.

## Decisions

### Finding 68: the baseLocale prop, and where its test goes

`FieldForm`/`FieldInput`'s `baseLocale` prop defaults to `locale`. Both
production callers omit it. `TaskScreen.tsx:266` passes only `locale`.
`PlayerScreen.tsx:204` passes only `locale="en"`. A grep across
`packages/web` and `packages/form-ui` turns up exactly one call site that
sets `baseLocale` to a value different from `locale`. It sits in
`field-form.test.tsx`, in the test named "falls back to baseLocale when
the active locale has no entry." That test renders
`<FieldForm locale="de" baseLocale="en" .../>` and checks for the English
fallback text.

That test exercises `resolveText`'s real fallback logic, in
`packages/form-ui/src/locale.ts`. Deleting the prop with no relocation
would drop that coverage without a trace. Instead, the test becomes a
direct call: `resolveText({ en: "English" }, "de", "en")`. It asserts the
same fallback text. `resolveText` is already an exported function, so
this needs no new export.

The prop's own removal changes no `FieldForm` output for either
production consumer. Both already behave as if `baseLocale === locale`.

### TaskScreen.tsx's own gap: no baseLocale value to fall back to

Both callers omit the `baseLocale` prop. They do it for different
reasons, though the source audit's framing treated them as one case.
The Player, in `PlayerScreen.tsx`, omits it by choice. Its own `locale`
is a fixed `"en"`. A distinct fallback value would resolve to the same
text it already renders.

The Task screen, in `TaskScreen.tsx`, omits it because it has nothing
to pass. Its `InstanceView` type is what `getInstanceView` returns, and
it is what `view.fields` holds at `TaskScreen.tsx:266`. That type has
no process-`baseLocale` field.

Two sibling types do carry one. The `InstanceSummary` type carries
`processBaseLocale` (`packages/web/src/areas/app/api/types.ts`), and
`inboxLogic.ts` reads it for the same fallback. The `ProcessSummary`
type carries `baseLocale`, and `StartScreen.tsx:69` reads it the same
way. The Task screen still has no equivalent field to read.

In practice, a task field labeled only in the process's authored
`baseLocale` renders blank on the Task screen. That happens whenever the
participant's active locale differs, instead of falling back to the
authored text. End-user-app's requirement is "The app carries exactly
one active locale, resolved with fallback." It states that process
content falls back to the process's `baseLocale` when the active locale
has no entry. It names no carve-out for task field labels. That screen
does not meet the requirement today.

This gap predates this change. The Task screen never passed a
`baseLocale` value distinct from `locale`. Deleting the always-unused
prop changes no `TaskScreen.tsx` output. Closing the gap needs two
changes. First, an `InstanceView` API change: the response
`getInstanceView` returns would need its own `baseLocale` field.
Second, `TaskScreen.tsx` needs a wiring change to read it.

Both are out of scope for this ride-along cleanup. Proposal.md's
Migration Plan already commits to shipping with no API change. The
Risks/Trade-offs section below records this as an accepted,
pre-existing gap. Tasks.md's browser-verification section names it
too. A verifier then does not mistake the pre-existing blank render
for a regression this change caused.

`issueMessage`'s own `baseLocale` parameter, in
`packages/form-ui/src/issue-messages.ts`, is a distinct function. This
change does not touch it. It already carries its own direct test, in
`issue-messages.test.ts`.

### Finding 69: the real duplication is 16 keys, not 23

The audit's framing said 23 `ruleBuilder.*` keys restate the 22
`condition.*` keys word for word. A key-by-key comparison of every
`ruleBuilder.*` and `condition.*` entry in `studio.ts` shows a different
shape:

| Group | Count | Keys |
|---|---|---|
| Same suffix, identical text | 16 | `addRow`, `removeRow`, `yes`, `no`, `rawRow`, `incomplete`, `celReadout`, `celEmpty`, `developerView`, `unparseable`, `operandLabel`, `operatorLabel`, `selectOperand`, `valueLabel`, `valuePlaceholder`, `selectValue` |
| Same suffix, different text | 1 | `empty` |
| `ruleBuilder.*` only | 6 | `thisAnswer`, `and`, `valueKindLabel`, `valueKindLiteral`, `valueKindField`, `selectValueField` |
| `condition.*` only | 5 | `contains`, `joinerHint`, `editAsCel`, `useBuilder`, `onlyWhenHeading` |

The table above accounts for the audit's own totals. Its claim that all
23 restate all 22 does not hold.

<!-- antislop: allow passive-voice em-dash -->
<!-- The em dashes below are quoted catalog text, not prose punctuation. -->
`ruleBuilder.empty` and `condition.empty` hold different text: "No rule —
nothing is checked." against "No condition — this always matches." Merging
them would flatten two different empty states into one.

Scope: delete the 16 identical keys from the `ruleBuilder` namespace
alone. `RuleBuilder.tsx` and `RuleInput.tsx` both read those 16 keys
today. Both switch, for those 16 alone, to the matching `condition` key.
`ruleBuilder.empty` stays. So do the six `ruleBuilder`-only keys, and all
five `condition`-only keys. No component merges, and no rendered string
changes. The studio catalog holds one English copy of each surviving
key. A repointed `t()` call renders today's own text.

### Finding 70: a straight import-path swap

`describeRecordElement` lives in `packages/web/src/api/record.ts` and has
two consumers. `InstanceScreen.tsx` already imports it from that path
directly. `PlayerScreen.tsx` imports it from `playerLogic.ts`'s re-export
instead. No third file imports it from `playerLogic.ts`.

The fix moves `PlayerScreen.tsx` onto that same import path. It deletes
the now-unused re-export line. `seedFormValues`, the other export
`playerLogic.ts` carries, is a real function. That file defines it
directly, rather than re-exporting it. This change leaves it alone.

### No spec delta for findings 69 and 70

Neither `studio-field-validation-form` nor `studio-player` documents a
catalog key name. Neither documents an internal import path. Both specs
describe what an author sees and what gets saved: row shape, saved CEL,
record contents. None of that changes here. A repointed catalog key
renders the same English text it renders today. A relocated import
returns the same function.

`openspec validate` needs at least one delta somewhere in the change, and
`form-ui` already carries one. Findings 69 and 70 add no delta of their
own, rather than force an empty one where no requirement changes.

## Risks / Trade-offs

- Risk: an unnoticed fourth caller of one of the three deleted or
  repointed surfaces, missed by the grep sweep above.
  Mitigation: the browser-verification tasks re-check all three
  surfaces, after the change lands. Typechecking catches a missed
  import too, as a type error, since each deleted name becomes
  unexported.
- Risk: a future reader trusts the audit's "23 keys" framing, and
  assumes the whole `ruleBuilder` namespace was meant to collapse.
  Mitigation: this design's table corrects that framing. The six
  `ruleBuilder`-only keys, and `ruleBuilder.empty`, are a deliberate
  keep, not an oversight.
- Risk: the relocated `resolveText` test loses the "through FieldForm"
  integration angle the original test had.
  Mitigation: `FieldForm` calling `resolveText` correctly stays covered
  indirectly. Every `FieldForm` render, across `field-form.test.tsx`'s
  other tests, resolves at least one label through it. Only the
  base-locale-fallback branch moves to a direct call.
- Risk: a `ui_string_overrides` row keyed to `(studio, *,
  ruleBuilder.<key>)` for one of the 16 deleted keys goes silently
  dead. The `ui-string-overrides` catalog cuts across every area,
  `studio` included, and `resolveOverride(...)`
  (`packages/web/src/areas/studio/catalog.ts`) stops firing once
  `RuleBuilder.tsx`/`RuleInput.tsx` call `t("condition.<key>")`
  instead. An admin's customization on that key then stops applying,
  and nothing tells the admin or cleans up the row. The "no rendered
  string changes" claim above holds only without such an override.
  Mitigation: task 2.6 checks any real deployment for a row on one of
  the 16 keys before shipping there. It either migrates that row to
  the matching `condition.<key>` row, or records the loss as
  accepted.
- Risk: the Task screen renders a task field's `LocalizedText` label
  blank, not falling back to the process's authored `baseLocale`. That
  happens whenever the participant's active locale has no entry for
  that label. Its `InstanceView` type carries no process-`baseLocale`
  value for `FieldForm` to fall back to. So `TaskScreen.tsx` cannot
  pass one. End-user-app's requirement that process content falls back
  to the process's `baseLocale` stays unmet for that screen.

  This predates this change. The Task screen never passed a
  `baseLocale` value distinct from `locale`. The prop's removal here
  changes no `TaskScreen.tsx` output.

  Mitigation: this change does not fix the gap. A fix needs two
  things: an `InstanceView` API change, and a `TaskScreen.tsx` wiring
  change. Both stay out of scope for a ride-along cleanup that ships
  no API change.

  Task 4.1 in tasks.md now picks a field labeled in the active locale.
  That way it exercises the prop removal without depending on a
  fallback this screen cannot perform. Task 4.8 checks that the known
  gap's behavior stays unchanged. That check does not treat it as a
  regression this change must fix.

## Migration Plan

No data migration applies. No API changes apply. No deployment ordering
concern applies either. This ships as one commit set: a package-internal
code change, plus one catalog change. The existing suites verify it,
plus the new `resolveText` test and the browser checks in tasks.md.

## Open Questions

None. Every finding's scope, and the one spec delta this change carries,
stays settled above.
