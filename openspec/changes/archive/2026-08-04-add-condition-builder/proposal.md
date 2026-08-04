<!-- antislop: allow-file synonym-rotation -->
<!-- Why: "change" and "edit" name two different things here. A change is an
     OpenSpec artifact under openspec/changes/; an edit is the keystroke an
     author makes in a panel. The rule reads them as one concept and reports a
     false positive on every paragraph that names both. -->

## Why

A path guard is one text input today. `ExpressionInput.tsx` takes CEL and writes
`{ lang: "cel", src }`. Only a developer can author a condition. Stage 27b of
`ROADMAP.md` asks for a no-code surface over the same artifact. The hard part is
not emitting CEL. It is reading a hand-written guard back, so the two surfaces
do not drift apart.

## What Changes

- A new `ConditionInput` replaces `ExpressionInput` at the two condition sites.
  One is the path guard in `PathsPanel.tsx`. The other is the three view
  overrides `visible`, `required` and `readonly`, through
  `BooleanOrExpressionInput.tsx`.
- `ConditionInput` opens on a row builder. Below the rows it shows the CEL they
  produce. An `Edit as CEL` toggle leads back to the text input.
  `ExpressionInput` stays as it is and becomes that CEL mode.
- Read-back works by parsing. `fromCel` reads the CEL into a flat row list with
  one joiner. A fragment the builder cannot represent slices out of the source
  by its AST `range` and opens as a raw row. Nothing writes, hashes or versions
  the row model.
- The builder writes `src` only on a real authoring action. A guard the author
  opens and leaves stands byte for byte.
- The operand picker offers the draft's own catalog leaves as `data.<key>`. It
  adds `INSTANCE_SCHEMA` and `ACTOR_SCHEMA` minus four entries that cannot build
  a meaningful guard: `instance.id`, `instance.currentStepId`,
  `instance.transitionSeq` and `actor.id`. A subprocess step adds `child.outcome`
  and the child contract's `outputFields` as `child.data.<key>`. Both condition
  sites on such a step carry them.
- Operators and value editors follow the operand's CEL type. A `number` operand
  emits `1000.0`, which clears the `double` papercut for every author who works
  in the builder.
- `src/cel/check.ts` gains two exports. One is `parseAst`. The other is
  `ACTOR_SCHEMA`, beside the already-exported `INSTANCE_SCHEMA`. `packages/web`
  then reaches the pinned CEL library and the pinned context through the exports
  map. It carries no second pin and no second context list.

No schema change, no new route, no new dependency. `definitionHash`, version
immutability and migration stay untouched.

## Capabilities

### New Capabilities

- `studio-condition-builder`: the row builder over CEL at the studio's two
  condition sites. It covers read-back by parse, the raw-row fallback, and the
  operand picker with its deny-list. It also covers type-driven operators and
  value editors, and the CEL mode toggle. One rule closes it: only an authoring
  action writes `src`.

### Modified Capabilities

- `cel-expressions`: adds the requirement that an authoring surface reaches the
  AST through the engine's own CEL module. The one-library rule then holds
  across the workspace, and `packages/web` carries no second version pin.

## Impact

- `src/cel/check.ts`: two added exports, `parseAst` and `ACTOR_SCHEMA`. No
  behavior change to `parseExpression`, `checkAgainstFields` or
  `validateProcessBody`.
- `test/cel.test.ts`: asserts the two new exports.
- `packages/web/src/areas/studio/panels/shared/`: four new files
  (`conditionLogic.ts`, `ConditionBuilder.tsx`, `ConditionInput.tsx`,
  `overrideMode.ts`), one modified (`BooleanOrExpressionInput.tsx`).
- `packages/web/src/areas/studio/panels/PathsPanel.tsx`: one call site, and one
  added `stepId` prop.
- `packages/web/src/areas/studio/panels/ViewEditor.tsx`: one added `stepId`
  prop, passed to its three `BooleanOrExpressionInput` sites.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: passes `step.id` to
  `ViewEditor` and to `PathsPanel`.
- `packages/web/src/areas/studio/catalog.ts`: the builder's own UI-chrome
  strings. Contract vocabulary stays untranslated, as that file's header
  requires.
- `packages/web/test/{studio-conditionLogic,studio-overrideMode}.test.ts`: new,
  pure functions, no database.
- The three example processes in `examples/` use single-quoted literals. A
  builder edit on such a guard rewrites the quote style and moves the hash of
  that draft. The write-only-on-edit rule keeps this from happening by accident.
