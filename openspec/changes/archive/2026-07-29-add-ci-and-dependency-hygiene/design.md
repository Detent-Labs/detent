## Context

`development-toolchain` fixed the toolchain (Bun for run/install/test, `tsc`
for typechecking, everything inside the devcontainer) and left *when* those
commands run unspecified — implicitly, "when a contributor remembers". That
was survivable while the repo was one person's working tree. It stops being
survivable the moment a change lands that depends on a green suite meaning
something: every security fix in this review's batch does.

The database-skip behavior is what makes the gap sharp rather than merely
untidy. `bun test` with no `DATABASE_URL` does not fail — it prints a pass
count that omits the majority of the suite. A human who has read `CLAUDE.md`
knows to set the variable; CI is the only mechanism that makes the knowledge
unnecessary.

The dependency and documentation items ride along because they share the
property: the manifest and the docs assert things the code contradicts, and
nothing checks.

## Goals / Non-Goals

**Goals:**

- Every push and pull request runs typecheck plus the full suite against a
  real Postgres, and fails loudly rather than skipping quietly.
- The manifests describe what the code actually needs at runtime.
- Two tests stop passing for the wrong reason.

**Non-Goals:**

- Release automation, publishing, container image builds, or deployment.
  ROADMAP stage 14 owns packaging; this change runs checks, it does not ship
  anything.
- Coverage measurement or thresholds. A coverage number would be a new metric
  to argue about; the repo's existing rule ("every invariant ships with a
  rejecting test") is the standard, and it is reviewed by humans.
- Linting or formatting enforcement. Neither is configured in the repo today,
  and adding a formatter in a CI change would reformat the tree in the same
  commit that introduces the gate.
- Caching, matrix builds, or multi-version testing. One Bun version (the
  Dockerfile's pin) and one Postgres version (16, matching compose) is the
  supported combination; testing others would assert support that does not
  exist.
- Auditing dependencies for advisories (`bun audit`). Worth doing, and a
  separate decision about what a failing audit should do to a PR.

## Decisions

**GitHub Actions.** The remote is GitHub (`gh` is the documented CLI in
`CLAUDE.md`'s environment notes), so any other runner would need
infrastructure that does not exist. The workflow is deliberately one job with
four steps: a second job would need a strategy for sharing the database
service and would buy nothing at this size.

**A `postgres:16` service with the compose credentials, not a container-in-
container devcontainer run.** The devcontainer exists so a contributor's
machine matches; CI does not need the editor, Claude Code, or the volume
mounts — it needs Bun at the pinned version and a Postgres 16 with the same
credentials. Running the devcontainer itself in CI would be slower and would
couple the gate to a Dockerfile that changes for reasons unrelated to testing.

**Fail the job when `DATABASE_URL` is unset.** An explicit guard step, not a
comment. The whole point is that the *absence* of the variable is invisible in
the output otherwise: a green with 546 skipped tests looks like a green. The
guard makes a misconfigured workflow fail as a workflow error rather than
passing as a test result.

**Pin Bun in CI to the Dockerfile's `BUN_VERSION`.** Two pins that can drift
is worse than one; the workflow reads the value or repeats it with a comment
naming the Dockerfile as the source. Anything else reintroduces the version
skew `CLAUDE.md` already records as an observed problem.

**`zod` to `dependencies`, and declared by the two packages that rely on
hoisting.** The root move is the actual fix; the two package declarations are
what stop the fix from depending on Bun's workspace hoisting continuing to
work the way it does today. `peerDependency` for `form-ui` matches how it
already declares react and expresses the truth: `form-ui` is source-only and
is compiled by its consumer's build, so the consumer supplies the copy.

**Pin `@marcbachmann/cel-js` exactly, and say why next to the rule it
protects.** The pin is cheap; the reason is the valuable part. The failure
mode this guards against is not a crash but a silent semantic shift in
already-published, immutable definitions — guard totality converts an
evaluation error into `false`, and the transform path converts it into a
recorded drop, so a regression manifests as instances quietly parking or
rerouting. Recording that beside `CLAUDE.md`'s "one CEL library" rule is what
makes a future upgrade a deliberate act.

**Write the two race tests against the existing spec scenario rather than
adding a requirement.** `assignment-claim-enforcement` already specifies that
two actors racing to claim resolve to exactly one winner. The gap is a test
gap, so the fix is a test, and no spec text changes. The test asserts three
things — exactly one fulfilled, one rejected with `AlreadyClaimedError`, and
exactly one `assignment.claimed` row in `instance_events` — because the third
is what proves the outcome at the record level rather than at the API level.

**The tightened cancel-authorization assertion pins 500, not 404.** The
property under test is that a role-holding caller's failure differs from a
role-lacking caller's, which is what `cancelInstance`'s non-disclosure
ordering was written to preserve. The exact status is whatever the
`http-wrapper` spec says for an untyped not-found — 500 today, and
`correct-api-error-responses` keeps it 500 while typing the error. If that
change lands first, this assertion is written against the typed error; the
pairing with the existing role-less 403 test is what carries the meaning
either way.

## Risks / Trade-offs

- **CI may be red on the first run** → Run the exact commands locally first,
  in the devcontainer, and land any fix before the workflow. A gate that
  arrives red teaches people to ignore it.
- **CI runtime is dominated by the DB suites** → Accepted; they are the point.
  If it becomes painful, the answer is parallelising by suite, not skipping
  the database.
- **Pinning cel-js exactly means security patches need a manual bump** → True,
  and the intended trade: an upgrade should be a commit someone reviewed and
  re-ran `test/cel.test.ts` against, given that the failure mode is silent.
- **Moving `zod` to `dependencies` slightly grows a production install** — by
  a package that is already required at runtime, so this corrects the size
  rather than increasing it.
- **The interleaved-race tests are the flakiest kind of test in the suite** →
  Mitigated by modelling them on the four that already exist and pass
  reliably, and by asserting outcomes (`exactly one fulfilled`) rather than
  timing.
- **`bun install --frozen-lockfile` will fail** if the manifest edits are not
  accompanied by a regenerated `bun.lock` → Explicitly a task step.

## Migration Plan

1. Make the manifest and documentation corrections first, regenerate
   `bun.lock`, and confirm `bun install --frozen-lockfile` succeeds.
2. Add the two race tests and the tightened assertion; confirm the full suite
   is green with `DATABASE_URL` set.
3. Land the workflow last, so its first run is against a tree already known to
   pass.
4. Rollback is deleting the workflow file; nothing else depends on it.

## Open Questions

- Should CI also run a `bun audit` and, if so, should a finding fail the build
  or only annotate it? Deferred deliberately: the answer depends on how noisy
  it is against this dependency set, which nobody has measured.
- Should the workflow gate merges (a required check) or only report? A
  repository-settings decision rather than a file in the tree, and one for the
  maintainer.
