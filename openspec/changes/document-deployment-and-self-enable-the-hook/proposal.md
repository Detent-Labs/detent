## Why

Three findings in the 2026-08-01 code review (`docs/CODE_REVIEW.md`) share
one shape. Each one waits on a human to remember something.

**The push gate waits for a manual step (TEST-1).** The hook runs the
typecheck, the suite and the mechanical gates. It runs none of that in a
clone where nobody typed the `git config core.hooksPath` line. The spec
states that step as a per-clone instruction. So a fresh clone pushes with no
gate at all, and reports nothing.

**No document says what a deployment needs (DOC-1).** The engine reads
sixteen environment variables today. The changes proposed beside this one add
four more. Nothing lists them. Nothing says which are mandatory, what each
one defaults to, or which of those defaults are unsafe. The `docker/`
directory ships two images with no runbook for what to set when running
them. The directory `docs/runbooks/` exists and holds one document, for
backup and restore.

**Nothing watches the dependencies (DEP-1).** No configuration, and no gate,
runs `bun audit`. The repository commits its lockfile, and the production
image builds `--frozen-lockfile`. That covers reproducibility. It says
nothing about a published advisory.

The review's answer to all three was a hosted CI workflow. The owner has
already closed that answer. Commit `07b9a05` deleted the workflow this
repository had. The
archived change `2026-07-31-specify-the-real-push-gate` records the reason.
The owner does not want a hosted service executing this repository, and
Actions is off. This change takes what remains of the three findings, and
handles it where that decision leaves room.

## What Changes

- A `prepare` script in the root `package.json` points `core.hooksPath` at
  `.githooks`. Every contributor already runs `bun install`, and that run now
  enables the gate. The script does nothing and fails nothing when `.git` is
  absent, so the production image build stays green.
- A new `docs/runbooks/deployment.md` lists every environment variable the
  engine and the images read. Each entry gives the meaning, whether the
  variable is mandatory, the default, and whether that default is safe to
  ship.
- That runbook holds the two operational rules this repository has no other
  home for. First, a proxy in front of the engine SHALL overwrite
  `X-Forwarded-For`, which `harden-local-account-sessions` needs before
  `TRUST_PROXY` means anything. Second, a maintainer runs `bun audit` on a
  stated cadence and records what it said.

Out of scope, and named so the reason survives. This change adds no gate for
`bun audit`. Each gate in `.githooks` covers a defect class this repository
produced two or more times. A stale dependency is not yet one of them. A gate
that reaches the network on every push also breaks a push made offline.

## Capabilities

### New Capabilities

- `deployment-runbook`: the document a deployment reads before it runs either
  image, covering every environment variable and the two operational rules
  above.

### Modified Capabilities

- `development-toolchain`: enabling the pre-push hook stops being a step each
  clone performs by hand.

## Impact

- `package.json`: one `prepare` script.
- `scripts/enable-hooks.sh`: the script that `prepare` runs.
- `docs/runbooks/deployment.md`: new.
- `README.md`: the setup section, which today tells a reader to run the
  `git config` line.
- `docs/current-state.md`: the toolchain entry.
- No source file changes, and no test changes.
