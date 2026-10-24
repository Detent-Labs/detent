# Proposal

## Why

The advisory GHSA-mrhx-c7xc-m3w5, rated high, reports that Zod below 4.6.6 can
exhaust memory while it validates an oversized constrained collection. The repo
pins `zod` at 4.6.5. The `bun audit --audit-level=high` step of the CI `check`
job fails on that pin since 2026-10-24, on `main` and on every pull request.

## What Changes

- `package.json` and `packages/web/package.json` pin `zod` at 4.6.6.
- `bun.lock` resolves `zod` to 4.6.6.
- `THIRDPARTY.md` lists `zod` 4.6.6.
- No behavior of the engine, the definition contract or the web package
  changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No spec states the Zod version, so this change sets `skip_specs: true`.

## Impact

- `package.json`, `packages/web/package.json`, `bun.lock`, `THIRDPARTY.md`.
- Zod expresses the definition contract (`src/schema/definition.ts`). The full
  suite is the check that the patch release changes no parse result.
