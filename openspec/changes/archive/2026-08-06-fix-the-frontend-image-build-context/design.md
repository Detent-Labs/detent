# Design

## Context

Docker matches a `.dockerignore` entry against a path relative to the context
root. An entry that holds no slash and no `**` matches at the root only. So
`node_modules` on line 1 excludes `/node_modules` and nothing else.

This repository is a Bun workspace. `bun install` writes a `node_modules`
directory into each member package. It fills them with symlinks that point back
into the root store, `node_modules/.bun/`. Line 1 removes that root store. It
keeps every link that points into it.

BuildKit walks the context and follows those links. It reaches a target the
filter removed, and it stops the whole transfer:

```
invalid file request packages/form-ui/node_modules/@types/react
```

Nine sibling agent worktrees under `.claude/worktrees` carry the same shape.
The engine build stops on one of them instead. The name in the message depends
on walk order, and the cause does not.

`.git` and `test` carry the same root-anchored form. `**/dist` already carries
the recursive form. Build output is the one category that behaves today.

## Goals / Non-Goals

Goals:

- Both images build on a machine where `bun install` has run.
- Both images build on a machine that holds sibling git worktrees.
- The context holds what a build reads, and no more.
- A spec requirement pins buildability, so the defect cannot return unnamed.
- A cheap check rejects a pattern in the shape that caused this.

Non-Goals:

- No change to either Dockerfile. Both are correct.
- No real image build in the push gate. The cost is under Decision 4.
- No new base image, no new stage, no change to what either image runs.

## Decisions

### Decision 1: every recurring name gets the `**/` prefix

Three entries gain the prefix: `**/node_modules`, `**/.git`, `**/test`. A
fourth joins them, `**/.env`. A nested `.env` holds the same kind of secret as
the root one.

`**/dist` stays as it is. It is already correct, and it is the reason the
`packages/web/dist` directory never caused this.

The measured effect, taken on this working tree with a Dockerfile-specific
ignore file:

| ignore file | context transferred | outcome |
|---|---|---|
| as committed | 838 MB, then aborted | fails |
| `**/node_modules` added | 74 MB | builds |

`**/node_modules` alone restores both builds. The rest of this design covers
what that leaves behind.

### Decision 2: the agent worktree roots leave the context

`**/node_modules` fixes the build and still ships 140 MB into the image.
`.claude` holds 114 MB and `.worktrees` holds 13 MB. Each is a set of full
source copies, one per running agent.

Those directories are machine-local. Two developers get two different images
from one commit. A published image must not depend on the machine that built
it.

So `.claude`, `.worktrees` and `tmp` join the file as root-anchored entries.
They exist at the root only, and a nested one would be somebody's source file.

### Decision 3: `.env` leaves the context

Git ignores `.env`. This repository's copy holds `AUTH_JWT_SECRET`. `COPY . .`
puts it in the engine image.

The running container reads its environment from the deployment, so the file
changes no behavior. It is a secret at rest in a published image, which is
enough on its own.

`openspec` leaves too, on the size argument alone. It is 11 MB of the 13 MB
that survives every other exclusion, and no runtime path reads it.

Measured result, with all of the above applied:

| measure | before | after |
|---|---|---|
| context transferred | 838 MB, then aborted | 255 kB |
| image tree at `/app` | never reached | 13 MB |
| `.env` in the image | present | absent |

`bun install --production --frozen-lockfile` then succeeds inside the image.
The real `docker/frontend.Dockerfile` produces a bundle whose
`connect-src` and whose JavaScript both carry the `VITE_API_URL` passed at
build time.

### Decision 4: the check is a pattern lint, not a build

`CLAUDE.md` asks every invariant to ship with a test that rejects a violating
input. Three candidates answered that here.

**A real `docker build` in the push gate.** Rejected. It needs a Docker daemon
on the host, and the four host-stage gates deliberately need only git and a
shell. The failing engine build measured above spent 63 seconds on context
transfer alone, before any instruction ran. A full frontend build adds an
install and a Vite run on top.

