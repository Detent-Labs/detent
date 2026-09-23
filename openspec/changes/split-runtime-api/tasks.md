# Tasks

Each move follows `design.md` D1: the body moves byte for byte, and only an
`export` keyword and the import lines change. After each group, `api.ts`
imports the moved names from the new module and re-exports the public ones,
so each group ends with a green `bun run typecheck`.

## 1. Baseline

- [x] 1.1 Record the base commit with `git rev-parse HEAD` in the ledger under `.superpowers/sdd/split-runtime-api/`. Verify: the ledger file names the SHA.
- [x] 1.2 Write `values-before.txt` and `types-before.txt` as `design.md` D3 describes. Verify: both files exist and are not empty.

## 2. Shared internals and field resolution

- [x] 2.1 Create `src/runtime/internal.ts` with the declarations in D1's `internal.ts` row. Verify: `bun run typecheck` passes.
- [x] 2.2 Create `src/runtime/fields.ts` with the declarations in D1's `fields.ts` row. Verify: `bun run typecheck` passes.

## 3. Instance lifecycle and claims

- [x] 3.1 Create `src/runtime/instances.ts` with the declarations in D1's `instances.ts` row. Verify: `bun run typecheck` passes.
- [x] 3.2 Create `src/runtime/claims.ts` with the declarations in D1's `claims.ts` row. Verify: `bun run typecheck` passes.

## 4. Queries and reports

- [x] 4.1 Create `src/runtime/queries.ts` with the declarations in D1's `queries.ts` row. Verify: `bun run typecheck` passes.
- [x] 4.2 Create `src/runtime/reports.ts` with the declarations in D1's `reports.ts` row. Verify: `bun run typecheck` passes.

## 5. Record, visibility, comments and attachments

- [ ] 5.1 Create `record.ts`, `visibility.ts`, `comments.ts` and `attachments.ts` under `src/runtime/` with the declarations in their D1 rows. Verify: `bun run typecheck` passes.

## 6. The barrel

- [ ] 6.1 Reduce `src/runtime/api.ts` to the barrel of D2: the reworded header comment, the existing re-export block, and explicit `export { … } from` and `export type { … } from` lists. Verify: `api.ts` has no `function` keyword and `bun run typecheck` passes.
- [ ] 6.2 Run D3's after-check. Verify: both `diff` commands against the `-before.txt` files print nothing.
- [ ] 6.3 Check the structural rules from the design's Risks section. Verify: `grep -rn 'new WeakMap' src/runtime` prints two lines in two files, and `grep -rln 'from "./api.js"' src/runtime` prints nothing.
- [ ] 6.4 Check sizes. Verify: `wc -l src/runtime/*.ts` shows no file above 700 lines.

## 7. Docs sweep

- [ ] 7.1 Add D4's sentence to the Purpose section of `openspec/specs/runtime-api/spec.md`. Verify: `openspec validate --specs --strict` passes for `runtime-api`.
- [ ] 7.2 Repoint the symbol citations in `docs/current-state.md` per D5. Verify: `grep -n 'api\.ts::' docs/current-state.md` prints nothing.
- [ ] 7.3 Repoint the line and symbol citations in `docs/decisions.md` per D5. Mark ARCH-1 resolved. Verify: `grep -nE 'runtime/api\.ts:[0-9]' docs/decisions.md` prints nothing.
- [ ] 7.4 Update the `src/runtime/` layout entry in `CLAUDE.md` per D5. Update each present-tense citation in `README.md`, `ROADMAP.md` and `docs/roadmap-history.md` the same way. Verify: each edited line names a file that exists.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` and then `bun run build`. Verify: both exit 0.
- [ ] 8.2 Run the FULL `bun test` suite with `DATABASE_URL` set in the devcontainer. Pipe its output through `sh scripts/gates/silent-green.sh`. Verify: zero failures and a pass from that gate.
- [ ] 8.3 Confirm that no test file changed. Verify: `git diff --stat <base>..HEAD -- test` prints nothing.
- [ ] 8.4 Run the prose and whitespace gates on the host over the pushed range. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipe into `whitespace.sh` both exit 0.
