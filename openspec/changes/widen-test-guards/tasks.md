# Tasks

## 1. The index guard reads a directory (G-3)

- [x] 1.1 Replace `REWRITTEN_MODULES` in `test/migration.test.ts` per design D1. Read the `.ts` files of `src/runtime/` with `readdirSync`, add `engine/definitions.ts` and `engine/reporting.ts`, and assert the set holds more than those two. Verify that the test passes on the tree.
- [x] 1.2 Prove the guard on a copy. Copy `src/` to `/tmp/mut/src` in the container and add `WHERE body->>'status' = 'running'` to a copy of `src/runtime/queries.ts`. Add the same line to a new file `src/runtime/zz-probe.ts`. Run the test against the copy. Record that both fail and name the file.

## 2. One test checks every example's hash (G-4)

- [x] 2.1 Recompute `definitionHash(compileProcessBody(raw.definition))` for the seven wrappers in the container, with a script outside `/workspace`. Record which differ. Stop and ask the coordinator if the set is not exactly `it-offboarding.json` and `it-onboarding.json`.
- [x] 2.2 Replace line 4 of `examples/it-offboarding.json` and `examples/it-onboarding.json` with the recomputed hash. Use a text-tool replacement. Verify with `file` that neither file gained a CR byte.
- [x] 2.3 Add the `readdirSync("examples")` describe to `test/view-layout-hash.test.ts` per design D2. A wrapper must match its compiled hash. A bare body must have a row in `PRE_CHANGE_HASHES`. Verify that it passes.
- [x] 2.4 Prove the guard on a copy. Change one character of a wrapper hash, and separately copy a new bare body into a scratch `examples/`. Record that each run fails and names the file.

## 3. The round trip reads the directory (G-9)

- [x] 3.1 Replace `EXAMPLES` in `test/strip-compiled.test.ts` with `readdirSync("examples")` filtered to `.json`, per design D3. Add a test that the list is not empty. Verify that nine round-trip tests run.
- [x] 3.2 Prove the guard on a copy. Add a body to a scratch `examples/` that `stripCompiledContent` does not invert. Record that its round-trip test fails.

## 4. Three tests assert their outcome (G-10)

- [x] 4.1 Measure the body-size request in `test/http-body-size.test.ts` once. Record its status and `error.type`. Pin both and fix the comment per design D4.
- [x] 4.2 Give "freezing is per key" in `test/migration.test.ts` its assertions per design D4. Verify that the test passes.
- [x] 4.3 Rewrite the route test in `test/openapi-exclusions.test.ts` per design D4. It reads the required-route paragraph of the spec and asserts each route in the document. Verify that it passes, and that the paragraph yields at least one route.
- [x] 4.4 Prove the three tests on a copy. Make the body-size route answer 404. Make `registerMigrationPlan` accept a frozen key. Delete one path from a copy of `docs/openapi.yaml`. Record that each test fails.

## 5. Seven invariants get a rejecting test (A-6)

- [x] 5.1 Grep `test/` for an existing refusal test of each A-6 row, and record the result per row. A row that has one gets no new test.
- [x] 5.2 Add one refusal test and its valid twin per remaining row, per design D5. The rows are in the list below. Verify that each new test passes.
  - a terminal step with a path
  - a foreign timer `targetPath`
  - `duration` with `deadline`
  - `pinnedVersion` and `contractRef`
  - a contracted terminal step without an outcome
  - an unbound outcome
  - the four length bounds
  - `unmappableStep`
  - a duplicate step id
  - the reserved sink `key`
- [x] 5.3 Prove each new test on a copy. Delete the check from a copy of `definition.ts` or `compile.ts`. Run the copy's tests. Record that exactly the matching test fails, row by row.

## 6. Every route refuses an anonymous request (TEST-1)

- [x] 6.1 Create `test/http-route-auth.test.ts` per design D6, with the row-count and exemption self-checks. Verify that it passes and that it parses 90 rows.
- [x] 6.2 Run the file once with `DATABASE_URL` unset. Add `test.skipIf(!DB)` only if a route stops answering 401 without a database. Record the choice.
- [x] 6.3 Prove the test on a copy. Add a row with an ungated handler to a copy of `server.ts`. Add a row of another shape. Add a stale `EXEMPT` key. Record that each run fails.

## 7. The records

- [x] 7.1 Delete the `widen-test-guards` entry from the audit index in `docs/decisions.md`. Verify that `git grep -n widen-test-guards docs/decisions.md` prints nothing.
- [x] 7.2 Delete the TEST-1 entry from `docs/decisions.md`, and fix the count sentence of its section. Check `ROADMAP.md`, `README.md` and `docs/current-state.md` for a sentence the change made false.
- [ ] 7.3 Run the antislop linter on every Markdown file this change touched. Fix each finding or add a targeted directive with a reason.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` in the devcontainer. Record the exit status.
- [ ] 8.2 Run `bun run lint` and `bun run build` in the devcontainer. Record both exit statuses.
- [ ] 8.3 Run the full `bun test` with `DATABASE_URL` set, through `scripts/test-gated.sh`, with `OPENSPEC_TELEMETRY=0`. Record the summary lines and the gate's verdict.
- [ ] 8.4 Run `bun run test:tz` in the devcontainer. Record its summary.
- [ ] 8.5 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Run the same with `whitespace.sh`. Record what each printed.
