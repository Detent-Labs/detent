# Design

## Context

See `proposal.md` for why. The facts below come from runs on 2026-09-23,
made in a throwaway `oven/bun:1.3.11` container over a read-only mount of
this tree.

- `bunx oxlint@1.85.0 --report-unused-disable-directives -f unix src packages
  test scripts` finishes in about one second. It reports 119 findings. Of
  those, 92 name an `eslint-disable` directive that suppresses nothing. The
  other 27 are warnings.
- `git grep` finds 86 directive comments in code. Some comments name more
  than one rule, so oxlint counts 92 directives in them. Seven more hits sit
  in Markdown (`docs/decisions.md` and archived review records). Those are
  prose about the directives and stay.
- The 27 warnings split into five rules: 12
  `unicorn/no-useless-fallback-in-spread`, 8 `no-unsafe-optional-chaining`,
  3 `unicorn/no-useless-spread`, 2 `unicorn/prefer-string-starts-ends-with`,
  2 `no-unused-vars`. All 8 optional-chaining hits sit in `test/drafts.test.ts`
  and `test/templates.test.ts`.
- By default oxlint exits 0 on warnings. `--deny-warnings` makes a warning
  fail the run.
- `bun audit` on a copy of `package.json`, `bun.lock` and `packages/` with no
  `node_modules` reports "No vulnerabilities found" and exits 0. The
  `--audit-level=high` form also exits 0. It needs the lockfile and the
  registry. It runs without an install.
- `.githooks/pre-push` runs `bun run check` in the devcontainer. The CI
  `check` job runs the same script. A step added to `check` reaches both.
- The live `development-toolchain` spec still forbids a hosted-CI workflow.
  `add-ci-workflow` shipped `.github/workflows/check.yml` with no spec delta,
  so the clause went stale. The MODIFIED block in this change's delta fixes
  it.

## Goals / Non-Goals

**Goals:**

- `bun run lint` lands green, and stays the first step of `bun run check`.
- A dead directive cannot come back unnoticed.
- CI fails on a high or critical advisory in the lockfile.

**Non-Goals:**

- No formatter. Formatting stays as it is.
- No lint rules beyond oxlint's default correctness set. A stricter set is a
  later change, with its own findings count.
- No `react-hooks` or `typescript` plugin rules switched on. The 17
  `react-hooks/exhaustive-deps` directives go; the rule does not come back.
- DEP-1 (CodeQL, secret scanning) stays out, per the owner's ruling.

## Decisions

**D1. oxlint, not Biome.** The owner chose oxlint on 2026-09-23. It runs without
a config file. It reads `eslint-disable` comments, so it can report the dead
ones. Biome reads only its own `biome-ignore` comments and would never
see them. Biome's formatter would also rewrite a large part of the tree.

**D2. No config file.** The script passes its flags on the command line:

```sh
oxlint --deny-warnings --report-unused-disable-directives src packages test scripts
```

A `.oxlintrc.json` earns its place only once a rule gets switched on or off.
None does here.

The path list is explicit, and nothing lints the whole tree. oxlint follows
`.gitignore`, but the explicit list also keeps it out of `openspec/`,
`examples/` and `.claude/`. Those hold no code that `check` covers.

**D3. Pin exact, root dev dependency.** The root `devDependencies` gets
`"oxlint": "1.85.0"`, with no caret. With a caret, a new release could add a
default rule. A green commit would then turn red while nobody touched it.
That follows the `@marcbachmann/cel-js` precedent: a tool whose verdict must
not drift gets an exact pin. Dependabot still proposes the upgrade as a PR,
and CI shows its new findings there.

**D4. `lint` runs first in `check`.** The script becomes:

```sh
bun run lint && bun run typecheck && bun run build && bun test && bun run test:tz
```

Lint is the fastest step and needs neither the build nor the database. No
new file goes under `scripts/gates/`, and the `CLAUDE.md` gate table gets no
new row. The hook already runs `check`. `push-gate-checks` covers the scripts
in the gate table, so it gets no delta.

**D5. Fix the 27 warnings, do not excuse them.** Every one has a one-line fix
that keeps behavior the same:

- `no-useless-fallback-in-spread`: `...(x ?? {})` becomes `...x`. Spreading
  `undefined` or `null` into an object literal adds nothing and does not
  throw.
- `no-useless-spread`: `[...[a, b]]` becomes `[a, b]`.
- `prefer-string-starts-ends-with`: `/^x/.test(s)` becomes `s.startsWith("x")`.
- `no-unused-vars`: delete the binding, or rename it with a leading `_` where
  a destructure needs the slot.
- `no-unsafe-optional-chaining`: in the two test files the pattern
  destructures from `a?.b`. A destructure from `undefined` throws a
  `TypeError`, so the `?.` hides nothing. The test fails either way. Replace
  `?.` with `.`, or add a `!` where the type needs it.

An `oxlint-disable` directive is the fallback for a finding whose fix would
change behavior. Such a directive carries a reason on the same line. The
implementer reports each one they add. The 2026-09-23 run shows none that
needs it.

**D6. Delete directives by line, not by pattern.** The implementer deletes
exactly the lines oxlint reports as unused. A regex sweep over
`eslint-disable` would also hit the seven Markdown mentions. Afterwards
`git grep -n 'eslint-disable' -- src packages test scripts` prints nothing.

**D7. The audit step sits in the CI `check` job, after `bun install`.** It
runs this command in the devcontainer:

```sh
docker compose -f .devcontainer/docker-compose.yml exec -T -w /workspace app bun audit --audit-level=high
```

It therefore uses the Bun version the Dockerfile pins, like every other step.
`host-gates` has no Bun. Setting Bun up there would add a second version pin.

The audit stays out of `bun run check`, because the pre-push hook runs
`check`, and a push must not fail when the registry is down.

**D8. Excuse by id, with a comment.** `bun audit` accepts `--ignore=<id>`
with a GHSA id, and the flag repeats. An excused advisory becomes one more `--ignore` on the
step's command line. A YAML comment above it names the package and the
reason. None exists today, so the step ships with no `--ignore`.

**D9. `docs/decisions.md` marks CQ-1 and DEP-2 resolved.** It follows the
RAIL-4 form: `(resolved by add-ci-audit-and-linter)` in the bold label. The
body then says in the past tense what closed the finding. DEP-1 stays open.

## Risks / Trade-offs

- [A Dependabot upgrade of oxlint adds a default rule and fails its own PR.]
  → Intended. The PR shows the new findings. The fix lands in that PR.
- [An advisory with no fix fails CI.] → D8 excuses it by id, in a
  reviewed PR.
- [The registry's advisory endpoint is down during a CI run.] → The audit
  step fails, so the whole job goes red. A re-run clears it. An audit that
  passes when it cannot reach the registry would hide the outage.
- [Deleting directives breaks a line.] → D6 deletes exactly the reported
  lines. The typecheck and the full suite run after the deletion.
- [`...x` where `x` is not an object.] → The fix applies only where oxlint
  flags the fallback. The rule flags a fallback only when it is an empty
  literal, and TypeScript types the spread operand.

## Migration Plan

This change deploys nothing, and no data moves. A contributor runs
`bun install` once after pulling, so that the `oxlint` binary exists.
Rollback reverts the commit. `check` and the workflow then match their old
form.

## Open Questions

None.
