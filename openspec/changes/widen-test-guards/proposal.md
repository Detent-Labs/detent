# Proposal

## Why

Five findings of the 2026-10-10 audit describe tests that pass without
guarding what they claim to guard. They are G-3, G-4, G-9, G-10 and A-6. A
sixth item, TEST-1 in `docs/decisions.md`, is the same defect: the test does
not exist.

- G-3: the index guard in `test/migration.test.ts` searches
  `REWRITTEN_MODULES`, which names `runtime/api.ts`. Since `split-runtime-api`,
  that file is a 117-line barrel without SQL. The readers live in `queries.ts`,
  `instances.ts`, `internal.ts` and `reports.ts`. A
  `WHERE body->>'status' = ...` there keeps the test green. The test's own
  comment calls it the only guard. No violation exists today.
- G-4: the hash guard for `examples/` covers 3 of 9 files. Only
  `expense-approval.json` has its wrapper hash compared. Recomputed on
  2026-10-10, `it-offboarding.json` and `it-onboarding.json` hold a stale
  `definitionHash`. The other five wrappers match. The two subprocess bodies
  are bare and have no wrapper hash. Nothing at runtime reads the stale value,
  since `scripts/seed.ts` computes its own.
- G-9: the round trip for `stripCompiledContent` lists 6 of 9 examples by
  hand. All nine round-trip today.
- G-10: three tests assert too little. The body-size test accepts any status
  except 413. "freezing is per key" has no `expect`. The OpenAPI test checks one
  path and a count, while the spec lists 28 required routes.
- A-6: seven invariants have no test that rejects a violating input. CLAUDE.md
  demands one for every invariant.
- TEST-1: nothing asserts that every route refuses a request without
  credentials. A route added without a gate ships silently.

Two of these are hand-kept lists gone stale. The fix for both is to read the
tree, so the list cannot go stale again.

## What Changes

- The index guard scans every file under `src/runtime/`, plus
  `engine/definitions.ts` and `engine/reporting.ts`. It fails when the scanned
  set is empty.
- A hash test iterates `examples/`. A wrapper stores the hash of its compiled
  body. A bare body has a row in the table of recorded hashes. A file with
  neither fails.
- The two stale wrappers get a regenerated hash. They are
  `examples/it-offboarding.json` and `examples/it-onboarding.json`, line 4.
- The `stripCompiledContent` round trip iterates `examples/`.
- The three weak tests assert their outcome. The body-size test pins status and
  `error.type`. "freezing is per key" checks (1→4) frozen and (2→4)
  replaceable. The OpenAPI test iterates the spec's route list.
- Each A-6 row gets a test that rejects a violating body. The valid twin of
  that body sits beside it.
- A table-driven test sends a request without credentials to every route in
  `createServer`'s table. Each route answers 401. A named exemption set holds
  the exceptions, with a reason per entry. TEST-1 closes in the same change.
- `src/` stays as it is. The schema stays as it is. No definition-contract
  rule moves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: four requirements. A guard test reads the set it
  guards from the tree. The hash guard covers every example. A test asserts the
  outcome its name claims. Every invariant has a test that rejects a violating
  input.
- `http-api-documentation`: a test holds `docs/openapi.yaml` to the required
  route list.
- `http-wrapper`: a test holds every route of the table to a refusal without
  credentials.

## Impact

- Tests: `test/migration.test.ts`, `test/view-layout-hash.test.ts`,
  `test/validate.test.ts`, `test/strip-compiled.test.ts`,
  `test/http-body-size.test.ts`, `test/openapi-exclusions.test.ts`,
  `test/compile-validation.test.ts`, and one new route-auth test file.
- Data: two example wrappers, one line each.
- Docs: `docs/decisions.md` strikes this change from the audit index. TEST-1
  leaves the open list.
- Pass floor: `scripts/gates/pass-floor.txt` stays. The new tests only widen
  its margin.
- Deployment: none. No `src/` change, no definition-contract change.
