<!-- antislop: allow-file passive-voice -->

Every task below was completed in commit `c22a46f`, before this change was
written. See proposal.md, section "Note on sequence".

## 1. Guard the entry point

- [x] 1.1 In `scripts/seed.ts`, throw at the top of `main()` when
  `SEED_ALLOW` carries no value. Place it above `initSchema`, so a refused
  run leaves no table behind.
- [x] 1.2 Name the variable in the message, and state that the script
  creates accounts with a fixed, published password.
- [x] 1.3 Set the docstring's run command to `SEED_ALLOW=1 bun run seed`.

## 2. Cover the refusal

- [x] 2.1 In `test/seed-demo-users.test.ts`, spawn `scripts/seed.ts` with
  `SEED_ALLOW` unset. Assert a non-zero exit, and the variable's name in
  stderr.
- [x] 2.2 Record in a comment why the test spawns a subprocess. The guard
  sits behind `import.meta.main`, so an import does not reach it.

## 3. Sync the surrounding prose

- [x] 3.1 Add the requirement to
  `openspec/specs/database-seed-script/spec.md`.
- [x] 3.2 In `ROADMAP.md` #19, replace the recorded mitigation. State that
  stage 14 shipped the deployment path its premise depended on.

## 4. Verify

- [x] 4.1 `bun run check` in the devcontainer. Result: 1533 pass, 0 fail,
  101 files, no skips.
- [x] 4.2 Confirm the refusal by hand. A run without the variable exits
  non-zero and names it.
- [x] 4.3 Confirm the accepted path by hand, against the devcontainer
  database. `SEED_ALLOW=1 bun run seed` publishes and reports per process.
- [x] 4.4 `openspec validate` passes.
