## 1. The CEL module exports

- [x] 1.1 Add `parseAst(src: string): ASTNode | null` to `src/cel/check.ts`,
      over the `parse` it already imports, catching the `ParseError` that
      invalid source throws the way `parseExpression` does
- [x] 1.2 Add `export` to `ACTOR_SCHEMA` (`src/cel/check.ts:27`), beside the
      already-exported `INSTANCE_SCHEMA`
- [x] 1.3 Assert in `test/cel.test.ts` that `parseAst` returns null for
      unparseable source, that a node's `range` slices its own substring out of
      the input, and that `ACTOR_SCHEMA` declares `id` and `roles`

## 2. The pure logic

- [x] 2.1 Create `packages/web/src/areas/studio/panels/shared/conditionLogic.ts`
      with `Operand`, `Row` and `Condition`, importing `parseAst`,
      `INSTANCE_SCHEMA`, `ACTOR_SCHEMA` and `celType` from
      `workflow-engine/cel/check`
- [x] 2.2 Create the operand list from the draft catalog: flatten with
      `flattenDraftFields` from `draft/fields.ts`, then drop every `group` node,
      since that helper pushes the group itself. Each entry carries label, key
      and `celType`
- [x] 2.3 Add `INSTANCE_SCHEMA` and `ACTOR_SCHEMA` to the list, hiding
      `instance.id`, `instance.currentStepId`, `instance.transitionSeq` and
      `actor.id`
- [x] 2.4 Add `child.outcome` from the resolved child's `contract.outcomes`, and
      `child.data.<key>` over its `contract.outputFields` alone, matching what
      `contractFieldSchema` types in `check.ts:316`. Omit both when the child
      does not resolve
- [x] 2.5 Implement `fromCel`: null parse, then joiner and flattening of the
      left-associative chain, then `readRow` per conjunct with the raw-row
      fallback over `node.range`
- [x] 2.6 Implement `toCel`: literals in the operand's declared type, string
      literals escaped for the CEL string grammar, `in` mirrored, raw rows
      parenthesised once a second row exists, incomplete rows skipped, and
      `undefined` when no row contributes

## 3. The tests for the logic

- [x] 3.1 Create `packages/web/test/studio-conditionLogic.test.ts`
- [x] 3.2 Round-trip every guard in `examples/`, read the way
      `studio-versionDiffLogic.test.ts` reads them: `toCel(fromCel(src))` equals
      `src` except for the two named normalisations
- [x] 3.3 `a && b || c` yields the joiner `||` and the rows `[raw "a && b", cmp c]`
- [x] 3.4 `data.tags.exists(t, t == "vip")` yields a raw row holding exactly that
      substring
- [x] 3.5 `"manager" in actor.roles` reads and re-emits mirrored
- [x] 3.6 A `number` operand emits `1000.0`, not `1000`
- [x] 3.7 An unknown operand yields a raw row with its `src` untouched
- [x] 3.8 `toCel` skips an incomplete row, and no row yields `undefined`
- [x] 3.9 `toCel` parenthesises a raw row as soon as a second row exists
- [x] 3.10 The four denied operands are absent from the picker list, and
      `instance.status` and `actor.roles` are present
- [x] 3.11 A value holding a double quote and a backslash re-parses after
      `toCel` writes it
- [x] 3.12 Over `examples/subprocess-credit-check-child.json`: `child.outcome`
      offers the contract's outcomes, `child.data` covers `outputFields` alone,
      and an unresolved child yields neither
- [x] 3.13 A `group` field contributes its leaves and not itself

## 4. The UI

- [x] 4.1 Run the design skills before writing the components, as `CLAUDE.md`
      requires for `packages/web`
- [x] 4.2 Create `ConditionBuilder.tsx`: the row list, the operand picker, the
      type-driven operator set and value editors from the design's two tables,
      add-row, delete-row and the joiner control
- [x] 4.3 Hold the `Condition` locally, seeded once from `fromCel` and re-seeded
      only when the incoming `src` differs from what the builder last emitted
- [x] 4.4 Mark an incomplete row in the UI, since it is builder state and never
      reaches the body
- [x] 4.5 Create `ConditionInput.tsx`: the builder, the read-only CEL line, the
      `Edit as CEL` toggle wrapping the unchanged `ExpressionInput`, and the
      disabled toggle with the parse message when the source does not parse
- [x] 4.6 Read the catalog and `loadedChildren` from `useDraft()`, the way
      `IssueList.tsx` and `LocalizedTextInput.tsx` in the same folder do, and
      take the step from a `stepId` prop
- [x] 4.7 Fire `onChange` on an authoring action alone, never on mount, read or
      mode switch
- [x] 4.8 Add the builder's UI-chrome strings to
      `packages/web/src/areas/studio/catalog.ts`. Contract vocabulary stays
      untranslated, as that file's header requires

## 5. The call sites

- [x] 5.1 Add a `stepId` prop to `PathsPanel.tsx` and switch its guard from
      `ExpressionInput` to `ConditionInput`
- [x] 5.2 Add a `stepId` prop to `ViewEditor.tsx` and pass it to its three
      `BooleanOrExpressionInput` sites
- [x] 5.3 Thread `stepId` through `BooleanOrExpressionInput.tsx` and switch its
      CEL arm from `ExpressionInput` to `ConditionInput`, keeping the existing
      `boolean`/`CEL` select as the outer mode
- [x] 5.4 Pass `step.id` from `StepsPanel.tsx:218` (`ViewEditor`) and
      `StepsPanel.tsx:254` (`PathsPanel`)
- [x] 5.5 Confirm `TimersPanel.tsx` and `FieldExpressionMapEditor.tsx` keep
      `ExpressionInput`. A deadline must infer to `string` and an
      `Action.output` value reads `result` alone, so neither is a condition

## 6. Verification

- [x] 6.1 `bun run typecheck`
- [x] 6.2 The full `bun test` with `DATABASE_URL` set; report the pass and skip
      counts
- [x] 6.3 The antislop linter on every Markdown file this change touched
- [x] 6.4 `git diff --check`, and `grep -lI $'\r'` for CRLF in the worktree
- [x] 6.5 In a real browser: open a guard from `expense-approval.json` in the
      builder, leave without touching a row, and confirm `src` stands byte for
      byte
- [x] 6.6 In a real browser: author a `child.outcome` guard on a subprocess step
      and confirm the outcome picker lists the child contract's outcomes
- [x] 6.7 In a real browser: open the `visible` override on that same subprocess
      step and confirm the child operands appear there too
- [x] 6.8 In a real browser: author a number comparison, confirm the CEL line
      reads `1000.0`, and confirm the `IssueList` stays clean while a row is
      half-filled

## 7. Documentation

- [x] 7.1 Change `docs/current-state.md` for the studio area's condition surface
- [x] 7.2 Change `ROADMAP.md` stage 27b status
- [x] 7.3 Add one sentence to `docs/authoring-guide.md`'s guard section pointing
      an author at the builder. No rule that guide states moves, so nothing else
      there changes
