## Why

On 2026-08-06 an agent ran `docker build -f docker/frontend.Dockerfile .` as
part of a verification. The build stopped before it reached the first
instruction:

```
invalid file request packages/form-ui/node_modules/@types/react
```

Line 1 of `.dockerignore` reads `node_modules`. Docker anchors a pattern that
carries no slash and no `**` to the context root. The root `node_modules` stays
out. Every nested one goes in: `packages/web/node_modules`,
`packages/form-ui/node_modules`, and one under each agent worktree. Those
directories hold Bun's workspace symlinks. BuildKit reads one of them, fails to
resolve it inside the context, and stops.

`bun install` creates those directories. Every developer machine has them. The
frontend image therefore builds nowhere.

### The engine image fails the same way

The team asked whether `docker/engine.Dockerfile` shares the defect. It does.
`docker build -f docker/engine.Dockerfile .` on this tree ran for 63 seconds,
sent 838 MB of context, and stopped:

```
invalid file request .claude/worktrees/add-content-translation-gap-warnings/node_modules/.bin/cel-evaluate
```

Both Dockerfiles copy the whole tree with `COPY . .`, and both read the same
`.dockerignore`. The defect sits in the ignore file, not in either Dockerfile.

### Two more findings from the same measurement

Three candidate ignore files ran against this working tree. A
Dockerfile-specific ignore file beside a probe Dockerfile carried them, so
`.dockerignore` itself stayed untouched.

| `.dockerignore` | context | result |
|---|---|---|
| as committed | 838 MB and still growing | fails |
| plus `**/node_modules` | 74 MB | builds; image holds 140 MB |
| plus worktree roots, `tmp` and `.env` | 13 MB | builds; image holds 13 MB |

`**/node_modules` alone makes both images build. The 140 MB it leaves behind is
the second finding. `.claude` contributes 114 MB and `.worktrees` 13 MB. Those
are nine sibling agent worktrees. Each is a full copy of the source with its
own `.git`.
The `.git` pattern is root-anchored too, so those nine ship.

The third finding is `.env`. Git ignores it, this repository's copy holds
`AUTH_JWT_SECRET`, and `COPY . .` puts it in the engine image. A running
container reads its environment from the deployment, so the file changes no
behavior. It is a secret at rest in a published image.

### Why a spec requirement has to move

`production-docker-images` already states which paths the context excludes. Its
scenario asserts what the context holds. No requirement asserts that the build
completes on a machine where `bun install` has run. That is the property that
broke.

The engine gets a `THEN the build completes` clause. It sits inside the
requirement about production dependencies, and it names no tree. The frontend
has no such clause at all. A change that repairs the patterns and pins nothing
lets the same defect return with the next root-anchored line.

## What Changes

- `.dockerignore` excludes dependency directories, build output, git metadata
  and test directories at every depth, not at the root alone.
- It also excludes the two agent worktree roots (`.claude` and `.worktrees`),
  the scratch directory `tmp`, and `.env`.
- A new test, `test/dockerignore.test.ts`, reads `.dockerignore` and rejects a
  root-anchored pattern for a name that occurs at more than one depth. It runs
  under `bun test`, so the existing push gate carries it.
- `production-docker-images` gains a requirement that both images build on a
  tree with dependencies installed. Its context requirement names the recursive
  form and the three added entries.

Out of scope, and named so the reason survives. Neither Dockerfile changes.
Both are correct as written. The reproduction above shows the defect strikes
during context transfer, before instruction one. A real `docker build` in the
push gate stays out too; `design.md` gives its cost and what the cheaper test
misses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `production-docker-images`: the context requirement states the recursive form
  and the added entries. A new requirement covers buildability on a machine
  with dependencies installed.

## Impact

- `.dockerignore`: every pattern that names a directory occurring below the
  root gains the `**/` prefix; three entries join it.
- `test/dockerignore.test.ts` (new): the pattern lint, plus a case that feeds it
  the committed pre-fix text and asserts it reports `node_modules`.
- `docs/current-state.md`: the docker-image entry gains what the ignore file
  now excludes and why.
