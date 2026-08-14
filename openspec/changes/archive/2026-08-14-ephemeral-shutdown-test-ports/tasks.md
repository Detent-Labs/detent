## 1. The spawn helper

- [x] 1.1 Drop the four port constants from `test/http-shutdown.test.ts`.
- [x] 1.2 Spawn the child with `PORT: "0"`, so the operating system assigns
  the port.
- [x] 1.3 Buffer the child's stdout from the spawn. A stream reads once, and
  the tests read it again after exit.
- [x] 1.4 Read the bound port off the `HTTP server listening` line, matching
  on `msg` and reading `port`.
- [x] 1.5 Return the process, the port, and a reader that awaits the stream's
  end before it returns the text.
- [x] 1.6 Drop the `/livez` poll. The startup line is the readiness signal.
- [x] 1.7 Keep a deadline on waiting for that line, so a child that never
  starts fails with a stated reason.

## 2. The tests

- [x] 2.1 Point the in-process test at `PORT=0`, and read `server.port` off
  the handle `startHttpServer` returns.
- [x] 2.2 Wrap each end-to-end test's body after the spawn in `try`, with a
  `SIGKILL` in `finally`.
- [x] 2.3 Read the buffered stdout in all three, where they read
  `new Response(proc.stdout).text()` before.
- [x] 2.4 Leave every assertion about shutdown as it stands. This work
  changes how a test binds, not what it proves.
- [x] 2.5 Give `test/schema-bootstrap.test.ts` the same treatment. It binds
  48213 and 48214 through `startHttpServer`.
- [x] 2.6 Read each server's port off the handle there, and delete the comment
  claiming a distinct number cannot collide.

## 3. Proving it

- [x] 3.1 Run `test/http-shutdown.test.ts` alone, three times running. All
  three pass.
- [x] 3.2 Leave a child from a killed run alive, then run the file again. It
  passes, and the second child takes a different port.
- [x] 3.3 Confirm no child outlives the run: no `server.ts` process remains
  after the file finishes.
- [x] 3.5 Hold 48213 and 48214 with strays, then run
  `test/schema-bootstrap.test.ts`. It passes.
- [x] 3.4 Break one assertion on purpose, on a copy, and confirm the `finally`
  still reaps the child. Commit to a branch, or work in a copy. Agents share
  this tree, and `CLAUDE.md` bans `git stash`.

## 4. Documentation

- [x] 4.1 Record the defect and its fix in `docs/current-state.md`, under the
  toolchain.
- [x] 4.2 Leave `ROADMAP.md` alone. It records product stages, and this fixes
  a test.

## 5. Verification

- [x] 5.1 `bun run typecheck`, then `bun run build`.
- [x] 5.2 Full `bun test` with `DATABASE_URL` set. Read the skip count beside
  the pass count.
- [x] 5.3 The antislop linter over every Markdown file this work touched.
- [x] 5.4 `git diff --check`, and `git ls-files --eol` for a CR in the `w/`
  column.
- [x] 5.5 No browser check. This work reaches no UI.
