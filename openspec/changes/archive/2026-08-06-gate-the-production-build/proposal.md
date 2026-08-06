## Why

On 2026-08-06 a frontend that does not build reached `main`. Nobody saw it.

`add-ui-chrome-white-label-overrides` put `await loadUiStringOverrides()` at
module top level in `packages/web/src/main.tsx`. Vite's default build target is
`es2020` and `chrome87`. Neither one carries top-level await. `bun run build`
stopped and said so:

```
Top-Level await is not available in the configured target environment
```

Every check this repository runs reported green. `bun run typecheck` passed.
The full suite passed, all 2070 tests. All six push gates passed. A contributor
found the defect by hand, while building the app to open it in a browser.
Commit `ad428bc` repaired it.

No check ever builds the frontend. `.githooks/pre-push` runs `bun run check`,
and that script holds the typecheck and the two suite runs. It holds no build.
So the defect class has no detector at all.

The class is wider than top-level await. Bundling rejects any syntax the target
lacks. It rejects an import Rollup cannot resolve. A broken CSS import fails it.
So does a Vite plugin that throws.

The typecheck bundles nothing, and `bun test` resolves modules by its own rules.
Neither one can see any of that.

## What Changes

- The root `package.json` gains a `build` script. It fans out over the
  workspace, the way `typecheck` already does.
- `check` runs that build between the typecheck and the suite. The pre-push
  hook already runs `check` inside the devcontainer, so the hook gains the
  build with no change of its own.
- No new script lands under `scripts/gates/`. The design document states why.
- `development-toolchain` gains one requirement for the build. Its push-gate
  requirement changes to name four checks rather than three.

## Capabilities

### New Capabilities

None. The build joins an existing capability's check command.

### Modified Capabilities

- `development-toolchain`: a new requirement for the production build, and a
  changed push-gate requirement that counts it.

## Impact

- `package.json` (root): a new `build` script, and one word added to `check`.
- `openspec/specs/development-toolchain/spec.md`, at archive time.
- `CLAUDE.md`: the verification section names the checks a change must pass.
- The pre-push hook runs about half a minute longer. Measured below.
- No source file changes. No test changes. The build passes on the tree today.
