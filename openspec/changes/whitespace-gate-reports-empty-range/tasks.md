## 1. Record the defect

- [x] 1.1 Commit a throwaway file carrying a trailing space.
- [x] 1.2 Record the output of `sh scripts/gates/whitespace.sh < /dev/null`. It
  exits 0 and says nothing.
- [x] 1.3 Record the output of the piped call. It names the file and exits 1.
- [x] 1.4 Drop the throwaway commit.

## 2. The gate

- [x] 2.1 In `scripts/gates/whitespace.sh`, print a line naming the rule when no
  file remains to check. Keep the exit at 0.
- [x] 2.2 Verify with `printf '' | sh scripts/gates/whitespace.sh`. It prints the
  line and exits 0.
- [x] 2.3 Redo the throwaway commit from 1.1. The piped call still names the file
  and exits 1. Drop the commit again.

## 3. The test

- [x] 3.1 Add `test/gates.test.ts`. It spawns the gate with empty stdin and
  asserts the line on stdout.
- [x] 3.2 Verify with `bun test test/gates.test.ts`.

## 4. The documentation

- [x] 4.1 In `CLAUDE.md`, replace the empty-stdin call with the piped form.
- [x] 4.2 Apply the delta to `openspec/specs/push-gate-checks/spec.md`.
- [x] 4.3 In the `.githooks/pre-push` header comment, replace the same call.
- [x] 4.4 Grep the three files for `whitespace.sh`. Only the piped call remains.
- [x] 4.5 Verify with `openspec validate whitespace-gate-reports-empty-range
  --strict`.

## 5. Verification

- [x] 5.1 In the devcontainer, run `bun run typecheck` and `bun run build`.
- [x] 5.2 Run the full `bun test` with `DATABASE_URL` set. Pipe the log through
  `sh scripts/gates/silent-green.sh`.
- [x] 5.3 Run the piped prose gate and the piped whitespace gate. Both pass.
