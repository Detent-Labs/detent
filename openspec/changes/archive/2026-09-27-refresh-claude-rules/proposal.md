# Proposal

## Why

The four files under `.claude/rules/` load into every session that touches the engine, the studio or the specs. Four read-only reviews on 2026-09-27 checked them against the tree at `52ec0d0a` and found false claims in each.

Two examples: `process-contract.md` says a `core.` action type skips the registry check, and `src/engine/registry-check.ts:130` says no type skips it. It lists twelve event kinds, and `src/schema/definition.ts` declares fifteen. An agent that trusts a false rule writes false code. The same stale claims repeat in `CLAUDE.md`, `docs/authoring-guide.md`, code comments and one live spec.

## What Changes

- Correct every wrong or stale claim the reviews verified in `process-contract.md`, `authoring-invariants.md`, `design-language.md` and `ui-glossary.md`.
- Add the gaps each review found where the rule is load-bearing and loads nowhere else. Examples: cancellation, `collaboration`, the subprocess depth cap, the elevation exception, the Access tab.
- Replace text that copies `CLAUDE.md` or `DESIGN.md` with a one-line pointer. Point the event catalogue at `definition.ts` and the `runtime-events` spec instead of listing kinds by hand.
- Fix the `paths:` frontmatter of all four files. Then a touch of `src/validate.ts`, `packages/form-ui/`, `DESIGN.md` or `openspec/` loads its rule.
- Replace the file-wide antislop directives with targeted ones or with fixed prose.
- Fix the same claims in `CLAUDE.md`, `PRODUCT.md`, `README.md`, `openspec/config.yaml`, `docs/authoring-guide.md` and `docs/current-state.md`.
- Fix the structural-check count and the check-order claims in the code comments that carry them.
- Keep every rule-file sentence that a code comment or a live spec quotes. Re-point the one comment that cites a rule DL does not state.
- Scope two `DESIGN.md` lines the same review found too broad: the `select` chevron and the literal-class family.
- Record four open items in `docs/decisions.md`. They cover an unenforced subprocess rule and ten off-spec font weights. They also cover the "Access surface" wording and retired glossary words in live specs.
- Narrow the FIELDS-13 entry in `docs/decisions.md` to the `docs/browser-checks.md` lines that still test a Values tab.

No behavior changes. The definition contract, the Zod schemas and the UI stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-checks-rail`: the held-back requirement cites `authoring-invariants` for a check order the rule file never stated. It counts six structural checks, and `compileProcessBody` runs twelve. The delta cites `src/validate.ts::validateStructure` for the held-back premise. It drops the count, so the next added check cannot make it stale.

## Impact

- Documentation: the four `.claude/rules/*.md` files, `CLAUDE.md`, `PRODUCT.md`, `README.md`, `DESIGN.md`, `openspec/config.yaml`, `docs/authoring-guide.md`, `docs/current-state.md` and `docs/decisions.md`.
- Code comments only: `src/validate.ts`, `src/engine/definitions.ts`, `src/schema/compile.ts`, `src/schema/definition.ts`, `packages/web/src/areas/studio/draft/checksRail.ts`, `packages/web/src/areas/studio/draft/validation.ts`, `packages/web/src/areas/studio/panels/StepsRail.tsx` and `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`.
- Further comments the citation sweep re-points, among the files `git grep` lists for a rule-file name under `src/` and `packages/`. Each file it touches joins this list at apply.
- Specs: one MODIFIED requirement in `studio-checks-rail`.
- No API, schema, dependency or UI change. No browser check applies.
