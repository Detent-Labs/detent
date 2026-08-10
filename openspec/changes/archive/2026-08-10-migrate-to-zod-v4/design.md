## Context

See `proposal.md` for motivation. The long-form brainstorm sits at
`docs/superpowers/specs/2026-08-10-zod-v4-migration-design.md`.

Four facts shape the approach. Each one comes from the installed
`node_modules/zod/v4`, not from the release notes:

1. `ZodEffects` no longer exists. v4 declares `refine` as
   `refine(check, params?): this`. A `.superRefine()`-wrapped object therefore
   stays a `ZodObject` and keeps its `.shape`.
2. `z.ZodTypeDef` and `z.AnyZodObject` are gone.
3. `z.record()` requires both a key schema and a value schema.
4. Default issue messages read differently. v4 writes `Invalid input: expected
   string, received number`. v3 wrote `Expected string, received number`.

The current pin already ships v4 at the `zod/v4` subpath. This design imports
nothing from that path. It names the path because the path made the four facts
above verifiable, with no install.

## Goals / Non-Goals

**Goals:**

- One atomic bump across three manifests, leaving one zod in the workspace.
- Every published `examples/` body keeps its `definitionHash`.
- `config-descriptor.ts` reads v4's node shape rather than v3's `_def`.

**Non-Goals:**

- `z.toJSONSchema()`. v4 ships a JSON Schema converter. Stage 27a wrote
  `config-descriptor.ts` because v3 had none. A replacement costs a changed
  `GET /registry` response shape, and a rewritten studio form generator, on top
  of a migration. The converter is not what v4 broke.
- A custom locale holding v3's issue message wording.
- Any change to what a schema accepts. Every change here adjusts how the code
  writes a schema, or how the code reads one.

## Decisions

**One atomic bump, over a staged move through the `zod/v4` subpath.**

The staged route keeps every intermediate commit green, because 3.25.76 ships
both majors. It costs a period where three packages import from two paths. It
also costs a second pass to remove the subpath. The atomic bump keeps one
lockfile state and one import convention. The suite stays red until the last
fix lands, which one change tolerates.

**An exact pin, over the caret range PR #9 carries.**

`openspec/specs/development-toolchain/spec.md` already requires an exact pin on
a dependency the contract rests on. Its scenario names only the CEL library.
`definitionHash` hashes the parsed body. A zod patch release can therefore
change a published version's identity, with no commit in this repository. The
delta spec adds the scenario that closes the gap.

**All three manifests, over the two PR #9 touches.**

`packages/form-ui` stays on `^3.23.8` in that PR. It imports no zod value. Its
types arrive from `workflow-engine/schema` as `z.infer` types, so a peer range
admitting v3 resolves one type against two zods.

**A range for the peer, over the exact pin the other two take.**

`packages/form-ui` is source-only, and `packages/web` compiles it. Its zod sits
under `peerDependencies`, where a range declares compatibility. The exact pin
belongs where zod resolves, which is the engine root and `packages/web`. Pinning
the peer exactly would contradict the same requirement's own source-only
clause.

**Accept the widening in `config-descriptor.ts`, over suppressing it.**

Fact 1 makes the module's top-level `ZodObject` check pass for a refined config
schema. v3 rejected that schema. Suppressing the widening means reading
`_zod.def.checks` for the sole purpose of reproducing a v3 limitation. The
widening gives an author a form where v3 gave a JSON textarea. The cross-field
rule still runs at publish, through `registry-check.ts`.

**Diagnose cluster D against the compiler, over guessing now.**

`src/engine/migration.ts`, `src/engine/outbox.ts` and `src/runtime/api.ts` read
no Zod internal. Their errors follow from inference through the schemas that
clusters A and B change. The likeliest cause is `z.record` over the branded id
types. The task list orders those three last, so the compiler names each one.

## Risks / Trade-offs

**A shifted `definitionHash` stops every pinned instance rehydrating.**

v4 parse output can differ from v3 by one key. `.strict()` handling,
`.default()` application and optional-key presence are the three candidates.

Mitigation: `test/view-layout-hash.test.ts` pins each `examples/` body to its
hash, and runs on every suite run. It passes with its expected hashes
unedited, or the migration is wrong. Watch for one shortcut: editing a
recorded hash to make the test pass. The delta spec states the rule.

**A 422 body carries v4's message text.**

An integration that string-matches a message breaks.

Mitigation: no reader in this repository matches on a zod issue `code`, and
`docs/openapi.yaml` describes the envelope rather than the text. The change
accepts the new wording and records it in the proposal.

**The suite stays red mid-change.**

Mitigation: the clusters run in dependency order. Each task ends at a compiler
state the next one reads.

**The studio plugin config form renders types it never rendered.**

A unit test cannot see a form that draws wrong.

Mitigation: a browser pass covers it. `docs/browser-checks.md` records what
stays manual.

## Migration Plan

No data migration. No schema change, so no instance moves version.

Deployment is an ordinary build. Rollback is a revert of the change. The pin
returns to 3.25.76, and no stored row changed shape.

PR #9 closes when this change lands. ROADMAP stage 28 moves to DONE in the same
commit.

## Open Questions

**What makes `migration.ts`, `outbox.ts` and `api.ts` fail?** None of the three
reads a Zod internal. The errors follow from inference through the schemas that
clusters A and B change. The likeliest cause is `z.record` over the branded id
types. Task 6.1 answers this from real compiler output. The answer changes no
spec and no other task, because every fix lands at the schema that produces the
inference.

**Does `describeString` still reach a string format check?** v4 restructures
string formats. `z.string().email()` carries a deprecation in favour of
`z.email()`. Whether the descriptor's `format: "email"` still derives from a
check on the same node, or from a node type, resolves at task 5.1. Either
answer keeps the descriptor shape, so `GET /registry` and the studio form stay
as they are.
