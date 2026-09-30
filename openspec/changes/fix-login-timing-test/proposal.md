# Proposal

## Why

The login timing test in `test/auth-users.test.ts` failed once on 2026-09-30.
No commit had touched the tree. It measured 50.8 ms
for the unknown email against 105 ms for the known one, and the bound is
`> 52.5`. The next two full runs passed. `development-toolchain` counts such a
test as a defect.

## What Changes

- `test/auth-users.test.ts`: the timing test takes several samples per path,
  in alternating order, and compares the fastest sample of each path. The
  bound stays at one half.
- No code under `src/` changes. `verifyLogin` already runs one
  `Bun.password.verify` on each path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change repairs a test. No requirement changes, so `.openspec.yaml`
sets `skip_specs: true`.

## Impact

- `test/auth-users.test.ts`, one test.
- The test takes about 0.7 s longer.
