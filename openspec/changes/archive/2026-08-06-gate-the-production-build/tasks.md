## 1. The build script

- [ ] 1.1 Add a `build` script to the root `package.json`. Its body is
  `bun run --filter './packages/*' build`, mirroring the `typecheck` script
  beside it.
- [ ] 1.2 Run `bun run build` in the devcontainer. Confirm it builds
  `packages/web`, skips `packages/form-ui`, and exits 0.

## 2. The check command

- [ ] 2.1 Put `bun run build` into the root `check` script, between
  `bun run typecheck` and `bun test`.
- [ ] 2.2 Confirm the pre-push hook needs no change. It runs `bun run check`
  in the container at stage 3, so it gains the build with the script.

## 3. Mutation test on a copy

- [ ] 3.1 Copy the tree outside the shared working tree. `CLAUDE.md` forbids
  mutation testing in place.
- [ ] 3.2 On that copy, revert `ad428bc`, so `packages/web/src/main.tsx`
  carries the top-level `await` again.
- [ ] 3.3 Run `bun run check` on the copy. Confirm the build step stops, and
  confirm the message names the target and the top-level await.
- [ ] 3.4 Record whether the typecheck still reports green on that copy. That
  is the measurement the proposal's argument rests on.

## 4. The silent-green gate reads the new output

- [ ] 4.1 Capture a full `bun run check` run to a file, the way the hook does.
- [ ] 4.2 Run `sh scripts/gates/silent-green.sh <that file>`. Confirm it
  passes, and that the build output changed neither the database line nor the
  skip count.

## 5. Documentation

- [ ] 5.1 Add the build to the verification list in `CLAUDE.md`. The list names
  the checks a change must pass before anyone calls it done.
- [ ] 5.2 Add a row for the build to `CLAUDE.md`'s account of the four ungated
  defect classes. The class now has a check, so leaving it listed there would
  teach the wrong thing.
- [ ] 5.3 Run the antislop linter over every Markdown file this change touched.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer. Report what it printed.
- [ ] 6.2 Run `bun run build` in the devcontainer. Report the exit code and
  the elapsed time.
- [ ] 6.3 Run the FULL `bun test` in the devcontainer, with `DATABASE_URL`
  set. Report the pass count and the skip count. A single-file rerun is not
  the signal.
- [ ] 6.4 Run `bun run check` end to end. Confirm the three steps run in the
  order the spec states.
- [ ] 6.5 Run `git diff --check`, then `git ls-files --eol` on the changed
  files. Read the `w/` column for CRLF.
- [ ] 6.6 Push against the real hook. Confirm the push proceeds, and report
  how long the hook took.
