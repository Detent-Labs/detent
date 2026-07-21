# Tasks — hash-the-parsed-body

## 1. Regression tests first (fail on current code)

- [x] 1.1 In `test/definitions.test.ts` (DB-gated suite): publish an authored
      body carrying an extra unknown key (e.g. an unrecognized key on a step) and
      assert the returned `definition` and the stored row body do not contain the
      key, and that `definitionHash(returned.definition) ===
      returned.definitionHash`.
- [x] 1.2 Same suite: resolve the published version through
      `createDefinitionStore().resolveBody` and assert
      `definitionHash(resolved) === version.definitionHash` (round-trip hash
      stability — this is the assertion the bug breaks).
- [x] 1.3 Same suite: create an instance from the returned `definition` and
      assert `rehydrate(instanceId, resolved)` succeeds (no `PinMismatch`).
- [x] 1.4 Same suite: re-publish the resolved body and assert it is a
      hash-matched no-op (same version returned, no new row).
- [x] 1.5 In `test/cancel.test.ts` (pure, no DB): `compileProcessBody` on a body
      with an extra unknown key returns a body without the key, on BOTH exits —
      the authored path and the already-compiled (`publishedProcessBody`) early
      return. Run the new tests, confirm each fails on current code for the
      stated reason.

## 2. Fix compile

- [x] 2.1 `src/schema/compile.ts`: change the idempotent early return to
      `const parsed = publishedProcessBody.safeParse(body); if (parsed.success)
      return parsed.data;`.
- [x] 2.2 `src/schema/compile.ts`: capture `const parsed =
      authoredProcessBody.parse(body);` and build the sink-injected result by
      spreading `parsed` (and reading `parsed.contract` / `parsed.workflow`)
      instead of `body`.
- [x] 2.3 Confirm no comment in `compile.ts` now overclaims or underclaims —
      update the header comment to state that compile returns the validated
      parse output, so unknown authored keys never reach the hash.

## 3. Align publishBody and verify

- [x] 3.1 `src/engine/definitions.ts`: confirm the insert path's
      `definition: body` now returns the parsed body (it does once 2.x lands —
      add no redundant re-parse per design D2); adjust only if a discrepancy
      with `parseBody(row.body)` remains observable in 1.1-1.4.
- [x] 3.2 Run the FULL suite with `DATABASE_URL` set (`bun test`) — a full run
      is the signal, single-file reruns contend — and `bun run typecheck`.
      Verify the new tests pass and no existing test regressed, reading the
      verdict off named tests.

## 4. Spec sync and archive

- [x] 4.1 Validate the change (`openspec validate --change
      hash-the-parsed-body`) and sync the delta into
      `openspec/specs/definition-store/spec.md` (`/opsx:sync`).
- [x] 4.2 Archive via `/opsx:archive` once verified; commit code + specs + archive
      together per repo convention.
