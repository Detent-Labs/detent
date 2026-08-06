## 1. The build script

- [x] 1.1 Add a `build` script to the root `package.json`. Its body is
  `bun run --filter './packages/*' build`, mirroring the `typecheck` script
  beside it.
- [x] 1.2 Run `bun run build` in the devcontainer. Confirm it builds
  `packages/web`, skips `packages/form-ui`, and exits 0.

## 2. The check command

- [x] 2.1 Put `bun run build` into the root `check` script, between
  `bun run typecheck` and `bun test`.
- [x] 2.2 Confirm the pre-push hook needs no change. It runs `bun run check`
  in the container at stage 3, so it gains the build with the script.

## 3. Mutation test on a copy

- [x] 3.1 Copy the tree outside the shared working tree. `CLAUDE.md` forbids
  mutation testing in place.
- [x] 3.2 On that copy, revert `ad428bc`, so `packages/web/src/main.tsx`
  carries the top-level `await` again.
- [x] 3.3 Run `bun run check` on the copy. Confirm the build step stops, and
  confirm the message names the target and the top-level await.
- [x] 3.4 Record whether the typecheck still reports green on that copy. That
  is the measurement the proposal's argument rests on.

## 4. The silent-green gate reads the new output

- [x] 4.1 Capture a full `bun run check` run to a file, the way the hook does.
- [x] 4.2 Run `sh scripts/gates/silent-green.sh <that file>`. Confirm it
  passes, and that the build output changed neither the database line nor the
  skip count.

## 5. Documentation

- [x] 5.1 Extend CLAUDE.md's Verification section, first bullet only. Fold
  `bun run build` between the typecheck and the full `bun test` run, matching
  `check`'s new order. The bullet becomes: `bun run typecheck`, then `bun run
  build`, then the full `bun test` with `DATABASE_URL` set. Do not add a
  fifth bullet; the section stays at four checks.
- [x] 5.2 Change `README.md` (~line 115, "both the typecheck and the suite")
  and `docs/current-state.md` (~line 1616, "typecheck, then bun test"). Name
  the production build as one of `bun run check`'s steps in both.
- [x] 5.3 At archive/sync time, append to the base spec's Purpose sentence:
  "...installs, tests, typechecks and builds the project."
- [x] 5.4 Run the antislop linter over every Markdown file this change touched.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer. Report what it printed.
- [x] 6.2 Run `bun run build` in the devcontainer. Report the exit code and
  the elapsed time.
- [x] 6.3 Run the FULL `bun test` in the devcontainer, with `DATABASE_URL`
  set. Report the pass count and the skip count. A single-file rerun is not
  the signal.
- [x] 6.4 Run `bun run check` end to end. Confirm the three steps run in the
  order the spec states.
- [x] 6.5 Run `git diff --check`, then `git ls-files --eol` on the changed
  files. Read the `w/` column for CRLF.
- [x] 6.6 Push against the real hook. Confirm the push proceeds, and report
  how long the hook took.
