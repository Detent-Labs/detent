# Design

## Context

See `proposal.md` for why. The facts below come from runs on 2026-10-12 at
`origin/main` 2d3cfeb0 in this worktree's devcontainer.

- `src/runtime/` holds eleven `.ts` files. `git grep` for
  `body->>'(processId|version|status|currentStepId|startedBy)'` finds nothing in
  `src/runtime/`, `src/engine/definitions.ts` or `src/engine/reporting.ts`.
- Other files in `src/engine/` still hit that grep. They are the sites that the
  `rebuild-instance-expression-indexes` design keeps on purpose. The widened
  guard must not scan them.
- `examples/` holds nine `.json` files. Seven are wrappers with a
  `definitionHash` on line 4. `subprocess-credit-check-child.json` and
  `subprocess-loan-parent.json` are bare bodies.
- Recomputing `definitionHash(compileProcessBody(raw.definition))` for each
  wrapper shows `it-offboarding.json` and `it-onboarding.json` stale. The other
  five match.
- `src/http/server.ts` builds its route table as a local `routes` constant.
  Every row has the shape `{ method: "X", segments: seg("/path"),`.
- A regex over that file reads 90 rows. With
  `createServer(..., devHeaderResolver)` and no credentials, 88 rows answer 401.
  `GET /ui-strings` answers 200. `POST /auth/login` answers 404, because the
  table registers it only when a JWT secret exists.
- The table has no export. The OPTIONS branch of the dispatcher answers per
  path, so HTTP alone cannot list the table.
- `docs/openapi.yaml` writes paths as `/instances/{instanceId}`. The
  `http-api-documentation` spec writes a route as `POST /instances/:id/submit`.
- `scripts/gates/pass-floor.txt` stands at 5206. Its header says that a growing
  suite leaves it stale-low and that nothing forces a raise.

## Goals / Non-Goals

**Goals:**

- Each repaired guard fails when its defect returns. A mutation on a copy
  proves it, one per guard.
- Every guard reads the set it guards from the tree.

**Non-Goals:**

- A change under `src/`. TEST-1 reads the table's source text and exports
  nothing.
- A new invariant, a schema change, or a change to a hash in
  `PRE_CHANGE_HASHES`.
- A scan of `src/engine/` beyond the two modules that the guard names today.
- Coverage of the routes outside the table: `/livez`, `/readyz` and `/metrics`.
  `/metrics` has its own bearer test in `test/metrics.test.ts`.

## Decisions

### D1. The index guard reads a directory (G-3)

`REWRITTEN_MODULES` becomes the `.ts` files of `src/runtime/` read with
`readdirSync`, plus `engine/definitions.ts` and `engine/reporting.ts`. The test
also asserts that the set holds more than those two engine modules. An empty
directory read then fails. `PROMOTED_KEYS` stays.

*Alternative: list the four reader files by name.* That repeats the defect. The
next split would move the readers to a fifth file.

### D2. One test checks every example's hash (G-4)

A new `describe` in `test/view-layout-hash.test.ts` iterates `examples/` with
`readdirSync`. It parses each file. A file with a `definitionHash` must equal
`definitionHash(compileProcessBody(raw.definition))`. A file without one must
have a key in `PRE_CHANGE_HASHES`. A file that fits neither case fails.

The two stale wrappers get a regenerated hash. The coordinator ruled this in
scope on 2026-10-12. Only line 4 of each file changes. The implementer
recomputes the value with the compiled-body hash. The implementer then rewrites
the line with a text-tool replacement, since a Python write emits CRLF on Windows.

`test/validate.test.ts` keeps its `expense-approval.json` test. That test also
asserts bare hex with no prefix. This change leaves it as it is.

*Alternative: extend `PRE_CHANGE_HASHES` to nine rows.* The table records the
parse hash of a bare body. A wrapper already stores the compiled hash. A second
literal per wrapper would copy a value that the file holds.

### D3. The round trip reads the directory (G-9)

`EXAMPLES` becomes `readdirSync("examples")` filtered to `.json`, the way
`compile-validation.test.ts` reads it. A separate test asserts that the list
has members.

### D4. Three tests assert their outcome (G-10)

