## Context

`packages/web` is the one package that writes a bundle. The engine serves that
bundle from `WEB_ROOT`. Nothing in the repository's routine ever builds it.

The pre-push hook runs three stages. Stage 1 holds the four host gates. Stage 2
holds the devcontainer preflight. Stage 3 runs `bun run check` in the container,
then the lockfile and silent-green gates.

`bun run check` is `typecheck && test && test:tz`. That command is also what
`CLAUDE.md` names in its verification section. A contributor runs it by hand,
and the hook runs the same one.

So a build defect has three ways past. The typecheck does not bundle. The suite
does not bundle. No gate bundles either.

## Goals / Non-Goals

Goals:

- A frontend that does not build cannot reach `main` through the hook.
- The manual verification path gains the same check as the hook.
- The check adds no script anyone has to maintain.

Non-Goals:

- Catching a bundle that builds and then fails in a browser. That needs a real
  browser, and `CLAUDE.md` already demands one for a UI change.
- Bundle size budgets, or any other build-output assertion.
- A hosted CI build. `development-toolchain` forbids a hosted-CI workflow for
  this repository, and that rule stands.
- Building `packages/form-ui`. It ships source only, by design.

## Decisions

### The build joins `check`, not `scripts/gates/`

`scripts/gates/` holds detectors this repository wrote. Each one reads git
output, applies a rule, and prints the rule name with the files that broke it.
Each exists because no off-the-shelf command covers its class.

The build needs no detector. `vite build` is the command that ships the
frontend. It is not a proxy for the defect. It is the event itself. A build that
stops names the file, the line and the reason. The proposal quotes one such
message. A wrapper script would add maintenance and report less.

`check` is also the right home for a second reason. It is the command
`CLAUDE.md` names for a contributor. The hook runs the same command. One word
added to `check` covers both paths. A build placed in the hook alone would
leave the manual path blind.

### Order: typecheck, then build, then the suite

The hook already runs its stages cheapest first. The same rule applies inside
`check`. The typecheck is the fastest of the three. The build follows. The two
suite runs come last.

That order costs nothing on a green push, since the total stays the same. On a
red one it shortens the wait. A broken build now stops the push in under a
minute, rather than after the whole suite.

### The root script fans out over the workspace

The new script is `bun run --filter './packages/*' build`, which mirrors the
existing `typecheck` script. Naming `web` alone would work today. The filter
form covers a second bundling package without another change.

`packages/form-ui` carries no `build` script. Measured in the devcontainer: the
filter skips it, runs `web build`, and exits 0.

### The build writes its normal output directory

`vite build` writes `packages/web/dist`, which is also what `WEB_ROOT` serves.
Vite clears that directory first, so a page load during the build window fails.

A temporary output directory would avoid that window. This design rejects it.
The value of the check is that it runs the same command production runs. A
fresh `dist` is what a contributor wants anyway, and a push already blocks
their other work for minutes.

### `push-gate-checks` gets no delta

That capability's purpose covers the mechanical detectors the hook runs beside
the typecheck and the suite. The build joins that pair, inside `check`. It does
not join the gate list. So its requirement belongs in `development-toolchain`,
which owns `check` and the hook.

### Why this class earns a gate, where four others do not

`CLAUDE.md` names four defect classes it leaves ungated, each with a reason.
Read them together and one reason repeats.

| class | why no gate |
|---|---|
| stale UI state after a mutation | needs a real browser |
| orphaned exports after a refactor | needs TypeScript reference analysis; a grep detector flags 76 of 786 exports |
| stale roadmap status | no reliable mapping from a change name to a stage line |
| off-by-one bounds | one instance, and no general detector |

In every one of those four, the detector is missing, costly, or wrong. That is
the bar the table sets. It is a bar about detectors, not about defects.

Here the detector already exists, and it ships the product. It cannot report a
false finding: a build that stops is a build that stops. It covers its whole
class rather than a pattern list somebody keeps current.

The table's other half says each gate covers a class this repository saw two or
more times. This class has one instance, the same count off-by-one
bounds has. Two things separate them.

First, coverage. On 2026-08-06 the typecheck, 2070 tests and six gates all
reported green, while the deployable artifact did not exist. Every check the
repository owns passed, and the product was broken. That is the strongest
evidence a coverage hole can offer.

Second, the recurrence count means nothing here. Nothing in the routine ever
shows this class. The only path to discovery was a contributor building by hand
to open a browser. A class with no feedback has no rate anyone can count. Its
one recorded instance is a floor, not a measurement.

## Risks / Trade-offs

**The hook runs longer.** Measured in the devcontainer: 28 seconds for the
build alone, and 44 seconds under concurrent load. The suite runs about 65
seconds, and `check` runs it twice. Add the typecheck, the frozen install and
the preflight, and the hook already takes several minutes. The build adds
roughly half a minute to that. Accepted: a broken `main` costs more than 30
seconds per push.

**The silent-green gate reads `check` output.** That gate greps two literals
anchored to line start, `[test] database:` and `[test] DATABASE_URL unset`. It
then sums lines matching `^ *[0-9]+ skip$`. Vite writes no line of either
shape, so the build cannot corrupt the reading. Verified against the gate
source, and a task below re-checks it on a real run.

**A green build still permits a broken screen.** This check proves the bundle
exists. It proves nothing about what the bundle does. The browser rule in
`CLAUDE.md` stays the only cover for that, and this change does not weaken it.

## Migration Plan

None. The change touches a script and a spec. It adds no state, no schema and
no runtime behavior. The build passes on the tree today, so the check arrives
green, as `push-gate-checks` demands of a gate.

A contributor needs no action. `check` gains a step, and the hook picks it up
on the next push.

## Open Questions

None. This change measured the cost, the placement follows the existing stage
order, and the command already exists.
