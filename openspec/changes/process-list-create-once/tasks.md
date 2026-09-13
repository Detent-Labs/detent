## 1. The in-flight guard

- [ ] 1.1 Add a `describe("createInFlightGuard")` block to
  `packages/web/test/studio-processListLogic.test.ts`. Hold the first write
  open with a promise the test resolves or rejects by hand. The block holds the
  five tests below. Each comes from design.md's decision "A helper owns the
  hold, with a synchronous check". Verify: the full `bun test` fails on this
  file before 1.2 lands.
  - A second call for a held key resolves `false`, and its write never runs.
  - A rejected write frees its key and rethrows the same error. A later call
    for that key runs its write.
  - A resolved write keeps its key held. A later call for that key resolves
    `false`.
  - A held key leaves a call for another key free to run its write.
  - The `onHeldChange` callback receives a new set object after each add and
    each free.
- [ ] 1.2 Export `createInFlightGuard` from
  `packages/web/src/areas/studio/screens/processListLogic.ts`, as design.md
  specifies. Its doc comment names the double press it stops. The comment
  also states why the check runs before the first `await`. Verify: the five
  tests from 1.1 pass in the full `bun test`.

## 2. The process list

- [ ] 2.1 Add the `creating` state and the guard to
  `packages/web/src/areas/studio/screens/ProcessesScreen.tsx`. Follow
  design.md's decision "The screen mirrors the held set into state". Move the
  read, the write and the `navigate` call inside `createDraft` into one
  callback for `run`. The `catch` keeps calling `fail(err)`. Set
  `disabled={creating.has(row.processId)}` on the row's "Create draft" button.
  Verify: `bun run typecheck` passes in the devcontainer.
- [ ] 2.2 Keep the button's label "Create draft", with no `aria-busy`. Rewrite
  the doc comment above `createDraft` so it names the hold. Verify:
  `bun run build` passes in the devcontainer. The diff touches no file under
  `packages/web/src/i18n/`.

## 3. Documentation

- [x] 3.1 Add the entry "Create draft writes one draft per press
  (`process-list-create-once`)" to the end of `docs/browser-checks.md`. Take
  its steps and pass lines from design.md's decision "The browser check slows
  the write". Carry its three `run-code` functions and its dev tools
  alternatives too. Its source line names task 4.1 of
  `process-list-create-once`. Verify: the antislop count on that file does not
  rise.
- [x] 3.2 Delete the FORMS-10 bullet from `docs/decisions.md`. Keep every other
  `FORMS-n` tag as it stands. Verify: a `git grep` for FORMS-10 under `docs/`
  prints nothing. No citation of a `decisions.md` line number moved with the
  deletion. The antislop count on that file does not rise.
- [x] 3.3 Add one paragraph to the seeding entry in `docs/current-state.md`,
  near line 2700. It names `createInFlightGuard` and the hold on "Create
  draft" until the edit screen opens. First confirm the name with
  `git grep -n createInFlightGuard -- packages/web/src`. Verify: the antislop
  count on that file does not rise.

## 4. Browser check

After groups 1 and 2, run `bun run --filter './packages/web' build` in the
devcontainer. Seed the database. Open `http://127.0.0.1:<PORT_APP>/studio/`,
with the port from sourcing `scripts/worktree-env.sh`. If the server answers
JSON 404, run `bash scripts/dev-up.sh` again.

Pass `-s=process-list-create-once` on every `playwright-cli` call. Use
`run-code` with `page.evaluate` for DOM reads, since the worktree guard refuses
`eval`. Print a known value first as a positive control. Steps 5 and 7 raise a
native confirm. Accept it with `dialog-accept`, since it blocks every reader
until then.

- [x] 4.1 Run the seven steps of the entry from 3.1. Record the value each pass
  line reads, beside its step number, in the task report.
- [x] 4.2 Run `/impeccable critique` and `/impeccable audit` against
  `/studio/`. Run the impeccable detector once over `ProcessesScreen.tsx`. The
  app's content security policy blocks the overlay, so report it as skipped.
  Resolve each finding the new code causes.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer. Verify: it exits 0.
- [ ] 5.2 Run `bun run build` in the devcontainer. Verify: it exits 0.
- [ ] 5.3 Run the full `bun test` with `DATABASE_URL` set, in the
  devcontainer. Capture its output with `bun test 2>&1 | tee /tmp/t.log`.
  Then run `sh scripts/gates/silent-green.sh /tmp/t.log`. Verify: no test
  fails by name, and the gate passes.
- [ ] 5.4 Run both gates on the host once every commit lands, since both
  read committed content. The devcontainer has no antislop. Run
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Then
  run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
  Verify: neither prints a SKIPPED line, and both exit 0.