**A tree walk under a copy of Docker's matcher.** Rejected. It reproduces
BuildKit's `patternmatcher` semantics in TypeScript. A copy of somebody else's
matcher drifts from the original, and nothing here would notice the drift.

**A lint over the pattern text.** Chosen. `test/dockerignore.test.ts` runs
under `bun test`, so `scripts/gates/silent-green.sh` already carries it. It
holds two parts.

Part one reads the tree. It walks the working tree, skipping any directory the
file already excludes. It collects each directory name that appears at more
than one depth. It then fails on any such name that `.dockerignore` lists as a
bare entry, and it prints that entry.

Part two names its entries. The file must list `**/node_modules`, `**/.git`,
`**/.env`, `.claude` and `.worktrees`. The spec pins these five, so the lint
asserts them by name.

The committed pre-fix text is the violating input. Part one is a pure function
over a pattern list and a set of observed paths. The test feeds it that text
and asserts it reports `node_modules`.

### What the lint does not cover

Four gaps, stated so a reader does not over-trust a green run.

1. It runs no build. A wrong base image tag, or a `COPY` of a path that does
   not exist, stays invisible to it.
2. It reads pattern shape, not Docker's matching semantics. It takes on faith
   that `**/x` matches at every depth. This change measured that once. The
   lint does not measure it again.
3. Part one is vacuous on a tree that has no nested copy of a name. A fresh
   clone with no `bun install` sees `node_modules` zero times. Part two covers
   the five named entries on such a tree, and nothing covers the rest.
4. It learns no new name. If a tool starts writing `.cache/` at the root
   tomorrow, both parts stay green and the context grows again.

The manual build in `tasks.md` answers gap 1 and gap 2. That build is a task,
not a gate. The requirement records its command, so the next reviewer can
repeat it.

## Risks / Trade-offs

**`**/test` now excludes a nested `test` directory.** No build reads one.
`bunfig.toml` preloads `test/preload-db.ts`, and that runs under `bun test`
only, never under either image's `bun install` or `CMD`. Measured: the
production install completes inside the image with `test` excluded.

**`openspec` and `docs` leave the image.** A deployment can no longer read a
spec out of a running container. Nothing does that today.

**The lint can block a legitimate bare entry.** Take an entry for a name that
exists at one depth today. Part one fails it as soon as a second copy appears.
The repair is the recursive form, which is correct in that case anyway.

**A stale image already holds `.env`.** Any image built from this tree before
the fix carries the secret. The migration plan below covers it.

**`scripts/` reaches the image unchanged.** `deployment-runbook`'s spec relies
on this claim. So does `docs/runbooks/deployment.md`. Both assume
`.dockerignore` excludes no part of `scripts/`, backing the `SEED_ALLOW` row.
`scripts/` holds only `enable-hooks.sh`, `seed.ts` and `gates/`. None matches a
new or changed pattern. A directory listing confirms it: no new pattern in
this change touches `scripts/`.

## Migration Plan

This change touches no data, no schema and no running instance. Three steps, in
order.

1. Land the ignore file and the lint together. A commit that lands one alone
   leaves the tree in a state the other rejects.
2. Rotate `AUTH_JWT_SECRET` if any image built from this repository reached a
   registry. Confirm that answer before skipping the step. The aborted builds
   above produced no image. A build on a clean clone, before anyone ran `bun
   install`, would have produced one.
3. Rebuild and republish both images from the fixed tree. An image built before
   the fix holds a different tree than an image built after it, from the same
   commit.

## Open Questions

- Should the push gate grow a fifth host-stage check that runs
  `docker build` when a daemon answers, and skips when none does? A skipping
  gate reports green for two different reasons. That is the outcome
  `no-silent-green` exists to stop. Left out of this change.
- The in-flight change `gate-the-production-build` puts `bun run build` into
  `bun run check`. That gate catches a Vite bundling defect. It runs no
  `docker build`, so it does not overlap with the lint here. The two touch
  different capabilities and different scripts.
- `examples/` stays in both images. It is 1 MB and the engine reads no file
  from it at runtime. Removing it is a separate size argument, not a
  correctness one.
