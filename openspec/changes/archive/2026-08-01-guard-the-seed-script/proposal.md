<!-- antislop: allow-file passive-voice -->
<!-- A guard is described by what it refuses, not by who invokes it. Every
     spec under openspec/specs/ carries the same phrasing. -->

## Why

`scripts/seed.ts` provisions five accounts with a fixed password. The password
sits in the file, in the repository, in the script's own output. One account
holds `system:admin`.

Nothing stops the script. It runs against whatever database `DATABASE_URL`
names.

`add-database-seed-data` saw this and accepted a mitigation. Roadmap #19
records it. The script never runs on its own. Its output states that the
accounts are for local development only. The entry gives the reason for the
weak form. No production deployment path existed, so no environment signal
had a meaning to carry.

Roadmap #14 shipped that path. Stage 14a added health endpoints, 14b two
production Docker images, 14c a backup runbook. The premise expired, and the
mitigation stayed.

What remains is one mistyped `DATABASE_URL` between a seed run and a real
database.

## What Changes

- `scripts/seed.ts` reads `SEED_ALLOW`. Without a value, `main()` throws
  before `initSchema`, so a refused run writes nothing.
- The variable carries no meaning beyond consent. It is not `NODE_ENV`.
  Nothing in the repository reads that one. A first reader added here would
  define a project-wide signal as a side effect.
- One test spawns the script as a subprocess and asserts the refusal. The
  guard sits behind `import.meta.main`, so an import does not reach it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `database-seed-script`: one added requirement. Four existing requirements
  are untouched.

## Impact

- `scripts/seed.ts`: the guard, and the run command in the docstring.
- `test/seed-demo-users.test.ts`: one test.
- `ROADMAP.md`: entry #19 records that the earlier mitigation was replaced,
  and why the premise expired.
- No engine change, no schema change, no route change.

## Note on sequence

The implementation landed first, in commit `c22a46f`, judged a one-line fix
below the OpenSpec threshold. That judgement held for `scripts/seed.ts` and
failed for the capability spec, which the same commit edited directly. This
change is written afterwards to close that gap. The task list is therefore
already checked when it arrives.
