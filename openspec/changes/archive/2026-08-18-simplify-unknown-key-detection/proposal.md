## Why

`checkUnknownKeys` in `src/schema/compile.ts` mirrors the Zod schema by
hand. It carries 19 `shapeKeys(...)`-derived `*_KEYS` constants plus 9
hand-written recursive `walkFooKeys` functions. Nothing links these to
`src/schema/definition.ts` except a programmer's memory. Every schema
change has to touch both mirrors.

Nothing catches a level someone forgets.
`test/compile-validation.test.ts` plants one case per nesting level for
this reason. A forgotten level fails silently otherwise.
A ponytail audit flagged this as roughly 200 lines. They stand in for a
walk the live schema already knows how to describe.

Two other active OpenSpec changes touch the same code this change edits.

One is `field-tree-check-consolidation`. Its tasks are already generated.
They touch `walkViewKeys` and four sibling checks in
`src/schema/compile.ts`. Its own design.md now cross-references this
change by slug and states the same sequencing mitigation.

The other is `compile-unknown-key-check-generic`. It is proposal-only so
far. It states the same goal for the same function. That overlap still
carries no cross-reference on either side.

design.md's Risks section states the coordination this overlap requires.
It also states the sequencing that coordination drives.

## What Changes

- Replace the 19 `*_KEYS` constants and 9 `walkFooKeys` functions in
  `src/schema/compile.ts` with one generic recursive walker. The walker
  extends the existing `unwrapSchema` and reads the live Zod schema tree at
  traversal time. A schema change then needs no hand-mirrored key list
  updated. `walkFieldsIndexed` is a tenth, similarly-named function in the
  same file. Four unrelated checks reuse it as a generic field-tree
  traversal helper. It stays.
- Keep the walker on the same input `checkUnknownKeys` sees today: the raw,
  duck-typed body, before any Zod parse of it. Keep producing the identical
  `{ loc, value, message }` `CompileIssue` shape and the same per-key
  granularity. Every existing test depends on that shape, and so does the
  Process Studio inspector UI
  (`packages/web/src/areas/studio/draft/issues.ts`).
- Reject the literal "parse the whole body, then diff the parsed output
  against the input" framing as the detection mechanism. A full Zod parse
  fails outright whenever any other part of the body is invalid. It leaves
  no partial or stripped output to diff. That would stop reporting
  unknown-key issues on exactly the bodies most likely to carry one.
  A body mid-edit routinely has more than one thing wrong. See design.md's
  Risk section for the counterexample that rules this out.
- Change nothing about what gets rejected, the `{ loc, value, message }`
  shape, or `definitionHash` computation and reproducibility.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: the existing "Authored bodies reject unknown keys
  instead of dropping them" requirement gains one scenario. It states an
  invariant this refactor must preserve. Unknown-key detection does not
  need the rest of the body to already be schema-valid. That invariant held
  by construction before; no text stated it.
- This change also rewords the surrounding paragraphs. It rewords one
  scenario's THEN clause and a second scenario's WHEN clause, for prose
  clarity. Neither reword changes the rejected or accepted behavior.

## Impact

- `src/schema/compile.ts`: one schema-driven walker replaces
  `checkUnknownKeys` and its 19 `*_KEYS` constants and 9 `walkFooKeys`
  helpers. No other export of the module changes signature.
- No caller changes. `compileProcessBody` (`src/engine/definitions.ts`)
  keeps calling `structuralIssues` at the same placement, ahead of the
  `publishedProcessBody`-valid early return.
- Test-only impact elsewhere: `test/compile-validation.test.ts`'s existing
  unknown-key assertions must keep passing unchanged, with the same
  `loc`/`value` shape. No other test file references `checkUnknownKeys` or
  its constants directly.
- `packages/web/test/studio-issues.test.ts` gains one new case, in its
  `resolveLoc` describe block (task 3.12). It reaches the new walker's
  `loc` output through `resolveLoc`, not through `checkUnknownKeys`
  directly. So the bullet above's "references `checkUnknownKeys`"
  criterion does not catch it on its own.
- No API, schema, or `definitionHash` change. No UI code change: the studio
  consumer of `CompileIssue.loc` keeps working, because the shape stays the
  same.
