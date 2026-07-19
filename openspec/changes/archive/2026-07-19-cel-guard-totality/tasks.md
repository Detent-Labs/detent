## 1. Spec sync

- [x] 1.1 MODIFY `cel-expressions` "Engine evaluates guards with the shared CEL library" to state runtime guard totality (error -> `false`, never throws), with scenarios for an unwritten-field guard and a runtime-unresolvable reference. (delta in this change)

## 2. Confirm implementation matches (no code change expected)

- [x] 2.1 Confirm `src/cel/eval.ts` `evalGuard` catches runtime errors and returns `false`.
- [x] 2.2 Confirm `test/eval.test.ts` covers a guard on an unwritten field (-> false) and the out-of-scope `result` reference (-> false), and that `bun test` is green against a live Postgres.