- Body size: the implementer posts the same request once and records the status
  and `error.type` of the answer. The test pins both. The comment that claims a
  malformed process body then holds.
- Freezing is per key: after the (1→4) migration, registering (1→4) again
  rejects with the `already applied` message of the sibling test above it.
  Registering (2→4) with a different spec resolves. `resolveMigrationPlan`
  then returns the new spec.
- OpenAPI: the test reads the required-route paragraph of
  `openspec/specs/http-api-documentation/spec.md`. The paragraph starts at
  "It SHALL describe every route" and ends before "It SHALL NOT". A regex takes
  each backticked `METHOD /path` pair. Both sides replace a `:name` or `{name}`
  segment with `{}`. The test requires every pair in the document, under its
  path key and method key. It also fails when the paragraph yields no pair.

*Alternative: a hand-kept list of the routes in the test.* Spec and test could
then drift apart without a signal. That is the defect this change fixes. After
the change archives, the spec file stays the stable source.

### D5. One refusal test per A-6 row, beside its valid twin (A-6)

Each row goes where its invariant lives. The refinements of `definition.ts`
cover the terminal step, the timer rules, the pin rules, the outcome rules,
`unmappableStep`, the duplicate step id and the reserved sink `key`. Their
tests go to `test/validate.test.ts`. The length bounds live in `compile.ts`.
Their tests go to `test/compile-validation.test.ts`.

Each test builds its violating body from a body that validates. It changes the
single respect that the invariant names. The valid twin is a second assertion on
the unchanged body. For a length bound, the twin is a string of exactly the
bound.

The implementer first greps the test files for an existing refusal test of each
row. The report names each row that has one. The change adds a test for the other rows only.

*Alternative: one parametrized table test.* It hides the failing invariant
behind a row index. One `test` per row names the invariant.

### D6. The route-auth test parses the table's source (TEST-1)

A new file `test/http-route-auth.test.ts` reads `src/http/server.ts`. It takes
each `method: "X", segments: seg("/path")` pair. It builds the server with
`createServer(createDataSourceRegistry(), createRegistry(), sql,
devHeaderResolver)`. Each `:name` segment becomes `x`. The request has no
header. Every route answers 401, except the members of `EXEMPT`. That map goes
from `"METHOD /path"` to a reason string.

Two self-checks keep the parse honest. The count of parsed rows must equal the
count of `segments: seg(` occurrences in the file. A row of another shape then
fails instead of vanishing. Every `EXEMPT` key must name a parsed row. A stale
exemption then fails.

`EXEMPT` holds `POST /auth/login` and `GET /ui-strings`. The test sends them
nothing. The source holds the login row inside a conditional spread. The parse
still finds it, though a server without a JWT secret never registers it.

The implementer runs the file once with `DATABASE_URL` unset. If every route
still answers 401, the test skips nothing. Otherwise it uses
`test.skipIf(!DB)` like its siblings. The skip floor then rises by the rules of
`push-gate-checks`.

*Alternative: export the route table from `server.ts`.* That reads cleaner but
touches `src/` for the test's sake. The source parse costs one regex and two
self-checks. The table has no other consumer.

*Alternative: a hand-kept route list in the test.* That repeats the defect of
D1.

### D7. The pass floor stays

The change adds tests, so the floor of 5206 stays stale-low, as its header
allows. The implementer reports the new pass count and leaves the file as it is.

## Risks / Trade-offs

- [The route-auth regex breaks when a row changes shape] → The row-count
  self-check fails at that moment. No route leaves the test unnoticed.
- [The OpenAPI test reads a spec file that a rewrite may restructure] → The
  empty-paragraph check fails the test first. The fix stays local to the test.
- [A regenerated example hash hides a real drift] → The implementer first
  recomputes all seven hashes. The implementer records which two differ. A
  third difference stops the task, and a question goes to the coordinator.
- [A mutation proof damages the shared tree] → Every proof runs on a copy under
  `/tmp` in the container. None runs in `/workspace`.
- [An A-6 test passes for another reason than its invariant] → The valid twin
  of D5 shows the reason. The mutation proof removes the check and expects the
  test to fail.

## Migration Plan

Nothing deploys. The change lands as one merge. A revert rolls it back.

## Open Questions

None.
