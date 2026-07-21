## Context

CEL validation (`src/cel/check.ts`) type-checks every Expression in a `ProcessBody`
against a per-site type environment. Scope is expressed by which namespaces are
registered, with `unlistedVariablesAreDyn: false`, so an unregistered reference is a
check-time error. `buildEnv` registers declared data sources as `dyn` at every site
except a timer `deadline` — the one site that already withholds them, because the
engine's guard context (`eval.ts::buildGuardContext`) resolves no data source.

That single exception is the tell: no engine context resolves a data source anywhere.
`buildGuardContext` supplies `{data, instance, actor}`; `buildOutputContext` supplies
`{result}`; `buildTransformContext` supplies `{data, instance}`. So a guard reading a
data source evaluates to `false` forever (a silent wait-state park), and a mapping
reading one throws in outbox delivery. The authoring check admits an expression the
engine cannot honour — the last check/eval scope drift, and the one item deliberately
left open when `validateProcessBody` was wired into publish.

## Goals / Non-Goals

**Goals:**
- A CEL expression that references a declared data-source `key` is a **publish**
  error (located, on the write path), not a runtime park or a delivery throw.
- Zero new detection machinery: reuse the existing `unknown variable` check.
- Keep the check/eval scopes identical again — the drift closed.

**Non-Goals:**
- Building data-source **resolution** in the engine (the real feature; a separate,
  larger, future change).
- Touching the `field.dataSource` **options-binding** path or the schema-level
  `dataSources` declaration. Those keep publishing; option resolution is an
  acknowledged separate gap (visible degradation, not a silent FSM park).
- Any engine, schema-contract, or migration change.

## Decisions

**Remove the registration; let the existing machinery reject.** The deadline site
already proves that an unregistered data-source reference yields a clear, located
message — `unknown variable: <key>` — through `validateProcessBody` →
`CelValidationError`. Stopping registration at *every* site makes that the general
rule. No AST identifier extraction, no dedicated scan, no new error type.

- *Alternative — a dedicated publish check that scans for data-source references and
  emits a bespoke message.* Rejected: needs CEL identifier extraction (a machinery
  the repo has explicitly deferred, per roadmap #1), duplicates what removing the
  registration achieves for free, and the generic message is already truthful — from
  the engine's standpoint a data-source reference *is* an unresolvable variable today.

**Collapse the dead `dataSources` scope dimension.** Once nothing registers data
sources, the `Site.dataSources` flag, the `buildEnv` `dataSources` opt, the third
`envFor` cache dimension, and the deadline site's special `dataSources = false` are
all dead flexibility. Remove them so the scope model reads as it now behaves: data
sources are visible nowhere. This keeps the module honest rather than leaving a
plumbing path that suggests a capability that is gone.

- *Alternative — keep the dimension dormant for the future resolution feature.*
  Rejected: dead flexibility for an unbuilt feature. When resolution lands it will
  re-introduce registration deliberately, with its own scope decisions (which sites
  see it, whether a deadline still cannot); reviving a guessed-at shape now is not
  cheaper.

**Placement: publish path only.** The check stays in `validateProcessBody` (invoked
by `definitions.ts::publishBody`), never a `definition.ts` Zod refinement.
`definition.ts` also deserializes stored immutable bodies; a read-path tightening
would make an already-published body throw on read and strand its pinned instances.
Same rule CEL and duration validation already follow.

## Risks / Trade-offs

- *A body that references a data source in CEL and published before now fails to
  publish (BREAKING at authoring time).* → No such body executes correctly today
  (guard parks `false`; mapping throws in delivery), so nothing that *worked* breaks.
  The failure moves from silent-runtime to loud-publish, which is the point. Stored
  bodies are untouched (write-path check).
- *The message names the variable, not "this is a data source."* → Acceptable and
  truthful: the identifier is unresolvable. A bespoke message would cost the deferred
  identifier-extraction machinery for marginal clarity.
- *Someone later re-adds data-source registration for resolution and forgets the
  deadline exclusion.* → The `cel-expressions` spec still records that a deadline's
  context is `{data, instance, actor}` only; the resolution change re-derives site
  scoping from the engine contexts, as this change does.

## Migration Plan

Pure code + spec + doc change. No data migration, no runtime behavior change (the
forbidden expressions never ran successfully). Rollback is a revert; no state to
undo. Deploy is a normal publish of the new engine build — existing published
definitions are unaffected.

## Open Questions

None. The publish-error-vs-resolution fork was already decided (this change takes the
publish-error side); resolution is a tracked separate change.
