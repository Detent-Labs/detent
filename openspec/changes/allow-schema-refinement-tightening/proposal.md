## Why

`src/schema/definition.ts` is both the authoring schema and the deserializer for
stored published bodies. From that pairing the repo derives a hard rule. No
refinement in `definition.ts` may ever tighten. A tightened refinement makes an
already-published body throw on READ, and its pinned instances become
unrehydratable. Every invariant that may tighten therefore lands on the write
path in `src/schema/compile.ts`.

The rule rests on a claim about blast radius. `test/validate.test.ts:681` states
it:

> the resolveBody call sits outside the per-instance try, so one such body would
> starve every other due instance

`openspec/specs/timers/spec.md:437` repeats that claim as spec text. All three
body-resolving workers contradict it.

- `timers.ts:71` opens the per-instance try and `:73` calls `resolveBody`. The
  catch at `:84` logs, pushes the row out of the scan and continues.
- `resolution.ts:89` opens the per-instance try and `:95` calls `resolveBody`.
  The catch at `:109` leaves the instance claimed for lease-expiry retry. Its
  `:90` comment names the containment as deliberate design.
- `outbox.ts:266` resolves inside the per-row try. A resolver miss skips the
  field-type check for that row alone, and delivery still proceeds.

An unrehydratable body parks its own instance. It does not stop a worker.

The rule also costs duplication. The in-flight change
`reject-unsatisfiable-required-readonly` duplicates a writer-set helper into
`compile.ts`, per its `proposal.md:47` and `design.md:38`. It does that only to
keep `definition.ts` untouched. The project is pre-1.0 with nothing deployed. No
published body needs to survive a tightening.

## What Changes

- The read-path risk stops being an automatic veto on schema-layer placement.
  Placement of a new invariant becomes a judgment call. Each invariant argues
  its own placement against two properties that still hold. Those are an
  unbypassable check and a parseable stored body.
- **BREAKING** for the spec, not for any running system. This change withdraws a
  guarantee. A stored body no longer always parses under a later schema. A
  tightening may strand a body published before it. The blast radius is that
  body's own instances.
- This change deletes the false starvation claim from
  `openspec/specs/timers/spec.md`, `test/validate.test.ts` and every code comment
  repeating it.
- The duration requirement in `timers` keeps its publish-path placement. It rests
  on the arming-totality argument that spec already carries at lines 445 to 452.
  This change does not touch that argument.
- Existing checks stay in `compile.ts`. Their placement independently buys an
  unbypassable check, which survives this change.
- Storage immutability and instance pinning stay exactly as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: the governing placement rule. Two passages justify a
  write-path check by the read path, at lines 606 to 609 and 717 to 720. The
  overview repeats that reason at lines 10 to 12. This change withdraws it and
  puts a two-criterion placement rule in its place.
- `timers`: the duration-placement requirement at line 426. Its rationale
  asserts the worker-starvation claim this change refutes. The publish-path
  requirement stands on its other stated ground. The read-path prohibition
  becomes a consequence of the `definition-contract` rule, not an absolute of
  its own.

## Impact

- `.claude/rules/authoring-invariants.md`: the placement paragraph, and each
  invariant citing the read-path reason.
- `.claude/rules/process-contract.md`: the hashing and versioning passage.
- `CLAUDE.md`: the "Stage: pre-1.0" note's second paragraph. It names
  published-version immutability as untouchable, without separating the three
  rules that phrase bundles.
- `openspec/config.yaml`: its `context:` block carries the withdrawn reason
  verbatim.
- Code comments stating the withdrawn reason: `src/schema/definition.ts:149`,
  `:294`, `:503`, and `src/schema/compile.ts:69`.
- `openspec/specs/cel-expressions/spec.md:152` to `:155` stands as written. It
  states a true consequence and never the starvation claim. CEL checking needs
  the CEL library, so a Zod refinement cannot host it either way.
- `test/validate.test.ts:676` to `:690` holds the layering assertion. Its
  write-path half stays and its read-path half goes.
  `test/compile-validation.test.ts:480` and `:575` repeat the reason.
- `reject-unsatisfiable-required-readonly` may drop its duplicated writer-set
  helper once this lands. This change leaves it alone.
- No engine behavior changes. No schema key moves. Every stored body keeps its
  `definitionHash`.
