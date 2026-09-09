## Why

A documentation audit on 2026-09-09 read this repository's tracked prose
against its tree. Ten readers then verified every finding at the code, and
wrote byte-exact correction reports under `tmp/doc-audit/`. Twelve tracked
files describe a state the repository has left behind.

The notice `THIRDPARTY.md` prints five versions no `bun.lock` entry carries.
It also lists `immer`, which no manifest declares. The file
`docs/current-state.md` cites six stylesheets that `stylex-phase-5-cleanup`
deleted on 2026-09-04. The stage table in `ROADMAP.md` gives number 45 to two
stages at once. Seven shipped decisions sit in `docs/decisions.md` under a
heading reading "Decided, not yet built".

Each of those lines teaches the next reader something false. Several send that
reader to a path no tree holds. The version table drifts again with every
`bun install`, so this change also adds the generator that rebuilds it.

## What Changes

- `THIRDPARTY.md`: rebuild the dependency table from `bun.lock`, and correct
  five prose passages around it. Two packages join the table and one leaves
  it. Five version cells change.
- `scripts/thirdparty.ts`: a new 59-line generator. It prints the table, or
  rewrites it in place under `--write`. The root `package.json` registers it
  beside `seed`.
- `docs/current-state.md`: sixteen corrections. Ten references are dead or
  stale. Three subsystems have no passage at all. The StyleX styling model
  that replaced the six cited stylesheets goes undescribed.
- `docs/decisions.md`: nine corrections. Seven shipped entries move under a
  new `## Decided and built` heading. The rest are a stale count, retired
  vocabulary and three stale code citations.
- `ROADMAP.md` and `docs/roadmap-history.md`: the duplicate stage 45 resolves,
  and stage 44 takes its Done row. Three history entries arrive, for stages
  44, 61 and 62.
- `README.md`, `PRODUCT.md` and `.claude/rules/design-language.md`: eight
  corrections. They run from a route file nobody wrote to a spec counter that
  drifts with every change.
- `openspec/specs/authored-content-localization/spec.md` and
  `openspec/specs/studio-canvas/spec.md`: one word each. `StepsPanel` became
  `StepsRail`, and both specs still name the old component.

No engine, HTTP or UI behavior changes. The generator is the only new
executable file. It imports nothing from `src/`, and `tsconfig.json` includes
`src` and `test` alone.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Every file here restates, for a human reader, behavior that some
archived change's spec already commits the code to. This change sets
`skip_specs: true`.

The two files under `openspec/specs/` are the case a reviewer should weigh.
Each takes a one-word rename of a component the tree already renamed. One sits
in narrative prose (`authored-content-localization/spec.md:127`). The other
sits inside a `SHALL` sentence, and that sentence keeps its condition
(`studio-canvas/spec.md:102`).

No `SHALL` clause gains or loses a condition, and no scenario changes. The
`design.md` states that judgement in full. It sits next to the two spec edits
this change refuses on the same test.

## Impact

- Twelve files: `THIRDPARTY.md`, `scripts/thirdparty.ts`, `package.json`,
  `docs/current-state.md`, `docs/decisions.md`, `ROADMAP.md`,
  `docs/roadmap-history.md`, `README.md`, `PRODUCT.md`,
  `.claude/rules/design-language.md`, and the two spec files above.
- No `src/`, `packages/` or `test/` file changes.
- Four files here carry an armed prose ratchet, so every printed line counts
  against their bases: `docs/current-state.md` at 619, `README.md` at 23,
  `openspec/specs/authored-content-localization/spec.md` at 9, and
  `openspec/specs/studio-canvas/spec.md` at 107. Measured 2026-09-09. Each
  corrected file measures its own base again, so the gate reads four level
  counts. The other six Markdown files exit 0.
