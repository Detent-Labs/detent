## Why

`src/cel/check.ts` registers every declared data source as a `dyn` CEL variable, so
a guard, mapping, view flag, or timer that reads a data-source `key` type-checks and
publishes cleanly — but the engine resolves data sources **nowhere**
(`eval.ts::buildGuardContext` builds `{data, instance, actor}` only;
`buildOutputContext` builds `{result}` only; nothing in `src/engine/` reads a data
source). The runtime consequence is silent: a guard reading a data source is total-
`false` forever (a wait-state that never advances, reported by nothing), and a
mapping reading one throws inside outbox delivery on every retry before dead-lettering.
This is the last remaining check/eval scope drift — an expression the authoring
check admits that the engine cannot honour.

## What Changes

- Stop registering declared data sources in the CEL type environment
  (`check.ts::buildEnv`), so any CEL expression referencing a data-source `key`
  becomes an `unknown variable: <key>` **publish error** via the existing
  `validateProcessBody` → `CelValidationError` path — no new detection code, no CEL
  identifier extraction.
- **BREAKING** (authoring-time, publish path only): a process body whose CEL
  reads a data source, which published before, now fails to publish. No such body
  could execute correctly today (it parks or throws at runtime), so nothing that
  *worked* breaks; a latent authoring error is surfaced at publish instead of at
  runtime. Stored, already-published bodies are unaffected — the check is on the
  write path, never a `definition.ts` read-path refinement.
- Out of scope, explicitly untouched: the schema-level `dataSources` **declaration**
  and the `field.dataSource` **options-binding** path (used by
  `examples/expense-approval.json`). Runtime option resolution from a data source is
  a separate, unbuilt feature — a presentation gap, not a silent FSM park — and
  keeps publishing.
- Full data-source **resolution** in the engine remains a separate, larger, future
  change. This change closes the drift by forbidding the unusable path until that
  lands.
- Update `CLAUDE.md`: move the "Data sources are checked but never resolved" item out
  of "Decided, not yet built" and record the publish-error boundary as a fact.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `cel-expressions`: data sources are no longer a readable namespace in any CEL
  scope; a CEL reference to a declared data source is a publish error. The timer-
  `deadline` requirement, which withheld data sources as a special case, generalizes
  — every site withholds them now. The runtime guard-evaluation requirement drops
  data-source results from the frozen context it describes.
- `automatic-transitions`: the automatic-guard evaluation context is corrected to
  `{data, instance, actor}` — data-source results are no longer listed as readable.
- `definition-contract`: the data-source-key reserved-namespace requirement keeps its
  behavior (keys unique, not reserved names) but its rationale is corrected — a data
  source is no longer registered as a CEL variable today (a reference is a publish
  error); the key stays reserved for when resolution lands.

## Impact

- `src/cel/check.ts` — remove the data-source registration in `buildEnv`; collapse
  the now-dead `dataSources` scope dimension (the `Site.dataSources` flag, the
  `buildEnv` opt, the `envFor` cache dimension, the deadline site's special
  `dataSources = false`).
- `test/cel.test.ts` — flip "a data source stays visible to a guard on the same step"
  to a rejection; the existing deadline-rejection test still holds (same message, now
  the general rule).
- `openspec/specs/cel-expressions/spec.md` — delta modifying the formal-context,
  timer-deadline, and runtime-guard-evaluation requirements and their data-source
  scenarios.
- `openspec/specs/automatic-transitions/spec.md` and
  `openspec/specs/definition-contract/spec.md` — deltas correcting the guard-context
  enumeration and the reserved-namespace rationale to match (no engine/behavior
  change; spec-text coherence only).
- `CLAUDE.md` — the "Extensibility" / "Decided, not yet built" notes.
- No engine, schema-contract, or migration changes; no runtime behavior change (the
  forbidden expressions never worked at runtime).
