# Proposal

## Why

Eight Dependabot pull requests stand open, and seven of them fail CI. None can
merge on its own:

- #89, #91 and #92 change `packages/web/package.json` and leave `bun.lock`
  alone. The `frozen-lockfile` gate rejects each one.
- #50 bumps `react` and #93 bumps `react-dom`. Each fails the same gate on its
  own. React ships the two together, and neither installs cleanly alone.
- #94 failed only on the retention test that `fix-retention-dst-window`
  repaired.

The failures share one cause. `.github/dependabot.yml` declares a `bun` entry
for `/packages/form-ui` and `/packages/web`. Bun keeps one `bun.lock` at the
root for the whole workspace. A Dependabot job for a member directory changes
that member's manifest. It cannot reach the root lockfile.

The root job reaches every workspace manifest. It opened #50, #51 and #93,
whose packages live only under `packages/*`. `close-ci-gate-gaps` left the
question to "the first Dependabot run". That run has now settled it.

## What Changes

- `.github/dependabot.yml` keeps one `bun` entry, for the root directory. A
  `react` group joins `react`, `react-dom`, `@types/react` and
  `@types/react-dom` in one pull request.
- `test/gates.test.ts` holds three new rules. The root has a `bun` entry, and a
  workspace directory has none. One group holds the four React packages.
- One branch takes seven of the eight bumps and a regenerated `bun.lock`:
  `react` and `react-dom` 19.3.1, `@types/react` and `@types/react-dom` 19.3.0,
  `@vitejs/plugin-react` 6.1.2, `vite` 8.3.5, `@dagrejs/dagre` 3.1.2,
  `lucide-react` 1.61.0 and `@playwright/test` 1.64.1.
- `THIRDPARTY.md` follows the new versions.
- `@types/bun` stays at 1.3.14. The runtime is Bun 1.3.11, and types for 1.4
  would admit APIs the runtime lacks. #90 stays open for a Bun 1.4 change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: "Dependabot updates the lockfile the install reads"
  names the root as the one `bun` directory and requires the React group.

## Impact

- `.github/dependabot.yml`, `test/gates.test.ts`, `package.json`,
  `packages/web/package.json`, `bun.lock`, `THIRDPARTY.md`.
- Merging the branch lets Dependabot close #50, #51, #89, #91, #92, #93 and #94
  as up to date.
- No engine, definition contract or HTTP behavior changes.
